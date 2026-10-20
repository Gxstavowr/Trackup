-- Trackly — 0023: V5 Fases 5–6 — painel do proprietário (dados de apoio) e laboratório de demonstração
--
-- APLICAR DEPOIS da 0022, pelo runner (`node scripts/migrate.mjs apply`, a partir de web/), que já
-- envolve o arquivo numa transação — este arquivo NÃO tem begin/commit próprios. ADITIVA e
-- reexecutável. Não apaga nem reescreve nenhuma linha existente (as funções de reset do laboratório
-- só apagam dados de contas `is_demo` e só rodam pela service role). Plano: docs/v5-plano-dados.md.
--
-- AUTORIZAÇÃO DO ADMIN: NÃO mora no banco. O proprietário é identificado no SERVIDOR por allowlist de
-- IDs em variável de ambiente (`TRACKLY_ADMIN_USER_IDS`, web/lib/admin/auth.ts). `coach_users.role`
-- ('admin') é papel DENTRO de uma conta de coach e não é usado para isso. Tudo aqui é acessível só
-- pela service role (RLS ligado, sem policy, sem GRANT para anon/authenticated).
--
-- O QUE FAZ
--   A) accounts.is_demo / accounts.demo_scenario ('filled' | 'empty'): marca contas de demonstração.
--      Default false — nenhuma conta muda. Quem marca é o script de demo (service role); o coach não
--      tem UPDATE em accounts (só SELECT, 0001), então não consegue se marcar/desmarcar.
--   B) platform_plan_prices: preço da mensalidade do Trackly (configuração explícita com vigência).
--      Sem linha = "preço não configurado" — o painel NÃO inventa MRR.
--   C) demo_lab_profiles: registro dos logins que o laboratório pode assumir (só contas is_demo,
--      checado por trigger).
--   D) admin_audit_events: trilha das ações do proprietário (troca de perfil no laboratório, reset).
--   E) Funções service-role-only: lab_reset_demo_account, lab_reset_demo_student,
--      admin_business_overview (indicadores, excluindo contas demo).

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ============================================================================
-- A) accounts — conta de demonstração
-- ============================================================================

alter table public.accounts
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_scenario text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'accounts_demo_scenario_check' and conrelid = 'public.accounts'::regclass
  ) then
    alter table public.accounts add constraint accounts_demo_scenario_check
      check (demo_scenario is null or (is_demo and demo_scenario in ('filled', 'empty')));
  end if;
end $$;

create index if not exists accounts_is_demo_idx on public.accounts(is_demo) where is_demo;

create or replace function private.is_demo_account(p_account uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select a.is_demo from accounts a where a.id = p_account), false)
$$;

-- Para policies/funções/triggers. O APP não chama `private.*` (schema não exposto pelo PostgREST):
-- o servidor lê `accounts.is_demo` (coach: com a própria sessão, policy accounts_coach_read;
-- aluno/admin: client admin) para simular e-mail/cobrança em conta demo.
revoke all on function private.is_demo_account(uuid) from public, anon;
grant execute on function private.is_demo_account(uuid) to authenticated;

-- ============================================================================
-- B) platform_plan_prices — preço da mensalidade do Trackly (receita do Trackly, não do coach)
-- ============================================================================

create table if not exists public.platform_plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null default 'coach_monthly' check (plan_code in ('coach_monthly')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 10000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  effective_from date not null,
  note text check (note is null or char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (plan_code, effective_from)
);

alter table public.platform_plan_prices enable row level security;
revoke all on public.platform_plan_prices from anon, authenticated;

-- ============================================================================
-- C) demo_lab_profiles — quem o laboratório pode assumir
-- ============================================================================

create table if not exists public.demo_lab_profiles (
  key text primary key check (key in ('coach_filled', 'student_filled', 'coach_empty', 'student_fresh')),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  label text not null check (char_length(label) between 1 and 80),
  updated_at timestamptz not null default now(),
  constraint demo_lab_profiles_shape check (
    (key like 'coach_%' and client_id is null) or key like 'student_%'
  )
);

create or replace function private.guard_demo_lab_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_demo_account(new.account_id) then
    raise exception 'trackly:not_demo_account';
  end if;
  if new.key like 'coach_%' and not exists (
    select 1 from coach_users cu where cu.id = new.user_id and cu.account_id = new.account_id
  ) then
    raise exception 'trackly:demo_profile_mismatch';
  end if;
  if new.client_id is not null and not exists (
    select 1 from clients c
    where c.id = new.client_id and c.account_id = new.account_id and c.auth_user_id = new.user_id
  ) then
    raise exception 'trackly:demo_profile_mismatch';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists demo_lab_profiles_guard on public.demo_lab_profiles;
create trigger demo_lab_profiles_guard
  before insert or update on public.demo_lab_profiles
  for each row execute function private.guard_demo_lab_profile();

alter table public.demo_lab_profiles enable row level security;
revoke all on public.demo_lab_profiles from anon, authenticated;
revoke all on function private.guard_demo_lab_profile() from public, anon, authenticated;

-- ============================================================================
-- D) admin_audit_events — trilha do proprietário
-- ============================================================================

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null check (action in (
    'admin_login', 'lab_switch', 'lab_return', 'lab_reset_account', 'lab_reset_student',
    'platform_price_set'
  )),
  target_user_id uuid,
  target_account_id uuid,
  lab_profile text,
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 4096),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx on public.admin_audit_events(created_at desc);

alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;

-- ============================================================================
-- E1) Reset do cenário "Começar do zero" (coach) — SÓ conta demo 'empty'
-- ============================================================================
-- Apaga alunos (cascata: check-ins, fotos (linhas), planos, contratos, questionário, eventos...),
-- templates de treino/dieta, log de alterações e preços padrão DA CONTA DEMO. Mantém o coach, o
-- template de check-in e a biblioteca de exercícios/alimentos. Devolve os logins de aluno órfãos
-- para o servidor apagar via Auth Admin API (o banco não apaga auth.users) — nunca os do registro do
-- laboratório. Arquivos do Storage: o servidor remove o prefixo `{account_id}/` do bucket.

create or replace function public.lab_reset_demo_account(p_account_id uuid)
returns table (deleted_clients integer, orphan_auth_user_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_orphans uuid[];
  v_count integer;
begin
  if not exists (
    select 1 from accounts a where a.id = p_account_id and a.is_demo and a.demo_scenario = 'empty'
  ) then
    raise exception 'trackly:not_demo_empty_account';
  end if;

  select coalesce(array_agg(c.auth_user_id), '{}'::uuid[]) into v_orphans
  from clients c
  where c.account_id = p_account_id
    and c.auth_user_id is not null
    and c.auth_user_id not in (select p.user_id from demo_lab_profiles p);

  delete from clients c where c.account_id = p_account_id;
  get diagnostics v_count = row_count;

  delete from workout_plans wp where wp.account_id = p_account_id and wp.client_id is null;
  delete from nutrition_plans np where np.account_id = p_account_id and np.client_id is null;
  delete from plan_change_logs l where l.account_id = p_account_id;
  delete from coach_service_prices sp where sp.account_id = p_account_id;

  return query select v_count, v_orphans;
end;
$$;

-- ============================================================================
-- E2) Reset do aluno "Começar do zero" — SÓ o aluno registrado como 'student_fresh' em conta demo
-- ============================================================================
-- Recria o cadastro do aluno com o MESMO login (apaga a linha -> cascata limpa tudo dele; insere de
-- novo como conta ativa, onboarding obrigatório, sem questionário nem planos) e refaz o contrato
-- inicial com o pacote/valor do contrato vigente anterior (default Híbrido sem valor, se não havia).

create or replace function public.lab_reset_demo_student(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old clients%rowtype;
  v_profile demo_lab_profiles%rowtype;
  v_package text;
  v_price integer;
  v_period text;
  v_new uuid;
begin
  select * into v_old from clients c where c.id = p_client_id for update;
  if not found or not private.is_demo_account(v_old.account_id) then
    raise exception 'trackly:not_demo_account';
  end if;
  select * into v_profile from demo_lab_profiles p
  where p.key = 'student_fresh' and p.client_id = p_client_id;
  if not found then
    raise exception 'trackly:not_fresh_demo_student';
  end if;

  select x.package, x.price_cents, x.billing_period into v_package, v_price, v_period
  from client_service_contracts x
  where x.id = private.client_current_contract_id(p_client_id);

  delete from clients c where c.id = p_client_id;

  insert into clients (
    account_id, coach_id, auth_user_id, name, email, phone, status, color_key,
    invite_status, invited_at, activated_at, start_date, onboarding_required)
  values (
    v_old.account_id, v_old.coach_id, v_old.auth_user_id, v_old.name, v_old.email, v_old.phone,
    'active', v_old.color_key, 'active', now(), now(), private.today_sp(), true)
  returning id into v_new;

  insert into client_service_contracts (
    account_id, client_id, kind, package, price_cents, billing_period, price_source, effective_from)
  values (
    v_old.account_id, v_new, 'initial', coalesce(v_package, 'hybrid'), coalesce(v_price, 0),
    coalesce(v_period, 'monthly'), 'custom', private.today_sp());

  update demo_lab_profiles set client_id = v_new where key = 'student_fresh';

  return v_new;
end;
$$;

-- ============================================================================
-- E3) Indicadores do negócio (painel do proprietário) — EXCLUI contas demo
-- ============================================================================
-- Só números que o banco sustenta. MRR previsto = preço configurado × assinaturas `active`
-- (null se não há preço configurado). Recebido em R$ NÃO é calculado aqui: os eventos da SyncPay não
-- têm coluna de valor (só payload cru) — devolve a QUANTIDADE de eventos de pagamento no período.
-- `p_from`/`p_to`: período (meio-aberto [from, to)) para "novos" e "eventos no período".

create or replace function public.admin_business_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with real_accounts as (
    select a.id, a.created_at from accounts a where not a.is_demo
  ),
  real_clients as (
    select c.* from clients c join real_accounts ra on ra.id = c.account_id
  ),
  billing as (
    select ra.id as account_id, coalesce(s.status, 'none') as status
    from real_accounts ra
    left join coach_billing_subscriptions s on s.account_id = ra.id
  ),
  price as (
    select p.amount_cents from platform_plan_prices p
    where p.plan_code = 'coach_monthly' and p.effective_from <= private.today_sp()
    order by p.effective_from desc limit 1
  ),
  onboarding as (
    select s.*
    from client_onboarding_status s
    join real_accounts ra on ra.id = s.account_id
  ),
  packages as (
    select private.client_package(rc.id) as package from real_clients rc
  )
  select jsonb_build_object(
    'generated_at', now(),
    'coaches_total', (select count(*) from real_accounts),
    'students_total', (select count(*) from real_clients),
    'students_with_account', (select count(*) from real_clients where auth_user_id is not null),
    'new_coaches', (select count(*) from real_accounts where created_at >= p_from and created_at < p_to),
    'new_students', (select count(*) from real_clients where created_at >= p_from and created_at < p_to),
    'billing_by_status', (
      select coalesce(jsonb_object_agg(b.status, b.n), '{}'::jsonb)
      from (select status, count(*) as n from billing group by status) b
    ),
    'billing_last_update', (
      select max(s.updated_at) from coach_billing_subscriptions s join real_accounts ra on ra.id = s.account_id
    ),
    'platform_price_cents', (select amount_cents from price),
    'mrr_expected_cents', (
      select (select amount_cents from price) * count(*) from billing where status = 'active'
    ),
    -- Um evento por pagamento: a SyncPay manda `cobranca_paga` em todo pagamento (primeiro,
    -- renovação, reativação) e, junto, um evento de ciclo de vida (`assinatura_ativada` /
    -- `_reativada` / `_renovada`). Conta `cobranca_paga`; o evento de ciclo de vida só conta se
    -- não houver `cobranca_paga` aplicada da mesma assinatura até 1 dia antes/depois dele.
    'paid_events_in_period', (
      select count(*) from coach_billing_events e
      join real_accounts ra on ra.id = e.account_id
      where e.processed_at is not null
        and coalesce(e.occurred_at, e.received_at) >= p_from
        and coalesce(e.occurred_at, e.received_at) < p_to
        and (
          e.event = 'cobranca_paga'
          or (
            e.event in ('assinatura_ativada', 'assinatura_reativada', 'assinatura_renovada')
            and not exists (
              select 1 from coach_billing_events c
              where c.event = 'cobranca_paga'
                and c.processed_at is not null
                and c.subscription_token = e.subscription_token
                and coalesce(c.occurred_at, c.received_at)
                    between coalesce(e.occurred_at, e.received_at) - interval '1 day'
                        and coalesce(e.occurred_at, e.received_at) + interval '1 day'
            )
          )
        )
    ),
    'next_charges_in_period', (
      select count(*) from coach_billing_subscriptions s join real_accounts ra on ra.id = s.account_id
      where s.status in ('active', 'overdue') and s.next_charge_at >= p_from and s.next_charge_at < p_to
    ),
    'students_awaiting_questionnaire', (
      select count(*) from onboarding
      where onboarding_required and has_account
        and (questionnaire_status is null or questionnaire_status = 'draft')
    ),
    'protocols_in_preparation', (
      select count(*) from onboarding
      where questionnaire_status = 'submitted' and protocol_completed_at is null
        and package is not null
    ),
    'students_by_package', (
      select coalesce(jsonb_object_agg(coalesce(p.package, 'legacy'), p.n), '{}'::jsonb)
      from (select package, count(*) as n from packages group by package) p
    )
  )
$$;

revoke all on function public.lab_reset_demo_account(uuid) from public, anon, authenticated;
revoke all on function public.lab_reset_demo_student(uuid) from public, anon, authenticated;
revoke all on function public.admin_business_overview(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.lab_reset_demo_account(uuid) to service_role;
grant execute on function public.lab_reset_demo_student(uuid) to service_role;
grant execute on function public.admin_business_overview(timestamptz, timestamptz) to service_role;

-- CONFERÊNCIA (só leitura, service role / SQL Editor):
-- select public.admin_business_overview(date_trunc('month', now()), now());
-- select id, is_demo, demo_scenario from accounts where is_demo;
