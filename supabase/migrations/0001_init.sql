-- Trackly — schema inicial (item 2 e 4 do master TODO)
--
-- Espelha 1:1 o modelo de dados documentado em ARCHITECTURE.md ("Modelo de dados" +
-- "Treino, Nutrição, Pagamentos e Notificações"). Ainda não foi rodado contra um projeto
-- Supabase real (nenhum projeto existe hoje — ver "Tasks for Gustavo") — este arquivo é a
-- preparação pra quando existir: `supabase db push` (ou `supabase migration up`) aplica
-- tudo de uma vez assim que o projeto e o Supabase CLI estiverem configurados.
--
-- Convenções:
--   - Toda tabela de negócio carrega account_id (isolamento multi-tenant, item 35).
--   - RLS habilitado em toda tabela desde a criação, nunca "adicionar depois".
--   - Funções auxiliares de RLS vivem no schema `private` (nunca exposto pela API do
--     PostgREST), seguindo a prática recomendada do Supabase de não vazar lógica de
--     autorização como se fosse dado.
--   - `(select auth.uid())` em vez de `auth.uid()` solto dentro das policies — o wrapper
--     em subquery evita reavaliar a função por linha (recomendação de performance do
--     Supabase para RLS em tabelas grandes).
--   - Enums como CHECK constraints em vez de tipos ENUM nativos — mais fácil de alterar
--     valores permitidos depois (ALTER TYPE ... ADD VALUE tem restrições chatas em
--     transação; um CHECK se troca com um único DROP/ADD CONSTRAINT).

create extension if not exists pgcrypto;

create schema if not exists private;

-- ============================================================================
-- CONTA / COACH / ALUNO
-- ============================================================================

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  niche text,
  plan text not null default 'trial',
  created_at timestamptz not null default now()
);

-- perfil do coach, com o mesmo id do usuário em auth.users (padrão comum no Supabase:
-- evita uma tabela de mapeamento extra pra um relacionamento 1:1).
create table coach_users (
  id uuid primary key references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'coach' check (role in ('coach', 'admin')),
  created_at timestamptz not null default now()
);
create index coach_users_account_id_idx on coach_users(account_id);

create table clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  coach_id uuid not null references coach_users(id) on delete restrict,
  -- nulo até o aluno aceitar o convite e criar a própria conta (mesmo fluxo de
  -- inviteStatus pending -> invited -> active que já existe no protótipo estático).
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  gender text,
  age integer,
  height_cm integer,
  objective text,
  start_date date,
  status text not null default 'active' check (status in ('active', 'paused')),
  color_key text,
  invite_status text not null default 'pending' check (invite_status in ('pending', 'invited', 'active')),
  invited_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);
create index clients_account_id_idx on clients(account_id);
create index clients_coach_id_idx on clients(coach_id);
create unique index clients_auth_user_id_idx on clients(auth_user_id) where auth_user_id is not null;

-- ============================================================================
-- FUNÇÕES DE APOIO PRA RLS (schema private — nunca exposto pela API)
-- ============================================================================

create function private.current_account_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select account_id from coach_users where id = (select auth.uid())
$$;

create function private.current_client_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from clients where auth_user_id = (select auth.uid())
$$;

-- true se a linha pertence à conta do coach autenticado OU ao próprio aluno autenticado.
-- client_row_id é o id em `clients` que a linha referencia (direto ou via client_id).
create function private.can_access_client(client_row_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from clients c
    where c.id = client_row_id
      and (c.account_id = private.current_account_id() or c.auth_user_id = (select auth.uid()))
  )
$$;

alter table accounts enable row level security;
alter table coach_users enable row level security;
alter table clients enable row level security;

create policy accounts_coach_read on accounts for select
  using (id = private.current_account_id());

create policy coach_users_self_read on coach_users for select
  using (account_id = private.current_account_id());

create policy clients_coach_full_access on clients for all
  using (account_id = private.current_account_id())
  with check (account_id = private.current_account_id());

create policy clients_self_read on clients for select
  using (auth_user_id = (select auth.uid()));

-- ============================================================================
-- CHECK-IN: TEMPLATE, INSTÂNCIA, MÉTRICAS, METAS, ORIENTAÇÃO, HISTÓRICO
-- ============================================================================

create table checkin_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null default 'Padrão',
  created_at timestamptz not null default now()
);
create index checkin_templates_account_id_idx on checkin_templates(account_id);

create table checkin_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references checkin_templates(id) on delete cascade,
  key text not null,
  label text not null,
  type text not null check (type in ('number', 'scale', 'boolean', 'select', 'text', 'photos', 'scale+text', 'number+text', 'stepper')),
  unit text,
  step integer not null default 1,
  tracks text,
  required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0
);
create index checkin_questions_template_id_idx on checkin_questions(template_id);

create table checkin_instances (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  template_id uuid references checkin_templates(id) on delete set null,
  week_number integer not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'pending' check (status in ('pending', 'submitted', 'late', 'reviewed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, week_number)
);
create index checkin_instances_client_id_idx on checkin_instances(client_id);

create table checkin_answers (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkin_instances(id) on delete cascade,
  question_key text not null,
  value text,
  unique (checkin_id, question_key)
);
create index checkin_answers_checkin_id_idx on checkin_answers(checkin_id);

create table photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  checkin_id uuid references checkin_instances(id) on delete set null,
  week_number integer not null,
  angle text not null check (angle in ('front', 'back', 'side')),
  -- path dentro do bucket privado, nunca uma URL pública direta — sempre resolvido pra
  -- URL assinada de curta duração no momento de exibir (ver seção de Storage do
  -- ARCHITECTURE.md: account_id/client_id/... como path).
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index photos_client_id_idx on photos(client_id);

create table metrics (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_number integer not null,
  key text not null check (key in (
    'weight_kg', 'waist_cm', 'hip_cm', 'body_fat_pct', 'adherence_pct',
    'workouts_count', 'workouts_goal', 'cardio_count', 'cardio_goal',
    'water_l', 'water_goal', 'sleep_h', 'sleep_goal', 'energy', 'hunger'
  )),
  value numeric,
  unique (client_id, week_number, key)
);
create index metrics_client_id_week_idx on metrics(client_id, week_number);

create table goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_number integer not null,
  metric_key text not null,
  label text not null,
  target_value numeric not null,
  unit text,
  result_value numeric,
  result_status text not null default 'pending' check (result_status in ('success', 'partial', 'fail', 'pending')),
  created_at timestamptz not null default now()
);
create index goals_client_id_week_idx on goals(client_id, week_number);

create table orientations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_number integer not null,
  author_id uuid references coach_users(id) on delete set null,
  text text not null,
  focus_override text,
  coach_note text,
  is_draft boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index orientations_client_id_week_idx on orientations(client_id, week_number);

create table history_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  event_date timestamptz not null default now(),
  type text not null check (type in ('join', 'checkin', 'goal_set', 'goal_result', 'note', 'milestone')),
  title text not null,
  description text
);
create index history_events_client_id_idx on history_events(client_id);

alter table checkin_templates enable row level security;
alter table checkin_questions enable row level security;
alter table checkin_instances enable row level security;
alter table checkin_answers enable row level security;
alter table photos enable row level security;
alter table metrics enable row level security;
alter table goals enable row level security;
alter table orientations enable row level security;
alter table history_events enable row level security;

create policy checkin_templates_by_account on checkin_templates for all
  using (account_id = private.current_account_id())
  with check (account_id = private.current_account_id());

create policy checkin_questions_by_template on checkin_questions for all
  using (template_id in (select id from checkin_templates where account_id = private.current_account_id()))
  with check (template_id in (select id from checkin_templates where account_id = private.current_account_id()));

create policy checkin_instances_coach_access on checkin_instances for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy checkin_answers_by_instance on checkin_answers for all
  using (checkin_id in (select id from checkin_instances where private.can_access_client(client_id)))
  with check (checkin_id in (select id from checkin_instances where private.can_access_client(client_id)));

create policy photos_by_client on photos for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy metrics_by_client on metrics for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy goals_by_client on goals for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy orientations_by_client on orientations for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy history_events_by_client on history_events for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

-- ============================================================================
-- TREINO
-- ============================================================================

create table exercises (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  category text not null,
  instruction text,
  video_url text
);
create index exercises_account_id_idx on exercises(account_id);

create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  is_draft boolean not null default false,
  created_at timestamptz not null default now()
);
create index workout_plans_client_id_idx on workout_plans(client_id);

create table workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references workout_plans(id) on delete cascade,
  name text not null,
  duration_min integer,
  sort_order integer not null default 0
);
create index workout_days_plan_id_idx on workout_days(plan_id);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references workout_days(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  sets integer,
  reps integer,
  rest_sec integer,
  rir integer,
  notes text,
  sort_order integer not null default 0
);
create index workout_exercises_day_id_idx on workout_exercises(day_id);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete restrict,
  week_number integer not null,
  load numeric,
  reps integer,
  completed_at timestamptz not null default now()
);
create index workout_logs_client_id_week_idx on workout_logs(client_id, week_number);

alter table exercises enable row level security;
alter table workout_plans enable row level security;
alter table workout_days enable row level security;
alter table workout_exercises enable row level security;
alter table workout_logs enable row level security;

create policy exercises_by_account on exercises for all
  using (account_id = private.current_account_id())
  with check (account_id = private.current_account_id());

create policy workout_plans_by_client on workout_plans for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy workout_days_by_plan on workout_days for all
  using (plan_id in (select id from workout_plans where private.can_access_client(client_id)))
  with check (plan_id in (select id from workout_plans where private.can_access_client(client_id)));

create policy workout_exercises_by_day on workout_exercises for all
  using (day_id in (
    select wd.id from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where private.can_access_client(wp.client_id)
  ))
  with check (day_id in (
    select wd.id from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where private.can_access_client(wp.client_id)
  ));

create policy workout_logs_by_client on workout_logs for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

-- ============================================================================
-- NUTRIÇÃO
-- ============================================================================

create table foods (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  unit text not null default 'g',
  macros jsonb not null default '{}'::jsonb
);
create index foods_account_id_idx on foods(account_id);

create table nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  is_draft boolean not null default false,
  updated_at timestamptz not null default now()
);
create index nutrition_plans_client_id_idx on nutrition_plans(client_id);

create table meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references nutrition_plans(id) on delete cascade,
  name text not null,
  time time,
  sort_order integer not null default 0
);
create index meals_plan_id_idx on meals(plan_id);

create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  food_id uuid references foods(id) on delete set null,
  qty text,
  macros jsonb not null default '{}'::jsonb
);
create index meal_items_meal_id_idx on meal_items(meal_id);

create table meal_substitutions (
  id uuid primary key default gen_random_uuid(),
  meal_item_id uuid not null references meal_items(id) on delete cascade,
  alternative_food_id uuid references foods(id) on delete set null,
  alternative_label text
);
create index meal_substitutions_meal_item_id_idx on meal_substitutions(meal_item_id);

alter table foods enable row level security;
alter table nutrition_plans enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;
alter table meal_substitutions enable row level security;

create policy foods_by_account on foods for all
  using (account_id = private.current_account_id())
  with check (account_id = private.current_account_id());

create policy nutrition_plans_by_client on nutrition_plans for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy meals_by_plan on meals for all
  using (plan_id in (select id from nutrition_plans where private.can_access_client(client_id)))
  with check (plan_id in (select id from nutrition_plans where private.can_access_client(client_id)));

create policy meal_items_by_meal on meal_items for all
  using (meal_id in (
    select m.id from meals m
    join nutrition_plans np on np.id = m.plan_id
    where private.can_access_client(np.client_id)
  ))
  with check (meal_id in (
    select m.id from meals m
    join nutrition_plans np on np.id = m.plan_id
    where private.can_access_client(np.client_id)
  ));

create policy meal_substitutions_by_item on meal_substitutions for all
  using (meal_item_id in (
    select mi.id from meal_items mi
    join meals m on m.id = mi.meal_id
    join nutrition_plans np on np.id = m.plan_id
    where private.can_access_client(np.client_id)
  ))
  with check (meal_item_id in (
    select mi.id from meal_items mi
    join meals m on m.id = mi.meal_id
    join nutrition_plans np on np.id = m.plan_id
    where private.can_access_client(np.client_id)
  ));

-- ============================================================================
-- ASSINATURA E PAGAMENTOS
-- ============================================================================

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_name text not null,
  price_cents integer not null,
  period text not null check (period in ('monthly', 'quarterly', 'semiannual', 'annual')),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);
create unique index subscriptions_client_id_idx on subscriptions(client_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  due_date date not null,
  paid_date date,
  amount_cents integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'cancelled', 'refunded')),
  method text,
  -- segredos/credenciais de gateway NUNCA moram aqui nem em nenhuma tabela do app —
  -- ficam só em variáveis de ambiente do backend (item 35).
  gateway_reference text
);
create index payments_subscription_id_idx on payments(subscription_id);

create table payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  type text not null check (type in ('created', 'charged', 'refunded', 'status_changed')),
  detail text,
  created_at timestamptz not null default now()
);
create index payment_events_payment_id_idx on payment_events(payment_id);

alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table payment_events enable row level security;

create policy subscriptions_by_client on subscriptions for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));

create policy payments_by_subscription on payments for all
  using (subscription_id in (select id from subscriptions where private.can_access_client(client_id)))
  with check (subscription_id in (select id from subscriptions where private.can_access_client(client_id)));

create policy payment_events_by_payment on payment_events for all
  using (payment_id in (
    select p.id from payments p
    join subscriptions s on s.id = p.subscription_id
    where private.can_access_client(s.client_id)
  ))
  with check (payment_id in (
    select p.id from payments p
    join subscriptions s on s.id = p.subscription_id
    where private.can_access_client(s.client_id)
  ));

-- ============================================================================
-- NOTIFICAÇÕES
-- ============================================================================

create table notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  event_type text not null check (event_type in (
    'checkin_received', 'checkin_overdue', 'checkin_reminder',
    'orientation_ready', 'payment_overdue',
    'workout_updated', 'nutrition_updated'
  )),
  recipient text not null check (recipient in ('coach', 'client')),
  message text not null,
  channel_in_app boolean not null default true,
  channel_whatsapp boolean not null default false,
  -- "declared": nenhum backend de push/e-mail real ainda dispara — ver item 21/29.
  channel_push text not null default 'declared' check (channel_push in ('declared', 'sent')),
  channel_email text not null default 'declared' check (channel_email in ('declared', 'sent')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_client_id_idx on notifications(client_id);

alter table notifications enable row level security;

create policy notifications_by_client on notifications for all
  using (private.can_access_client(client_id))
  with check (private.can_access_client(client_id));
