-- Trackly — 0010: LGPD — registro de consentimento + solicitações do titular (evidência)
--
-- APLICAR DEPOIS da 0009. Migration ADITIVA, numa única transação (`begin; ... commit;`).
-- Reexecutável: `create table if not exists`, `create or replace function`, `drop policy if exists`.
-- Não altera nem apaga nenhuma tabela/linha existente.
--
-- POR QUE EXISTE (docs/lgpd.md)
--   O app coleta dados pessoais SENSÍVEIS (LGPD art. 5º, II — saúde: peso, medidas, fotos do
--   corpo, dieta, treino). Pra esses dados a base legal usada é o consentimento ESPECÍFICO e
--   DESTACADO do titular (art. 11, I), e quem trata precisa PROVAR que o obteve (art. 8º, §2º).
--   Até aqui não existia registro nenhum disso, nem canal pro titular exercer os direitos do
--   art. 18 (acesso, correção, exclusão, portabilidade, revogação).
--
-- O QUE FAZ
--   1. `consent_records` — log APPEND-ONLY de aceite/revogação, por finalidade e versão do
--      documento. Revogar = nova linha com action='revoked' (nunca UPDATE/DELETE). Sem FK pra
--      auth.users/clients DE PROPÓSITO: a prova de consentimento precisa sobreviver à exclusão
--      do titular (art. 16, I — guarda pra cumprimento de obrigação legal / defesa em processo).
--   2. `data_subject_requests` — solicitações do titular (art. 18) com status e resposta.
--      Mesmo motivo pra não ter FK: o registro de que a exclusão foi pedida E atendida é a
--      evidência de conformidade e precisa existir depois que os dados forem apagados.
--   3. RPCs `security definer` que derivam quem é o titular a partir de `auth.uid()` — o
--      cliente nunca informa user_id/account_id/client_id, então não dá pra registrar
--      consentimento ou pedido em nome de outra pessoa.
--
-- Escrita direta nas duas tabelas: NENHUMA policy de INSERT/UPDATE/DELETE pra `authenticated`.
-- Só as RPCs abaixo (ou a service role, no cadastro do coach, antes de existir sessão) gravam.

begin;

-- ============================================================================
-- 1. consent_records
-- ============================================================================

create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject_role text not null check (subject_role in ('coach', 'client')),
  account_id uuid,
  client_id uuid,
  purpose text not null check (purpose in (
    'terms_of_use',       -- Termos de Uso (coach) — inclui o papel de controlador dos dados dos alunos
    'privacy_policy',     -- Política de Privacidade (coach e aluno)
    'health_data'         -- consentimento específico e destacado pra dados de saúde (art. 11, I)
  )),
  document_version text not null,
  action text not null check (action in ('granted', 'revoked')),
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists consent_records_user_idx on consent_records(user_id, purpose, created_at desc);
create index if not exists consent_records_account_idx on consent_records(account_id);

alter table consent_records enable row level security;

drop policy if exists consent_records_self_read on consent_records;
create policy consent_records_self_read on consent_records for select
  using (user_id = (select auth.uid()));

-- O coach é o CONTROLADOR dos dados dos alunos dele: precisa conseguir provar o consentimento.
drop policy if exists consent_records_coach_read on consent_records;
create policy consent_records_coach_read on consent_records for select
  using (account_id = private.current_account_id());

-- ============================================================================
-- 2. data_subject_requests
-- ============================================================================

create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null,
  requester_role text not null check (requester_role in ('coach', 'client')),
  account_id uuid,
  client_id uuid,
  -- snapshot do nome: depois da exclusão não existe mais `clients.name` pra mostrar.
  requester_name text,
  request_type text not null check (request_type in (
    'access', 'correction', 'deletion', 'portability', 'consent_revocation', 'other'
  )),
  details text check (details is null or length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'rejected')),
  response text check (response is null or length(response) <= 2000),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dsr_account_idx on data_subject_requests(account_id, status, created_at desc);
create index if not exists dsr_requester_idx on data_subject_requests(requester_user_id, created_at desc);

alter table data_subject_requests enable row level security;

drop policy if exists dsr_self_read on data_subject_requests;
create policy dsr_self_read on data_subject_requests for select
  using (requester_user_id = (select auth.uid()));

drop policy if exists dsr_coach_read on data_subject_requests;
create policy dsr_coach_read on data_subject_requests for select
  using (account_id = private.current_account_id() and requester_role = 'client');

-- ============================================================================
-- 3. RPCs
-- ============================================================================

-- Resolve o titular autenticado: coach (coach_users) ou aluno (clients.auth_user_id).
create or replace function private.current_subject()
returns table (role text, account_id uuid, client_id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  select 'coach'::text, cu.account_id, null::uuid, cu.name
  from coach_users cu where cu.id = (select auth.uid())
  union all
  select 'client'::text, c.account_id, c.id, c.name
  from clients c where c.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.record_consent(
  p_purposes text[],
  p_version text,
  p_action text,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  if (select auth.uid()) is null then
    raise exception 'trackly:not_authenticated' using errcode = '42501';
  end if;
  select * into s from private.current_subject();
  if s.role is null then
    raise exception 'trackly:no_subject' using errcode = '42501';
  end if;
  if p_action not in ('granted', 'revoked') or coalesce(length(p_version), 0) = 0 then
    raise exception 'trackly:invalid_consent' using errcode = '22023';
  end if;

  insert into consent_records (user_id, subject_role, account_id, client_id, purpose,
                               document_version, action, ip_address, user_agent)
  select (select auth.uid()), s.role, s.account_id, s.client_id, purpose,
         p_version, p_action, left(p_ip, 64), left(p_user_agent, 400)
  from unnest(p_purposes) as purpose;
end;
$$;

create or replace function public.create_data_subject_request(
  p_type text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  new_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'trackly:not_authenticated' using errcode = '42501';
  end if;
  select * into s from private.current_subject();
  if s.role is null then
    raise exception 'trackly:no_subject' using errcode = '42501';
  end if;

  insert into data_subject_requests (requester_user_id, requester_role, account_id, client_id,
                                     requester_name, request_type, details)
  values ((select auth.uid()), s.role, s.account_id, s.client_id, s.name, p_type,
          nullif(trim(p_details), ''))
  returning id into new_id;
  return new_id;
end;
$$;

-- Só o coach da conta resolve pedidos de ALUNOS dela (ele é o controlador). Pedidos do próprio
-- coach (role='coach') são atendidos pelo Trackly (operador/controlador da conta) fora do app.
create or replace function public.resolve_data_subject_request(
  p_id uuid,
  p_status text,
  p_response text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('in_progress', 'completed', 'rejected') then
    raise exception 'trackly:invalid_status' using errcode = '22023';
  end if;
  if p_status = 'rejected' and coalesce(length(trim(p_response)), 0) = 0 then
    -- art. 18, §4º: recusa precisa ser justificada ao titular.
    raise exception 'trackly:rejection_needs_reason' using errcode = '22023';
  end if;

  update data_subject_requests
     set status = p_status,
         response = coalesce(nullif(trim(p_response), ''), response),
         resolved_by = case when p_status in ('completed', 'rejected') then (select auth.uid()) else resolved_by end,
         resolved_at = case when p_status in ('completed', 'rejected') then now() else resolved_at end
   where id = p_id
     and requester_role = 'client'
     and account_id = private.current_account_id();

  if not found then
    raise exception 'trackly:not_found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.record_consent(text[], text, text, text, text) from public, anon;
revoke all on function public.create_data_subject_request(text, text) from public, anon;
revoke all on function public.resolve_data_subject_request(uuid, text, text) from public, anon;
grant execute on function public.record_consent(text[], text, text, text, text) to authenticated;
grant execute on function public.create_data_subject_request(text, text) to authenticated;
grant execute on function public.resolve_data_subject_request(uuid, text, text) to authenticated;

commit;
