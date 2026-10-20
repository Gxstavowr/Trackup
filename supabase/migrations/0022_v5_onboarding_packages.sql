-- Trackly — 0022: V5 Fases 2–4 — pacotes de serviço do aluno, contrato com histórico, questionário
-- inicial, eventos do onboarding e liberação de módulos por pacote.
--
-- APLICAR DEPOIS da 0021, pelo runner (`node scripts/migrate.mjs apply`, a partir de web/), que já
-- envolve o arquivo numa transação junto com o registro no histórico — por isso este arquivo NÃO
-- tem begin/commit próprios. ADITIVA e reexecutável (create ... if not exists, create or replace,
-- drop policy/trigger if exists antes de recriar, constraints atrás de guarda). Não apaga nem
-- reescreve nenhuma linha existente. Nenhum segredo. Plano completo: docs/v5-plano-dados.md.
--
-- O QUE FAZ
--   A) clients: `onboarding_required` (aluno criado pelo fluxo V5 passa pelo questionário; os
--      atuais ficam `false` = legado, nada muda pra eles) e `birth_date` (idade sem envelhecer).
--      Índice único (conta, e-mail) — evita aluno duplicado ao repetir convite (só se não houver
--      duplicata hoje; senão NOTICE e segue).
--   B) coach_service_prices: preço PADRÃO do coach por pacote (Treino / Nutrição / Híbrido).
--   C) client_service_contracts: contrato do aluno (pacote + valor) APPEND-ONLY, com histórico de
--      mudanças (valor anterior, novo, vigência, motivo, "acordado com o aluno", confirmação do
--      aluno). Escrita só por funções (nenhum INSERT/UPDATE/DELETE direto pela API).
--   D) onboarding_questionnaires: questionário inicial (rascunho salvo no servidor + envio), respostas
--      comuns e sensíveis em colunas separadas, prazo do protocolo calculado no envio (3 dias).
--   E) client_onboarding_events: trilha de eventos do onboarding (convite, conta, questionário,
--      pacote, publicação por módulo, protocolo concluído). Append-only.
--   F) Funções auxiliares (schema private) + RPCs (schema public) — ver cada bloco.
--   G) View `client_onboarding_status` (security_invoker): tudo que a fila/jornada precisa, SEM
--      respostas do questionário.
--   H) RLS do aluno em workout_plans / nutrition_plans: além de publicado, o módulo precisa fazer
--      parte do pacote (aluno sem contrato = legado = tudo como hoje).
--   I) notifications.event_type: + invite_accepted, questionnaire_submitted, protocol_ready,
--      package_changed (superconjunto do CHECK atual — nenhuma linha pode violar).
--
-- NÃO MISTURA com a mensalidade do coach ao Trackly (coach_billing_*, 0021) nem altera
-- `subscriptions`/`payments` (controle financeiro do coach com o aluno): o contrato é o ACORDO;
-- cobranças existentes nunca são reescritas.

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ============================================================================
-- A) clients
-- ============================================================================

alter table public.clients
  add column if not exists onboarding_required boolean not null default false,
  add column if not exists birth_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_birth_date_check' and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients add constraint clients_birth_date_check
      check (birth_date is null or birth_date >= date '1900-01-01');
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.clients
    where email is not null and btrim(email) <> ''
    group by account_id, lower(btrim(email))
    having count(*) > 1
  ) then
    raise notice '0022: ha alunos com o mesmo e-mail na mesma conta — indice unico (conta, e-mail) NAO criado. Resolva as duplicatas e rode este bloco de novo.';
  else
    create unique index if not exists clients_account_email_uidx
      on public.clients(account_id, lower(btrim(email)))
      where email is not null and btrim(email) <> '';
  end if;
end $$;

-- ============================================================================
-- B) coach_service_prices — preço padrão por pacote (por conta)
-- ============================================================================

create table if not exists public.coach_service_prices (
  account_id uuid not null references public.accounts(id) on delete cascade,
  package text not null check (package in ('training', 'nutrition', 'hybrid')),
  price_cents integer not null check (price_cents > 0 and price_cents <= 10000000),
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'quarterly', 'semiannual', 'annual')),
  updated_by uuid references public.coach_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, package)
);

drop trigger if exists coach_service_prices_touch on public.coach_service_prices;
create trigger coach_service_prices_touch
  before update on public.coach_service_prices
  for each row execute function private.coach_billing_touch_updated_at();

alter table public.coach_service_prices enable row level security;

drop policy if exists coach_service_prices_coach_full_access on public.coach_service_prices;
create policy coach_service_prices_coach_full_access on public.coach_service_prices
  for all to authenticated
  using (account_id = (select private.current_account_id()))
  with check (account_id = (select private.current_account_id()));

-- revoke de tudo antes do grant: o default privilege do Supabase daria TRUNCATE/REFERENCES/TRIGGER
-- ao authenticated (TRUNCATE ignora RLS).
revoke all on public.coach_service_prices from anon, authenticated;
grant select, insert, update, delete on public.coach_service_prices to authenticated;

-- ============================================================================
-- C) client_service_contracts — contrato do aluno, append-only
-- ============================================================================
-- Contrato VIGENTE = a linha não anulada com o maior effective_from <= hoje (America/Sao_Paulo).
-- Mudança agendada = linha com effective_from > hoje (no máximo uma por vez). Linhas nunca são
-- editadas, exceto: anular uma mudança AINDA NÃO VIGENTE (voided_*) e a resposta do aluno
-- (client_confirmation/client_responded_at). Tudo via funções da seção F.

create table if not exists public.client_service_contracts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('initial', 'change')),
  package text not null check (package in ('training', 'nutrition', 'hybrid')),
  price_cents integer not null check (price_cents >= 0 and price_cents <= 10000000),
  billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'quarterly', 'semiannual', 'annual')),
  -- 'coach_default' = igual ao preço padrão do coach no momento; 'custom' = negociado.
  price_source text not null check (price_source in ('coach_default', 'custom')),
  effective_from date not null,
  -- Snapshot do contrato anterior (kind = 'change'): o histórico se lê sem join.
  -- NO ACTION (padrão), não RESTRICT: apagar o aluno (LGPD) apaga todos os contratos dele na mesma
  -- cascata; RESTRICT checaria no meio da cascata e travaria.
  previous_contract_id uuid references public.client_service_contracts(id),
  previous_package text check (previous_package in ('training', 'nutrition', 'hybrid')),
  previous_price_cents integer,
  previous_billing_period text,
  change_reason text check (change_reason is null or char_length(change_reason) <= 500),
  agreed_with_client boolean not null default false,
  client_confirmation text not null default 'not_required'
    check (client_confirmation in ('not_required', 'pending', 'confirmed', 'declined')),
  client_responded_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.coach_users(id) on delete set null,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_by uuid references public.coach_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_service_contracts_change_shape check (
    (kind = 'initial' and previous_contract_id is null)
    or (kind = 'change' and previous_contract_id is not null and previous_package is not null
        and previous_price_cents is not null)
  )
);

create unique index if not exists client_service_contracts_one_per_date_uidx
  on public.client_service_contracts(client_id, effective_from)
  where voided_at is null;
create index if not exists client_service_contracts_client_idx
  on public.client_service_contracts(client_id, effective_from desc);
create index if not exists client_service_contracts_account_idx
  on public.client_service_contracts(account_id);

alter table public.client_service_contracts enable row level security;

-- Coach da conta LÊ; ninguém escreve pela API. O aluno lê o próprio pacote por
-- `get_my_service_package()` (sem motivo interno / autor).
drop policy if exists client_service_contracts_coach_read on public.client_service_contracts;
create policy client_service_contracts_coach_read on public.client_service_contracts
  for select to authenticated
  using (private.is_coach_of_client(client_id));

revoke all on public.client_service_contracts from anon, authenticated;
grant select on public.client_service_contracts to authenticated;

-- ============================================================================
-- D) onboarding_questionnaires — questionário inicial
-- ============================================================================
-- A ESTRUTURA das perguntas vive em código (web/lib/onboarding/questionnaire-catalog.ts, versionada
-- por `catalog_version`), como o catálogo do check-in. O banco guarda as respostas por chave.
-- `sensitive_answers` = chaves marcadas `sensitive` no catálogo (saúde: lesões, doenças,
-- medicamentos, ciclo, etc.) — nunca selecionadas por fila/dashboard/admin.

create table if not exists public.onboarding_questionnaires (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  catalog_version text not null check (char_length(catalog_version) between 1 and 40),
  -- Pacote no momento em que o questionário foi aberto (null = aluno legado sem contrato).
  package text check (package in ('training', 'nutrition', 'hybrid')),
  sections text[] not null default array['common']::text[]
    check (sections <@ array['common', 'training', 'nutrition']::text[]),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 65536),
  sensitive_answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(sensitive_answers) = 'object' and octet_length(sensitive_answers::text) <= 32768),
  current_step text check (current_step is null or char_length(current_step) <= 60),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  protocol_due_at timestamptz,
  coach_opened_at timestamptz,
  constraint onboarding_questionnaires_submit_shape check (
    (status = 'draft' and submitted_at is null and protocol_due_at is null)
    or (status = 'submitted' and submitted_at is not null and protocol_due_at is not null)
  )
);

create unique index if not exists onboarding_questionnaires_one_draft_uidx
  on public.onboarding_questionnaires(client_id) where status = 'draft';
create index if not exists onboarding_questionnaires_client_idx
  on public.onboarding_questionnaires(client_id, submitted_at desc nulls last);
create index if not exists onboarding_questionnaires_queue_idx
  on public.onboarding_questionnaires(account_id, status, submitted_at);

alter table public.onboarding_questionnaires enable row level security;

drop policy if exists onboarding_questionnaires_coach_read on public.onboarding_questionnaires;
create policy onboarding_questionnaires_coach_read on public.onboarding_questionnaires
  for select to authenticated
  using (private.is_coach_of_client(client_id));

drop policy if exists onboarding_questionnaires_client_read on public.onboarding_questionnaires;
create policy onboarding_questionnaires_client_read on public.onboarding_questionnaires
  for select to authenticated
  using (client_id = (select private.current_client_id()));

revoke all on public.onboarding_questionnaires from anon, authenticated;
grant select on public.onboarding_questionnaires to authenticated;

-- ============================================================================
-- E) client_onboarding_events — trilha append-only
-- ============================================================================

create table if not exists public.client_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  event text not null check (event in (
    'invite_created', 'invite_sent', 'invite_send_failed', 'invite_link_copied', 'invite_accepted',
    'account_activated',
    'questionnaire_started', 'questionnaire_submitted', 'questionnaire_opened',
    'package_set', 'package_change_scheduled', 'package_change_voided', 'package_change_responded',
    'module_published', 'protocol_completed'
  )),
  module text check (module in ('training', 'nutrition')),
  actor text not null check (actor in ('coach', 'client', 'system')),
  -- Sem FK de propósito (trilha de auditoria sobrevive ao usuário).
  actor_user_id uuid,
  -- E-mail de destino (só eventos de convite) — o coach precisa ver "enviado para X".
  sent_to text check (sent_to is null or char_length(sent_to) <= 320),
  -- true = ação de demonstração/simulação (laboratório): nada saiu de verdade.
  simulated boolean not null default false,
  -- Só dado NÃO sensível (ids, códigos de erro, pacote). Nunca respostas do questionário.
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  occurred_at timestamptz not null default now()
);

create index if not exists client_onboarding_events_client_idx
  on public.client_onboarding_events(client_id, occurred_at desc);
create index if not exists client_onboarding_events_account_idx
  on public.client_onboarding_events(account_id, occurred_at desc);
create index if not exists client_onboarding_events_client_event_idx
  on public.client_onboarding_events(client_id, event);

alter table public.client_onboarding_events enable row level security;

drop policy if exists client_onboarding_events_coach_read on public.client_onboarding_events;
create policy client_onboarding_events_coach_read on public.client_onboarding_events
  for select to authenticated
  using (private.is_coach_of_client(client_id));

-- O coach registra SÓ os eventos de convite que a própria ação dele produz (envio/falha/cópia do
-- link), como ele mesmo e na própria conta. O resto nasce de triggers/funções (security definer)
-- ou da service role (aceite em /convite).
drop policy if exists client_onboarding_events_coach_insert_invite on public.client_onboarding_events;
create policy client_onboarding_events_coach_insert_invite on public.client_onboarding_events
  for insert to authenticated
  with check (
    private.is_coach_of_client(client_id)
    and account_id = (select private.current_account_id())
    and actor = 'coach'
    and actor_user_id = (select auth.uid())
    and event in ('invite_sent', 'invite_send_failed', 'invite_link_copied')
  );

revoke all on public.client_onboarding_events from anon, authenticated;
grant select, insert on public.client_onboarding_events to authenticated;

-- ============================================================================
-- F) Funções auxiliares (private) — SQL puro (validadas na criação)
-- ============================================================================

-- "Hoje" no fuso do produto (mesma referência de todayDateSP em web/lib/portal-today.ts).
create or replace function private.today_sp()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create or replace function private.package_includes(p_package text, p_module text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_package = 'hybrid' or p_package = p_module
$$;

create or replace function private.client_current_contract_id(p_client uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select x.id
  from client_service_contracts x
  where x.client_id = p_client
    and x.voided_at is null
    and x.effective_from <= private.today_sp()
  order by x.effective_from desc, x.created_at desc
  limit 1
$$;

-- Pacote vigente; NULL = aluno legado (sem contrato).
create or replace function private.client_package(p_client uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select x.package from client_service_contracts x
  where x.id = private.client_current_contract_id(p_client)
$$;

-- O módulo faz parte do pacote vigente? Sem contrato (legado) = true (comportamento de hoje).
create or replace function private.client_has_module(p_client uuid, p_module text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(private.package_includes(private.client_package(p_client), p_module), true)
$$;

-- Há plano PUBLICADO ATIVO do módulo (mesma regra do app: não rascunho, não template, não arquivado).
create or replace function private.client_module_published(p_client uuid, p_module text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case p_module
    when 'training' then exists (
      select 1 from workout_plans wp
      where wp.client_id = p_client and not wp.is_draft and not wp.is_template and wp.archived_at is null)
    when 'nutrition' then exists (
      select 1 from nutrition_plans np
      where np.client_id = p_client and not np.is_draft and not np.is_template and np.archived_at is null)
    else false
  end
$$;

-- Ator do evento a partir da sessão: coach da conta do aluno, o próprio aluno, ou sistema
-- (service role / SQL Editor, auth.uid() nulo).
create or replace function private.onboarding_actor(p_client uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when (select auth.uid()) is null then 'system'
    when exists (select 1 from clients c where c.id = p_client and c.auth_user_id = (select auth.uid())) then 'client'
    when private.is_coach_of_client(p_client) then 'coach'
    else 'system'
  end
$$;

revoke all on function private.today_sp() from public, anon;
revoke all on function private.package_includes(text, text) from public, anon;
revoke all on function private.client_current_contract_id(uuid) from public, anon;
revoke all on function private.client_package(uuid) from public, anon;
revoke all on function private.client_has_module(uuid, text) from public, anon;
revoke all on function private.client_module_published(uuid, text) from public, anon;
revoke all on function private.onboarding_actor(uuid) from public, anon;
-- Usadas dentro de policies avaliadas como `authenticated` (mesmo padrão das demais de private).
grant execute on function private.today_sp() to authenticated;
grant execute on function private.package_includes(text, text) to authenticated;
grant execute on function private.client_current_contract_id(uuid) to authenticated;
grant execute on function private.client_package(uuid) to authenticated;
grant execute on function private.client_has_module(uuid, text) to authenticated;

-- ============================================================================
-- F2) Triggers de eventos do sistema
-- ============================================================================

-- clients: criação (convite criado) e vínculo do login (conta ativada).
create or replace function private.onboarding_on_client_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
    values (new.account_id, new.id, 'invite_created',
            case when (select auth.uid()) is null then 'system' else 'coach' end,
            (select auth.uid()),
            jsonb_build_object('onboarding_required', new.onboarding_required));
  elsif old.auth_user_id is null and new.auth_user_id is not null then
    insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id)
    values (new.account_id, new.id, 'account_activated', 'system', (select auth.uid()));
  end if;
  return null;
end;
$$;

drop trigger if exists clients_onboarding_events on public.clients;
create trigger clients_onboarding_events
  after insert or update of auth_user_id on public.clients
  for each row execute function private.onboarding_on_client_change();

-- workout_plans / nutrition_plans: publicação de um módulo (rascunho -> publicado, ou insert já
-- publicado) e, quando todos os módulos do pacote ficam publicados, "protocolo concluído" (uma vez).
create or replace function private.onboarding_on_plan_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := tg_argv[0];
  v_account uuid;
  v_package text;
begin
  if new.client_id is null or new.is_template or new.is_draft or new.archived_at is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and not old.is_draft then
    return null;
  end if;

  select c.account_id into v_account from clients c where c.id = new.client_id;
  if v_account is null then
    return null;
  end if;

  insert into client_onboarding_events (account_id, client_id, event, module, actor, actor_user_id, detail)
  values (v_account, new.client_id, 'module_published', v_module,
          private.onboarding_actor(new.client_id), (select auth.uid()),
          jsonb_build_object('plan_id', new.id));

  v_package := private.client_package(new.client_id);
  if v_package is not null
     and (not private.package_includes(v_package, 'training')
          or private.client_module_published(new.client_id, 'training'))
     and (not private.package_includes(v_package, 'nutrition')
          or private.client_module_published(new.client_id, 'nutrition'))
     and not exists (
       select 1 from client_onboarding_events e
       where e.client_id = new.client_id and e.event = 'protocol_completed')
  then
    insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
    values (v_account, new.client_id, 'protocol_completed',
            private.onboarding_actor(new.client_id), (select auth.uid()),
            jsonb_build_object('package', v_package));
  end if;

  return null;
end;
$$;

drop trigger if exists workout_plans_onboarding_published on public.workout_plans;
create trigger workout_plans_onboarding_published
  after insert or update of is_draft on public.workout_plans
  for each row execute function private.onboarding_on_plan_published('training');

drop trigger if exists nutrition_plans_onboarding_published on public.nutrition_plans;
create trigger nutrition_plans_onboarding_published
  after insert or update of is_draft on public.nutrition_plans
  for each row execute function private.onboarding_on_plan_published('nutrition');

revoke all on function private.onboarding_on_client_change() from public, anon, authenticated;
revoke all on function private.onboarding_on_plan_published() from public, anon, authenticated;

-- ============================================================================
-- F3) RPCs do COACH — pacote/contrato (security definer + checagem explícita)
-- ============================================================================
-- Erros de negócio: `raise exception 'trackly:<codigo>'` (o app traduz, como na 0007/0008).

-- Preço padrão vigente do coach pra um pacote (null = não configurado).
create or replace function private.coach_default_price(p_account uuid, p_package text)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select price_cents from coach_service_prices where account_id = p_account and package = p_package
$$;
revoke all on function private.coach_default_price(uuid, text) from public, anon, authenticated;

-- Novo aluno pelo fluxo V5: cria o cadastro (convite pendente, onboarding obrigatório) + contrato
-- inicial numa transação só. `p_save_as_default` grava o preço como padrão do pacote quando o coach
-- ainda não tinha um (item 7: "definir antes de concluir o convite"); nunca sobrescreve um existente.
create or replace function public.create_invited_client(
  p_name text,
  p_email text,
  p_phone text,
  p_package text,
  p_price_cents integer,
  p_billing_period text default 'monthly',
  p_save_as_default boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid := private.current_account_id();
  v_coach uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_default integer;
  v_client uuid;
begin
  if v_account is null or v_coach is null then
    raise exception 'trackly:forbidden';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'trackly:invalid_name';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 320 then
    raise exception 'trackly:invalid_email';
  end if;
  if v_phone is not null and char_length(v_phone) > 25 then
    raise exception 'trackly:invalid_phone';
  end if;
  if p_package is null or p_package not in ('training', 'nutrition', 'hybrid') then
    raise exception 'trackly:invalid_package';
  end if;
  if p_billing_period is null or p_billing_period not in ('monthly', 'quarterly', 'semiannual', 'annual') then
    raise exception 'trackly:invalid_period';
  end if;
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000 then
    raise exception 'trackly:invalid_price';
  end if;
  if exists (
    select 1 from clients c
    where c.account_id = v_account and c.email is not null and lower(btrim(c.email)) = v_email
  ) then
    -- O app oferece "retomar/reenviar o convite" do cadastro existente em vez de duplicar.
    raise exception 'trackly:client_email_exists';
  end if;

  v_default := private.coach_default_price(v_account, p_package);
  if v_default is null and p_save_as_default and p_price_cents > 0 then
    insert into coach_service_prices (account_id, package, price_cents, billing_period, updated_by)
    values (v_account, p_package, p_price_cents, p_billing_period, v_coach)
    on conflict (account_id, package) do nothing;
    v_default := p_price_cents;
  end if;

  insert into clients (account_id, coach_id, name, email, phone, invite_status, onboarding_required)
  values (v_account, v_coach, v_name, v_email, v_phone, 'pending', true)
  returning id into v_client;

  insert into client_service_contracts (
    account_id, client_id, kind, package, price_cents, billing_period, price_source,
    effective_from, created_by)
  values (
    v_account, v_client, 'initial', p_package, p_price_cents, p_billing_period,
    case when v_default is not null and v_default = p_price_cents then 'coach_default' else 'custom' end,
    private.today_sp(), v_coach);

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_account, v_client, 'package_set', 'coach', v_coach,
          jsonb_build_object('package', p_package, 'price_cents', p_price_cents, 'billing_period', p_billing_period));

  return v_client;
end;
$$;

-- Registrar o pacote de um aluno que ainda não tem contrato (legado). Atenção: a partir daí os
-- módulos fora do pacote ficam bloqueados para ele.
create or replace function public.set_initial_client_contract(
  p_client_id uuid,
  p_package text,
  p_price_cents integer,
  p_billing_period text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  v_coach uuid := (select auth.uid());
  v_default integer;
  v_id uuid;
begin
  if not private.is_coach_of_client(p_client_id) then
    raise exception 'trackly:forbidden';
  end if;
  if p_package is null or p_package not in ('training', 'nutrition', 'hybrid') then
    raise exception 'trackly:invalid_package';
  end if;
  if p_billing_period is null or p_billing_period not in ('monthly', 'quarterly', 'semiannual', 'annual') then
    raise exception 'trackly:invalid_period';
  end if;
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000 then
    raise exception 'trackly:invalid_price';
  end if;

  select c.account_id into v_account from clients c where c.id = p_client_id for update;
  if exists (select 1 from client_service_contracts x where x.client_id = p_client_id and x.voided_at is null) then
    raise exception 'trackly:contract_exists';
  end if;

  v_default := private.coach_default_price(v_account, p_package);
  insert into client_service_contracts (
    account_id, client_id, kind, package, price_cents, billing_period, price_source,
    effective_from, created_by)
  values (
    v_account, p_client_id, 'initial', p_package, p_price_cents, p_billing_period,
    case when v_default is not null and v_default = p_price_cents then 'coach_default' else 'custom' end,
    private.today_sp(), v_coach)
  returning id into v_id;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_account, p_client_id, 'package_set', 'coach', v_coach,
          jsonb_build_object('package', p_package, 'price_cents', p_price_cents, 'contract_id', v_id));
  return v_id;
end;
$$;

-- Mudança EXPLÍCITA de pacote/valor. Nunca retroativa (vigência >= hoje). Grava o anterior.
-- Uma mudança agendada por vez (anule a pendente antes de agendar outra).
create or replace function public.change_client_contract(
  p_client_id uuid,
  p_package text,
  p_price_cents integer,
  p_billing_period text,
  p_effective_from date,
  p_reason text,
  p_agreed_with_client boolean,
  p_require_client_confirmation boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid := (select auth.uid());
  v_account uuid;
  v_today date := private.today_sp();
  v_prev client_service_contracts%rowtype;
  v_default integer;
  v_id uuid;
begin
  if not private.is_coach_of_client(p_client_id) then
    raise exception 'trackly:forbidden';
  end if;
  if p_package is null or p_package not in ('training', 'nutrition', 'hybrid') then
    raise exception 'trackly:invalid_package';
  end if;
  if p_billing_period is null or p_billing_period not in ('monthly', 'quarterly', 'semiannual', 'annual') then
    raise exception 'trackly:invalid_period';
  end if;
  if p_price_cents is null or p_price_cents < 0 or p_price_cents > 10000000 then
    raise exception 'trackly:invalid_price';
  end if;
  if p_effective_from is null or p_effective_from < v_today then
    raise exception 'trackly:retroactive_change';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'trackly:reason_too_long';
  end if;

  -- Serializa mudanças concorrentes do mesmo aluno.
  select c.account_id into v_account from clients c where c.id = p_client_id for update;

  select * into v_prev from client_service_contracts x
  where x.id = private.client_current_contract_id(p_client_id);
  if not found then
    raise exception 'trackly:no_contract';
  end if;
  if exists (
    select 1 from client_service_contracts x
    where x.client_id = p_client_id and x.voided_at is null and x.effective_from > v_today
  ) then
    raise exception 'trackly:change_already_scheduled';
  end if;
  if v_prev.package = p_package and v_prev.price_cents = p_price_cents
     and v_prev.billing_period = p_billing_period then
    raise exception 'trackly:no_change';
  end if;
  if exists (
    select 1 from client_service_contracts x
    where x.client_id = p_client_id and x.voided_at is null and x.effective_from = p_effective_from
  ) then
    -- Já existe contrato que começou hoje (ex.: criado hoje): agende a partir de amanhã.
    raise exception 'trackly:same_day_change';
  end if;

  v_default := private.coach_default_price(v_account, p_package);
  insert into client_service_contracts (
    account_id, client_id, kind, package, price_cents, billing_period, price_source,
    effective_from, previous_contract_id, previous_package, previous_price_cents,
    previous_billing_period, change_reason, agreed_with_client, client_confirmation, created_by)
  values (
    v_account, p_client_id, 'change', p_package, p_price_cents, p_billing_period,
    case when v_default is not null and v_default = p_price_cents then 'coach_default' else 'custom' end,
    p_effective_from, v_prev.id, v_prev.package, v_prev.price_cents, v_prev.billing_period,
    nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_agreed_with_client, false),
    case when p_require_client_confirmation then 'pending' else 'not_required' end, v_coach)
  returning id into v_id;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_account, p_client_id, 'package_change_scheduled', 'coach', v_coach,
          jsonb_build_object('contract_id', v_id, 'from_package', v_prev.package, 'to_package', p_package,
                             'from_price_cents', v_prev.price_cents, 'to_price_cents', p_price_cents,
                             'effective_from', p_effective_from));
  return v_id;
end;
$$;

-- Anula uma mudança AINDA NÃO VIGENTE (erro de digitação, aluno recusou, desistência).
create or replace function public.void_scheduled_contract_change(p_contract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row client_service_contracts%rowtype;
begin
  select * into v_row from client_service_contracts x where x.id = p_contract_id for update;
  if not found or not private.is_coach_of_client(v_row.client_id) then
    raise exception 'trackly:forbidden';
  end if;
  if v_row.kind <> 'change' or v_row.voided_at is not null or v_row.effective_from <= private.today_sp() then
    raise exception 'trackly:not_voidable';
  end if;
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'trackly:reason_too_long';
  end if;

  update client_service_contracts
  set voided_at = now(), voided_by = (select auth.uid()), void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_contract_id;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_row.account_id, v_row.client_id, 'package_change_voided', 'coach', (select auth.uid()),
          jsonb_build_object('contract_id', p_contract_id));
end;
$$;

-- ============================================================================
-- F4) RPCs do ALUNO (derivam o aluno de auth.uid(); não aceitam client_id)
-- ============================================================================

-- Pacote vigente + mudanças futuras/pendentes de confirmação. Sem motivo interno nem autor.
create or replace function public.get_my_service_package()
returns table (
  contract_id uuid,
  package text,
  price_cents integer,
  billing_period text,
  effective_from date,
  is_current boolean,
  client_confirmation text
)
language sql
security definer
stable
set search_path = public
as $$
  with me as (
    select c.id from clients c where c.auth_user_id = (select auth.uid())
  ),
  cur as (
    select private.client_current_contract_id((select me.id from me)) as id
  )
  select x.id, x.package, x.price_cents, x.billing_period, x.effective_from,
         x.id = (select cur.id from cur), x.client_confirmation
  from client_service_contracts x
  where x.client_id = (select me.id from me)
    and x.voided_at is null
    and (x.id = (select cur.id from cur)
         or x.effective_from > private.today_sp()
         or x.client_confirmation = 'pending')
  order by x.effective_from
$$;

-- Resposta do aluno a uma mudança que pediu confirmação. Recusar NÃO anula sozinho: o coach decide.
create or replace function public.respond_to_contract_change(p_contract_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := private.current_client_id();
  v_row client_service_contracts%rowtype;
begin
  if v_client is null or p_accept is null then
    raise exception 'trackly:forbidden';
  end if;
  select * into v_row from client_service_contracts x
  where x.id = p_contract_id and x.client_id = v_client for update;
  if not found then
    raise exception 'trackly:forbidden';
  end if;
  if v_row.client_confirmation <> 'pending' or v_row.voided_at is not null then
    raise exception 'trackly:not_pending';
  end if;

  update client_service_contracts
  set client_confirmation = case when p_accept then 'confirmed' else 'declined' end,
      client_responded_at = now()
  where id = p_contract_id;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_row.account_id, v_client, 'package_change_responded', 'client', (select auth.uid()),
          jsonb_build_object('contract_id', p_contract_id, 'accepted', p_accept));
end;
$$;

-- Salva o RASCUNHO do questionário (progresso no servidor; nunca localStorage). Cria na 1ª vez.
create or replace function public.save_my_onboarding_draft(
  p_catalog_version text,
  p_sections text[],
  p_answers jsonb,
  p_sensitive_answers jsonb,
  p_current_step text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := private.current_client_id();
  v_account uuid;
  v_id uuid;
  v_created boolean := false;
begin
  if v_client is null then
    raise exception 'trackly:forbidden';
  end if;
  if p_catalog_version is null or char_length(p_catalog_version) not between 1 and 40 then
    raise exception 'trackly:invalid_catalog_version';
  end if;
  if p_sections is null or not ('common' = any (p_sections))
     or not (p_sections <@ array['common', 'training', 'nutrition']::text[]) then
    raise exception 'trackly:invalid_sections';
  end if;

  select c.account_id into v_account from clients c where c.id = v_client for update;

  select q.id into v_id from onboarding_questionnaires q
  where q.client_id = v_client and q.status = 'draft';

  if v_id is null then
    if exists (select 1 from onboarding_questionnaires q where q.client_id = v_client and q.status = 'submitted') then
      raise exception 'trackly:questionnaire_already_submitted';
    end if;
    insert into onboarding_questionnaires (
      account_id, client_id, catalog_version, package, sections, answers, sensitive_answers, current_step)
    values (
      v_account, v_client, p_catalog_version, private.client_package(v_client), p_sections,
      coalesce(p_answers, '{}'::jsonb), coalesce(p_sensitive_answers, '{}'::jsonb), p_current_step)
    returning id into v_id;
    v_created := true;
  else
    update onboarding_questionnaires
    set catalog_version = p_catalog_version,
        sections = p_sections,
        answers = coalesce(p_answers, '{}'::jsonb),
        sensitive_answers = coalesce(p_sensitive_answers, '{}'::jsonb),
        current_step = p_current_step,
        updated_at = now()
    where id = v_id;
  end if;

  if v_created then
    insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
    values (v_account, v_client, 'questionnaire_started', 'client', (select auth.uid()),
            jsonb_build_object('questionnaire_id', v_id, 'catalog_version', p_catalog_version));
  end if;
  return v_id;
end;
$$;

-- ENVIO do questionário. A validação de obrigatórias é do servidor do app (catálogo em código)
-- ANTES de chamar; aqui: estado, forma, prazo do protocolo (envio + 3 dias) e cópia opcional de
-- altura/nascimento/sexo pra `clients` SÓ quando o campo ainda está vazio (nunca sobrescreve o coach).
create or replace function public.submit_my_onboarding_questionnaire(
  p_catalog_version text,
  p_sections text[],
  p_answers jsonb,
  p_sensitive_answers jsonb,
  p_height_cm integer default null,
  p_birth_date date default null,
  p_gender text default null
)
returns table (questionnaire_id uuid, submitted_at timestamptz, protocol_due_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid := private.current_client_id();
  v_account uuid;
  v_name text;
  v_id uuid;
  v_now timestamptz := now();
  v_due timestamptz := now() + interval '3 days';
begin
  if v_client is null then
    raise exception 'trackly:forbidden';
  end if;
  if p_height_cm is not null and (p_height_cm < 100 or p_height_cm > 250) then
    raise exception 'trackly:invalid_height';
  end if;
  if p_birth_date is not null and (p_birth_date < date '1900-01-01' or p_birth_date > private.today_sp()) then
    raise exception 'trackly:invalid_birth_date';
  end if;
  if p_gender is not null and p_gender not in ('feminino', 'masculino') then
    raise exception 'trackly:invalid_gender';
  end if;

  -- Grava as respostas finais no rascunho (cria se não houver) — mesmas regras do save.
  v_id := public.save_my_onboarding_draft(p_catalog_version, p_sections, p_answers, p_sensitive_answers, null);

  update onboarding_questionnaires q
  set status = 'submitted', submitted_at = v_now, protocol_due_at = v_due, updated_at = v_now
  where q.id = v_id and q.status = 'draft';

  select c.account_id, c.name into v_account, v_name from clients c where c.id = v_client;

  update clients c
  set height_cm = coalesce(c.height_cm, p_height_cm),
      birth_date = coalesce(c.birth_date, p_birth_date),
      age = coalesce(c.age, case when p_birth_date is null then null
                                 else extract(year from age(private.today_sp(), p_birth_date))::integer end),
      gender = coalesce(nullif(c.gender, ''), p_gender)
  where c.id = v_client;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_account, v_client, 'questionnaire_submitted', 'client', (select auth.uid()),
          jsonb_build_object('questionnaire_id', v_id, 'protocol_due_at', v_due));

  insert into notifications (client_id, event_type, recipient, message)
  values (v_client, 'questionnaire_submitted', 'coach',
          v_name || ' enviou o questionário inicial. Protocolo previsto até '
            || to_char(v_due at time zone 'America/Sao_Paulo', 'DD/MM') || '.');

  return query select v_id, v_now, v_due;
end;
$$;

-- Coach abriu o questionário (distingue "questionário enviado" de "protocolo em preparação").
create or replace function public.mark_onboarding_questionnaire_opened(p_questionnaire_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row onboarding_questionnaires%rowtype;
begin
  select * into v_row from onboarding_questionnaires q where q.id = p_questionnaire_id for update;
  if not found or not private.is_coach_of_client(v_row.client_id) then
    raise exception 'trackly:forbidden';
  end if;
  if v_row.status <> 'submitted' or v_row.coach_opened_at is not null then
    return;
  end if;

  update onboarding_questionnaires set coach_opened_at = now() where id = p_questionnaire_id;

  insert into client_onboarding_events (account_id, client_id, event, actor, actor_user_id, detail)
  values (v_row.account_id, v_row.client_id, 'questionnaire_opened', 'coach', (select auth.uid()),
          jsonb_build_object('questionnaire_id', p_questionnaire_id));
end;
$$;

-- Grants das RPCs: só `authenticated` (e service_role). anon nunca (0012).
revoke all on function public.create_invited_client(text, text, text, text, integer, text, boolean) from public, anon;
revoke all on function public.set_initial_client_contract(uuid, text, integer, text) from public, anon;
revoke all on function public.change_client_contract(uuid, text, integer, text, date, text, boolean, boolean) from public, anon;
revoke all on function public.void_scheduled_contract_change(uuid, text) from public, anon;
revoke all on function public.get_my_service_package() from public, anon;
revoke all on function public.respond_to_contract_change(uuid, boolean) from public, anon;
revoke all on function public.save_my_onboarding_draft(text, text[], jsonb, jsonb, text) from public, anon;
revoke all on function public.submit_my_onboarding_questionnaire(text, text[], jsonb, jsonb, integer, date, text) from public, anon;
revoke all on function public.mark_onboarding_questionnaire_opened(uuid) from public, anon;

grant execute on function public.create_invited_client(text, text, text, text, integer, text, boolean) to authenticated, service_role;
grant execute on function public.set_initial_client_contract(uuid, text, integer, text) to authenticated, service_role;
grant execute on function public.change_client_contract(uuid, text, integer, text, date, text, boolean, boolean) to authenticated, service_role;
grant execute on function public.void_scheduled_contract_change(uuid, text) to authenticated, service_role;
grant execute on function public.get_my_service_package() to authenticated, service_role;
grant execute on function public.respond_to_contract_change(uuid, boolean) to authenticated, service_role;
grant execute on function public.save_my_onboarding_draft(text, text[], jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.submit_my_onboarding_questionnaire(text, text[], jsonb, jsonb, integer, date, text) to authenticated, service_role;
grant execute on function public.mark_onboarding_questionnaire_opened(uuid) to authenticated, service_role;

-- ============================================================================
-- G) View client_onboarding_status — fila/jornada SEM respostas
-- ============================================================================
-- security_invoker: o RLS de quem consulta vale em cada tabela lida. Coach: alunos da conta, com
-- pacote, rascunhos e eventos. Aluno: só a própria linha; pacote/rascunhos/eventos vêm nulos/false
-- (ele usa get_my_service_package). O estágio é derivado no app (web/lib/onboarding/stage.ts).

create or replace view public.client_onboarding_status
with (security_invoker = true)
as
select
  c.id as client_id,
  c.account_id,
  c.coach_id,
  c.name,
  c.status as client_status,
  c.invite_status,
  c.invited_at,
  c.activated_at,
  c.created_at,
  c.onboarding_required,
  (c.auth_user_id is not null) as has_account,
  ct.id as contract_id,
  ct.package,
  ct.effective_from as package_since,
  q.id as questionnaire_id,
  q.status as questionnaire_status,
  q.started_at as questionnaire_started_at,
  q.submitted_at as questionnaire_submitted_at,
  q.protocol_due_at,
  q.coach_opened_at as questionnaire_opened_at,
  exists (
    select 1 from public.workout_plans wp
    where wp.client_id = c.id and not wp.is_draft and not wp.is_template and wp.archived_at is null
  ) as training_published,
  exists (
    select 1 from public.nutrition_plans np
    where np.client_id = c.id and not np.is_draft and not np.is_template and np.archived_at is null
  ) as nutrition_published,
  exists (
    select 1 from public.workout_plans wp
    where wp.client_id = c.id and wp.is_draft and not wp.is_template
  ) as training_draft,
  exists (
    select 1 from public.nutrition_plans np
    where np.client_id = c.id and np.is_draft and not np.is_template
  ) as nutrition_draft,
  ev.invite_last_sent_at,
  ev.invite_last_failed_at,
  ev.invite_accepted_at,
  ev.protocol_completed_at
from public.clients c
left join lateral (
  select x.id, x.package, x.effective_from
  from public.client_service_contracts x
  where x.client_id = c.id
    and x.voided_at is null
    and x.effective_from <= (now() at time zone 'America/Sao_Paulo')::date
  order by x.effective_from desc, x.created_at desc
  limit 1
) ct on true
left join lateral (
  select oq.id, oq.status, oq.started_at, oq.submitted_at, oq.protocol_due_at, oq.coach_opened_at
  from public.onboarding_questionnaires oq
  where oq.client_id = c.id
  order by (oq.status = 'submitted') desc, oq.submitted_at desc nulls last, oq.started_at desc
  limit 1
) q on true
left join lateral (
  select
    max(e.occurred_at) filter (where e.event = 'invite_sent') as invite_last_sent_at,
    max(e.occurred_at) filter (where e.event = 'invite_send_failed') as invite_last_failed_at,
    max(e.occurred_at) filter (where e.event = 'invite_accepted') as invite_accepted_at,
    min(e.occurred_at) filter (where e.event = 'protocol_completed') as protocol_completed_at
  from public.client_onboarding_events e
  where e.client_id = c.id
) ev on true;

revoke all on public.client_onboarding_status from anon, authenticated;
grant select on public.client_onboarding_status to authenticated;

-- ============================================================================
-- H) RLS do aluno nos planos: publicado E módulo no pacote
-- ============================================================================
-- Recria EXATAMENTE as policies da 0004 + `private.client_has_module` (sem contrato = true, ou
-- seja, nada muda pros alunos atuais). Filhos (dias/exercícios/refeições/itens/substituições)
-- já filtram via subconsulta no plano-pai, que passa por esta policy.

drop policy if exists workout_plans_client_read on public.workout_plans;
create policy workout_plans_client_read on public.workout_plans for select to authenticated
  using (
    client_id = (select private.current_client_id())
    and is_draft = false
    and private.client_has_module(client_id, 'training')
  );

drop policy if exists nutrition_plans_client_read on public.nutrition_plans;
create policy nutrition_plans_client_read on public.nutrition_plans for select to authenticated
  using (
    client_id = (select private.current_client_id())
    and is_draft = false
    and private.client_has_module(client_id, 'nutrition')
  );

-- ============================================================================
-- I) notifications.event_type — superconjunto
-- ============================================================================

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.notifications'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ '\mevent_type\M'
  loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;

  alter table public.notifications
    add constraint notifications_event_type_check
    check (event_type in (
      'checkin_received', 'checkin_overdue', 'checkin_reminder',
      'orientation_ready', 'payment_overdue',
      'workout_updated', 'nutrition_updated',
      'invite_accepted', 'questionnaire_submitted', 'protocol_ready', 'package_changed'
    ));
end $$;

-- CONFERÊNCIA (só leitura, depois de aplicar):
-- select * from client_onboarding_status limit 5;                      -- como coach
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.notifications'::regclass;
-- select indexname from pg_indexes where indexname = 'clients_account_email_uidx';
