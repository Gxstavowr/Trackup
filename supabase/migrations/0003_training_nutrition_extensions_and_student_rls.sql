-- Trackly — 0003: extensões de Treino/Nutrição + fechamento das lacunas de RLS do aluno
--
-- Migration ADITIVA, pensada pra rodar de uma vez num SQL Editor de produção, numa única
-- transação (`begin; ... commit;`): ou passa inteira ou falha inteira. Reexecutável (idempotente):
-- `add column if not exists`, `create table/index if not exists`, `create or replace function`,
-- `drop policy if exists` só nas policies que ESTA migration cria/recria, e constraints
-- adicionadas atrás de um guarda em `pg_constraint`. Não há DROP TABLE, DROP COLUMN, ALTER TYPE,
-- nem UPDATE/DELETE em dados existentes. Nenhum segredo.
--
-- O QUE FAZ
--   A) Treino: biblioteca (grupo muscular/equipamento), campos por exercício-no-dia (faixa de reps,
--      carga sugerida, cadência, bloco warmup/normal/cardio, superset/circuito, substituto),
--      templates por conta, log de alterações do plano, execução por série + sessão de treino.
--   B) Nutrição: categoria de alimento, metas por plano, refeições com dia da semana, itens com
--      quantidade/ordem, equivalências, templates de dieta, `meal_logs` (aderência real, substitui
--      a gambiarra em `history_events`) e `water_logs`.
--   C) RLS do aluno: SELECT em exercises/foods/checkin_templates/checkin_questions/orientations
--      (só enviadas) sem client admin; e FECHA escritas indevidas do aluno em orientations,
--      checkin_instances, checkin_answers, metrics, goals e history_events (ver seção C).
--   D) Unicidade defensiva: photos(client_id, week_number, angle) e orientations(client_id,
--      week_number), criadas SOMENTE se não houver duplicata (senão só emite NOTICE).
--
-- EFEITOS COLATERAIS DE PRODUÇÃO QUE O HUMANO PRECISA SABER (detalhes na seção correspondente):
--   1. `workout_plans.client_id` e `nutrition_plans.client_id` passam a aceitar NULL (é assim que
--      um template de conta existe). Nenhuma linha existente muda.
--   2. Depois desta migration o aluno NÃO consegue mais escrever em `history_events`, `goals`,
--      `orientations`, nem deixar um check-in em outro estado que não "pending -> submitted".
--      O único código do app que escrevia em `history_events` com a sessão do aluno era
--      `markMealRealized` (lib/repository.ts) — deve migrar pra `meal_logs`.
--   3. Um trigger BEFORE UPDATE em `checkin_instances` congela colunas de identidade do check-in
--      pra quem não é coach (seção C.3). O coach, o service_role e o SQL Editor não são afetados.
--
-- Convenções herdadas do 0001/0002: snake_case; `account_id` em tabelas de biblioteca por conta,
-- `client_id` nas por aluno; funções de RLS no schema `private` (security definer, stable,
-- set search_path = public); `(select auth.uid())`/`(select private.fn())` em subquery pra o
-- Postgres avaliar uma vez por statement; enums como CHECK (nunca tipo ENUM).

begin;

-- ============================================================================
-- A.1 TREINO — biblioteca de exercícios
-- ============================================================================
-- Grupo muscular e equipamento pra filtro/busca; `is_custom` distingue exercício criado pelo coach
-- (default true: tudo que existe hoje foi criado por coaches) de item semeado da biblioteca base
-- (o app pode semear cópias por conta com is_custom=false). `is_archived` existe porque
-- workout_exercises.exercise_id é ON DELETE RESTRICT: exercício em uso não pode ser apagado, só
-- arquivado. A biblioteca continua sendo POR CONTA (account_id NOT NULL segue valendo).

alter table exercises
  add column if not exists muscle_group text,
  add column if not exists equipment text,
  add column if not exists is_custom boolean not null default true,
  add column if not exists is_archived boolean not null default false;

create index if not exists exercises_account_muscle_group_idx on exercises(account_id, muscle_group);
create index if not exists exercises_account_category_idx on exercises(account_id, category);

-- ============================================================================
-- A.2 TREINO — templates de treino por conta (workout_plans)
-- ============================================================================
-- Template = plano com is_template = true, sem aluno (client_id NULL) e com account_id. Isso exige
-- `client_id` aceitar NULL (DROP NOT NULL é só metadado, não toca em linha nenhuma). As policies
-- existentes (`workout_plans_by_client` etc.) usam can_access_client(client_id), que devolve false
-- pra NULL — portanto um template NUNCA é visível pelo aluno nem por outra conta; o acesso do coach
-- dono vem das policies `*_template_by_account` na seção E. `account_id` fica NULL nos planos de
-- aluno já existentes (não faço backfill: seria UPDATE em dado existente); o app deve preenchê-lo
-- nos novos. O CHECK abaixo é satisfeito por todas as linhas atuais (client_id ainda é não-nulo
-- nelas e is_template nasce false).

alter table workout_plans alter column client_id drop not null;

alter table workout_plans
  add column if not exists account_id uuid references accounts(id) on delete cascade,
  add column if not exists is_template boolean not null default false,
  add column if not exists description text,
  add column if not exists source_template_id uuid references workout_plans(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_plans_template_shape_check'
      and conrelid = 'workout_plans'::regclass
  ) then
    alter table workout_plans add constraint workout_plans_template_shape_check
      check (
        (is_template and client_id is null and account_id is not null)
        or (not is_template and client_id is not null)
      );
  end if;
end $$;

create index if not exists workout_plans_account_template_idx on workout_plans(account_id) where is_template;
create index if not exists workout_plans_source_template_idx on workout_plans(source_template_id) where source_template_id is not null;

-- ============================================================================
-- A.3 TREINO — campos por exercício-no-dia (workout_exercises)
-- ============================================================================
-- `reps` (atual) continua existindo; reps_min/reps_max são a faixa prescrita. block_type separa
-- aquecimento/normal/cardio (default 'normal' = comportamento de hoje). group_kind + group_key
-- formam superset/circuito: exercícios do MESMO dia com o mesmo group_key pertencem ao grupo.
-- substitute_exercise_id = exercício substituto permitido (ON DELETE SET NULL). duration_sec
-- serve os blocos de cardio, que não têm sets/reps. Todas as colunas são nuláveis ou têm default.

alter table workout_exercises
  add column if not exists reps_min integer check (reps_min is null or reps_min >= 0),
  add column if not exists reps_max integer check (reps_max is null or reps_max >= 0),
  add column if not exists suggested_load numeric check (suggested_load is null or suggested_load >= 0),
  add column if not exists tempo text check (tempo is null or char_length(tempo) <= 20),
  add column if not exists block_type text not null default 'normal' check (block_type in ('warmup', 'normal', 'cardio')),
  add column if not exists group_kind text check (group_kind is null or group_kind in ('superset', 'circuit')),
  add column if not exists group_key text check (group_key is null or char_length(group_key) between 1 and 20),
  add column if not exists substitute_exercise_id uuid references exercises(id) on delete set null,
  add column if not exists duration_sec integer check (duration_sec is null or duration_sec >= 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_exercises_reps_range_check'
      and conrelid = 'workout_exercises'::regclass
  ) then
    alter table workout_exercises add constraint workout_exercises_reps_range_check
      check (reps_min is null or reps_max is null or reps_max >= reps_min);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_exercises_group_pair_check'
      and conrelid = 'workout_exercises'::regclass
  ) then
    alter table workout_exercises add constraint workout_exercises_group_pair_check
      check ((group_kind is null) = (group_key is null));
  end if;
end $$;

create index if not exists workout_exercises_substitute_idx on workout_exercises(substitute_exercise_id) where substitute_exercise_id is not null;

-- ============================================================================
-- A.4 TREINO — sessão de treino do aluno (workout_sessions)
-- ============================================================================
-- Uma sessão = o aluno executando um dia do plano, do início ao fim, com pausa e resumo.
-- `unique (id, client_id)` existe só pra permitir a FK composta de workout_logs (A.5), que
-- garante NO BANCO que um log só aponta pra sessão do MESMO aluno. plan_id/day_id são ON DELETE
-- SET NULL (a sessão executada é histórico e sobrevive à edição do plano); `summary` guarda um
-- snapshot livre (nome do dia, volume total etc.) pelo mesmo motivo.

create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  plan_id uuid references workout_plans(id) on delete set null,
  day_id uuid references workout_days(id) on delete set null,
  week_number integer not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'paused', 'completed')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  paused_total_sec integer not null default 0 check (paused_total_sec >= 0),
  ended_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  student_note text,
  perceived_effort integer check (perceived_effort is null or perceived_effort between 1 and 10),
  created_at timestamptz not null default now(),
  unique (id, client_id),
  check (ended_at is null or ended_at >= started_at),
  check (status <> 'completed' or ended_at is not null)
);
create index if not exists workout_sessions_client_week_idx on workout_sessions(client_id, week_number);
create index if not exists workout_sessions_client_started_idx on workout_sessions(client_id, started_at desc);
create index if not exists workout_sessions_plan_idx on workout_sessions(plan_id) where plan_id is not null;
create index if not exists workout_sessions_day_idx on workout_sessions(day_id) where day_id is not null;

alter table workout_sessions enable row level security;

-- ============================================================================
-- A.5 TREINO — execução por série (workout_logs)
-- ============================================================================
-- Hoje workout_logs guarda uma linha por exercício/semana. Passa a poder guardar uma linha POR
-- SÉRIE, ligada à sessão e ao exercício prescrito. Tudo nulável: as linhas antigas continuam
-- válidas e o fluxo atual do app (insert sem esses campos) segue funcionando. O unique abaixo só
-- vale quando os três campos são não-nulos (NULLs são distintos em unique) — logo não colide com
-- nenhum dado existente — e permite upsert por (sessão, exercício prescrito, nº da série).

alter table workout_logs
  add column if not exists session_id uuid,
  add column if not exists workout_exercise_id uuid references workout_exercises(id) on delete set null,
  add column if not exists set_number integer check (set_number is null or set_number >= 1),
  add column if not exists perceived_rir integer check (perceived_rir is null or perceived_rir between 0 and 10),
  add column if not exists student_note text;

-- FK composta (session_id, client_id) -> workout_sessions(id, client_id): impede, no banco, que
-- um aluno grave log apontando pra sessão de OUTRO aluno, sem precisar mexer na policy existente
-- `workout_logs_by_client`. Com session_id NULL a FK (MATCH SIMPLE) não é checada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_logs_session_client_fk'
      and conrelid = 'workout_logs'::regclass
  ) then
    alter table workout_logs add constraint workout_logs_session_client_fk
      foreign key (session_id, client_id) references workout_sessions (id, client_id) on delete cascade;
  end if;
end $$;

create index if not exists workout_logs_session_idx on workout_logs(session_id) where session_id is not null;
create index if not exists workout_logs_workout_exercise_idx on workout_logs(workout_exercise_id) where workout_exercise_id is not null;
create unique index if not exists workout_logs_session_exercise_set_uidx
  on workout_logs(session_id, workout_exercise_id, set_number);

-- ============================================================================
-- A.6 / B.7 — histórico de alterações do plano (treino e nutrição), log append-only
-- ============================================================================
-- Uma tabela só (plan_kind diferencia). `plan_id` NÃO tem FK de propósito: o log deve sobreviver à
-- exclusão do plano (é auditoria). `actor_id` = coach que fez a alteração (ON DELETE SET NULL) e
-- `actor_name` é snapshot do nome, pra o "quem" continuar legível. `client_id` é NULL quando a
-- alteração foi num template. Sem UPDATE/DELETE por policy: ninguém reescreve o passado pela API.

create table if not exists plan_change_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  plan_kind text not null check (plan_kind in ('workout', 'nutrition')),
  plan_id uuid not null,
  actor_id uuid references coach_users(id) on delete set null,
  actor_name text,
  action text not null check (action in ('created', 'updated', 'deleted', 'published', 'unpublished', 'template_applied')),
  entity text,
  entity_id uuid,
  summary text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists plan_change_logs_plan_idx on plan_change_logs(plan_kind, plan_id, created_at desc);
create index if not exists plan_change_logs_account_idx on plan_change_logs(account_id, created_at desc);
create index if not exists plan_change_logs_client_idx on plan_change_logs(client_id, created_at desc) where client_id is not null;

alter table plan_change_logs enable row level security;

-- ============================================================================
-- B.1 NUTRIÇÃO — alimentos, planos (metas + templates), refeições, itens, substituições
-- ============================================================================
-- foods.macros (jsonb) continua sendo a fonte de kcal/macros. Metas por plano viram colunas em
-- nutrition_plans (uma linha por plano, sem tabela extra; o aluno já lê o plano pelas policies
-- existentes). Templates de dieta seguem o mesmo desenho dos de treino (A.2): client_id NULL +
-- account_id + is_template. meals.time (horário) e meals.sort_order já existem; entra o dia da
-- semana opcional (ISO: 1 = segunda ... 7 = domingo; NULL = todos os dias).

alter table foods
  add column if not exists category text,
  add column if not exists is_archived boolean not null default false;
create index if not exists foods_account_category_idx on foods(account_id, category);

alter table nutrition_plans alter column client_id drop not null;

alter table nutrition_plans
  add column if not exists account_id uuid references accounts(id) on delete cascade,
  add column if not exists is_template boolean not null default false,
  add column if not exists description text,
  add column if not exists source_template_id uuid references nutrition_plans(id) on delete set null,
  add column if not exists target_kcal integer check (target_kcal is null or target_kcal >= 0),
  add column if not exists target_protein_g numeric check (target_protein_g is null or target_protein_g >= 0),
  add column if not exists target_carbs_g numeric check (target_carbs_g is null or target_carbs_g >= 0),
  add column if not exists target_fat_g numeric check (target_fat_g is null or target_fat_g >= 0),
  add column if not exists target_water_ml integer check (target_water_ml is null or target_water_ml >= 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nutrition_plans_template_shape_check'
      and conrelid = 'nutrition_plans'::regclass
  ) then
    alter table nutrition_plans add constraint nutrition_plans_template_shape_check
      check (
        (is_template and client_id is null and account_id is not null)
        or (not is_template and client_id is not null)
      );
  end if;
end $$;

create index if not exists nutrition_plans_account_template_idx on nutrition_plans(account_id) where is_template;
create index if not exists nutrition_plans_source_template_idx on nutrition_plans(source_template_id) where source_template_id is not null;

alter table meals
  add column if not exists day_of_week smallint check (day_of_week is null or day_of_week between 1 and 7),
  add column if not exists notes text;

-- `qty` (texto livre, ex.: "2 fatias") continua; quantity + unit são a forma estruturada.
alter table meal_items
  add column if not exists quantity numeric check (quantity is null or quantity >= 0),
  add column if not exists unit text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists notes text;

-- Substituição por item: agora com quantidade/macros próprios da alternativa.
alter table meal_substitutions
  add column if not exists alternative_qty text,
  add column if not exists macros jsonb not null default '{}'::jsonb,
  add column if not exists note text;

-- ============================================================================
-- B.2 NUTRIÇÃO — tabela de equivalências (biblioteca por conta)
-- ============================================================================
-- "1 <unidade de food_id> equivale a <factor> <unidade de equivalent_food_id>" — reaproveitável
-- entre planos (a substituição por item, acima, cobre o caso pontual). Escrita só pelo coach da
-- conta; o aluno lê apenas as equivalências de alimentos que já aparecem no plano publicado dele.

create table if not exists food_equivalences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  food_id uuid not null references foods(id) on delete cascade,
  equivalent_food_id uuid not null references foods(id) on delete cascade,
  factor numeric not null default 1 check (factor > 0),
  note text,
  unique (food_id, equivalent_food_id),
  check (food_id <> equivalent_food_id)
);
create index if not exists food_equivalences_account_idx on food_equivalences(account_id);
create index if not exists food_equivalences_equivalent_idx on food_equivalences(equivalent_food_id);

alter table food_equivalences enable row level security;

-- ============================================================================
-- B.3 NUTRIÇÃO — aderência da refeição (meal_logs) e água diária (water_logs)
-- ============================================================================
-- meal_logs é a tabela certa pro que hoje é uma linha em history_events com marcador de texto
-- ("MEAL_REALIZED:<meal_id>:<semana>"). Uma linha por aluno+refeição+DIA (unique) — permite
-- upsert. `log_date` é obrigatório e SEM default de propósito: current_date do servidor é UTC e
-- viraria o dia errado à noite no Brasil; o app envia a data local do aluno. meal_id é ON DELETE
-- SET NULL + `meal_name` (snapshot) pra que a aderência histórica sobreviva a uma refeição
-- removida do plano. `storage_path` = foto opcional no bucket privado, no padrão do ARCHITECTURE:
-- `account_id/client_id/...` (a policy do aluno exige esse prefixo).

create table if not exists meal_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  meal_id uuid references meals(id) on delete set null,
  meal_name text,
  log_date date not null,
  status text not null check (status in ('done', 'partial', 'skipped')),
  difficulty integer check (difficulty is null or difficulty between 1 and 5),
  note text,
  storage_path text,
  logged_at timestamptz not null default now(),
  unique (client_id, meal_id, log_date)
);
create index if not exists meal_logs_client_date_idx on meal_logs(client_id, log_date desc);
create index if not exists meal_logs_meal_idx on meal_logs(meal_id) where meal_id is not null;

alter table meal_logs enable row level security;

-- water_logs: UM total por aluno+dia (upsert). Escolha deliberada vs. "um evento por copo": o
-- pedido é "registro de água diária" e o total diário é o que o gráfico/coach consomem.
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  log_date date not null,
  amount_ml integer not null check (amount_ml >= 0 and amount_ml <= 20000),
  logged_at timestamptz not null default now(),
  unique (client_id, log_date)
);

alter table water_logs enable row level security;

-- ============================================================================
-- FUNÇÕES DE APOIO PRA RLS (schema private, mesmo padrão do 0001)
-- ============================================================================
-- Criadas DEPOIS das colunas/tabelas novas porque funções `language sql` são validadas na criação.

-- Conta (account_id) do ALUNO autenticado; NULL se o usuário logado não é aluno.
-- `clients.auth_user_id` é único (clients_auth_user_id_idx), então devolve no máximo 1 linha.
create or replace function private.current_client_account_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select account_id from clients where auth_user_id = (select auth.uid())
$$;

-- true se o aluno `client_row_id` pertence à conta do COACH autenticado (só o lado coach de
-- can_access_client; usado onde o aluno NÃO deve ter acesso de escrita).
create or replace function private.is_coach_of_client(client_row_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from clients c
    where c.id = client_row_id
      and c.account_id = private.current_account_id()
  )
$$;

-- Métricas que o aluno legitimamente grava via check-in (mesma lista de METRIC_KEYS_FROM_ANSWERS
-- em lib/repository.ts) e só enquanto a semana tem check-in ainda não avaliado
-- (pending/late/submitted). `adherence_pct`, metas (*_goal) etc. nunca são escritas pelo aluno.
create or replace function private.client_can_write_metric(client_row_id uuid, p_week integer, p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_key in (
      'weight_kg', 'waist_cm', 'hip_cm', 'body_fat_pct', 'workouts_count',
      'cardio_count', 'water_l', 'sleep_h', 'energy', 'hunger'
    )
    and exists (
      select 1
      from checkin_instances ci
      join clients c on c.id = ci.client_id
      where ci.client_id = client_row_id
        and ci.week_number = p_week
        and ci.status in ('pending', 'late', 'submitted')
        and c.auth_user_id = (select auth.uid())
    )
$$;

-- Ids de exercícios que o ALUNO autenticado pode ler: os dos planos PUBLICADOS dele (exercício
-- principal + substituto permitido). Set-returning, pra a policy avaliar uma vez por statement.
create or replace function private.client_visible_exercise_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select x.exercise_id
  from clients c
  join workout_plans wp on wp.client_id = c.id and wp.is_draft = false
  join workout_days wd on wd.plan_id = wp.id
  join workout_exercises we on we.day_id = wd.id
  cross join lateral (values (we.exercise_id), (we.substitute_exercise_id)) as x(exercise_id)
  where c.auth_user_id = (select auth.uid())
    and x.exercise_id is not null
$$;

-- Ids de alimentos que o ALUNO autenticado pode ler: os itens do plano de nutrição PUBLICADO,
-- as alternativas de substituição desses itens e as equivalências cadastradas pra esses itens.
create or replace function private.client_visible_food_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  with my_items as (
    select mi.id as item_id, mi.food_id
    from clients c
    join nutrition_plans np on np.client_id = c.id and np.is_draft = false
    join meals m on m.plan_id = np.id
    join meal_items mi on mi.meal_id = m.id
    where c.auth_user_id = (select auth.uid())
  )
  select my_items.food_id from my_items where my_items.food_id is not null
  union
  select ms.alternative_food_id
  from my_items
  join meal_substitutions ms on ms.meal_item_id = my_items.item_id
  where ms.alternative_food_id is not null
  union
  select fe.equivalent_food_id
  from my_items
  join food_equivalences fe on fe.food_id = my_items.food_id
$$;

-- ============================================================================
-- C.1 RLS DO ALUNO — leitura da biblioteca/configuração da conta do coach dele
-- ============================================================================
-- Lacuna documentada em lib/repository.ts (getTemplateWithQuestions / getExercisesByIds /
-- getFoodsByIds) e lib/evaluations.ts: o aluno não conseguia ler exercises/foods/checkin_templates/
-- checkin_questions porque só referenciam account_id/template_id (não client_id), então
-- can_access_client não se aplica; o app contornava com o client admin (service role).
-- Aqui: SELECT (nunca escrita) restrito à conta do aluno; exercises/foods ainda mais estreito —
-- só o que aparece nos planos PUBLICADOS dele (rascunho não vaza nome de exercício/alimento).

drop policy if exists checkin_templates_client_read on checkin_templates;
create policy checkin_templates_client_read on checkin_templates for select to authenticated
  using (account_id = (select private.current_client_account_id()));

drop policy if exists checkin_questions_client_read on checkin_questions;
create policy checkin_questions_client_read on checkin_questions for select to authenticated
  using (
    template_id in (
      select id from checkin_templates
      where account_id = (select private.current_client_account_id())
    )
  );

drop policy if exists exercises_client_read on exercises;
create policy exercises_client_read on exercises for select to authenticated
  using (
    account_id = (select private.current_client_account_id())
    and id in (select private.client_visible_exercise_ids())
  );

drop policy if exists foods_client_read on foods;
create policy foods_client_read on foods for select to authenticated
  using (
    account_id = (select private.current_client_account_id())
    and id in (select private.client_visible_food_ids())
  );

-- ----------------------------------------------------------------------------
-- orientations — SUBSTITUI `orientations_by_client` (0001), como o 0002 fez com notifications.
-- ----------------------------------------------------------------------------
-- Problema confirmado em teste com token real de aluno: `orientations_by_client` usa
-- can_access_client, que TAMBÉM libera o aluno — ele lia via REST o RASCUNHO e a `coach_note`
-- privada do próprio client_id e podia escrever nas orientações. Agora: coach da conta = acesso
-- total; aluno = só SELECT de orientações ENVIADAS (is_draft = false e sent_at não nulo).
-- LIMITAÇÃO CONHECIDA: RLS é por linha, não por coluna — numa orientação enviada o aluno ainda
-- consegue ler `coach_note` e `author_id` se pedir `select=*` direto na REST. Fechar isso exige
-- mover coach_note pra tabela só-do-coach (fora do escopo desta migration aditiva); enquanto isso o
-- app deve continuar selecionando só as colunas seguras (como getMyLatestSentOrientation faz).

drop policy if exists orientations_by_client on orientations;
drop policy if exists orientations_coach_full_access on orientations;
drop policy if exists orientations_client_read_sent on orientations;

create policy orientations_coach_full_access on orientations for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

create policy orientations_client_read_sent on orientations for select to authenticated
  using (
    client_id = (select private.current_client_id())
    and is_draft = false
    and sent_at is not null
  );

-- ============================================================================
-- C.2 RLS DO ALUNO — escritas indevidas fechadas (goals, history_events, metrics)
-- ============================================================================
-- Teste real: as policies `for all` via can_access_client deixavam o aluno escrever em goals,
-- history_events e metrics do próprio client_id (forjar meta/resultado, evento de histórico,
-- métrica). Substituídas por: coach = acesso total; aluno = SELECT do próprio client_id.
--
-- EXCEÇÃO CONSCIENTE — metrics: `submitCheckin` -> `recordMetricsFromAnswers` (lib/repository.ts)
-- faz upsert de metrics COM A SESSÃO DO ALUNO (best-effort dentro de try/catch: se falhar, o coach
-- passaria a ver o check-in sem peso/cintura, e ninguém perceberia). Deixar metrics só-leitura
-- exigiria trocar isso por client admin no mesmo deploy. Em vez disso o aluno mantém INSERT/UPDATE
-- ESTREITO em metrics: só o próprio client_id, só as 10 chaves que vêm das respostas do check-in,
-- e só na semana de um check-in ainda não avaliado (private.client_can_write_metric). Adherence_pct,
-- metas e qualquer semana já avaliada continuam intocáveis. Sem DELETE.

drop policy if exists goals_by_client on goals;
drop policy if exists goals_coach_full_access on goals;
drop policy if exists goals_client_read on goals;
create policy goals_coach_full_access on goals for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy goals_client_read on goals for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists history_events_by_client on history_events;
drop policy if exists history_events_coach_full_access on history_events;
drop policy if exists history_events_client_read on history_events;
create policy history_events_coach_full_access on history_events for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy history_events_client_read on history_events for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists metrics_by_client on metrics;
drop policy if exists metrics_coach_full_access on metrics;
drop policy if exists metrics_client_read on metrics;
drop policy if exists metrics_client_insert on metrics;
drop policy if exists metrics_client_update on metrics;
create policy metrics_coach_full_access on metrics for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy metrics_client_read on metrics for select to authenticated
  using (client_id = (select private.current_client_id()));
create policy metrics_client_insert on metrics for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and private.client_can_write_metric(client_id, week_number, key)
  );
create policy metrics_client_update on metrics for update to authenticated
  using (
    client_id = (select private.current_client_id())
    and private.client_can_write_metric(client_id, week_number, key)
  )
  with check (
    client_id = (select private.current_client_id())
    and private.client_can_write_metric(client_id, week_number, key)
  );

-- ============================================================================
-- C.3 RLS DO ALUNO — checkin_instances e checkin_answers (ciclo de avaliação)
-- ============================================================================
-- Teste real: o aluno conseguia forçar status='reviewed' (e reviewed_at/review_opened_at) no
-- próprio check-in. O que o portal escreve com a sessão do aluno, e continua permitido:
--   - INSERT da instância da semana (getOrCreateCheckinInstance): só status 'pending' e sem datas
--     de envio/avaliação;
--   - UPDATE pending/late -> submitted (submitCheckin);
--   - upsert de checkin_answers ENQUANTO o check-in está pending/late (submitCheckin grava as
--     respostas antes de virar 'submitted').
-- Ficam proibidos ao aluno: DELETE, qualquer outro status, reviewed_at/review_opened_at, e
-- editar respostas depois de enviar/avaliar.
--
-- Como policy RLS não enxerga OLD vs NEW, a transição é garantida em duas camadas:
--   (1) policy de UPDATE: USING (linha atual pending/late) + WITH CHECK (linha nova = submitted,
--       sem reviewed_at/review_opened_at);
--   (2) trigger BEFORE UPDATE (abaixo) que, pra quem não é coach, congela id/client_id/week_number/
--       period_*/template_id/created_at/reviewed_at/review_opened_at e força submitted_at = now()
--       (não dá pra "retrodatar" um envio). Coach da conta, service_role e SQL Editor
--       (auth.uid() nulo) passam livres.

create or replace function private.guard_checkin_instance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or private.is_coach_of_client(old.client_id) then
    return new;
  end if;

  if old.status not in ('pending', 'late') then
    raise exception 'Check-in já enviado: apenas o coach pode alterá-lo.' using errcode = '42501';
  end if;

  if new.status is distinct from 'submitted'
     or new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.week_number is distinct from old.week_number
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.template_id is distinct from old.template_id
     or new.created_at is distinct from old.created_at
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_opened_at is distinct from old.review_opened_at
  then
    raise exception 'O aluno só pode enviar o próprio check-in (pending/late -> submitted).' using errcode = '42501';
  end if;

  new.submitted_at := now();
  return new;
end;
$$;

drop trigger if exists checkin_instances_guard_update on checkin_instances;
create trigger checkin_instances_guard_update
  before update on checkin_instances
  for each row execute function private.guard_checkin_instance_update();

drop policy if exists checkin_instances_coach_access on checkin_instances;
drop policy if exists checkin_instances_coach_full_access on checkin_instances;
drop policy if exists checkin_instances_client_read on checkin_instances;
drop policy if exists checkin_instances_client_insert on checkin_instances;
drop policy if exists checkin_instances_client_submit on checkin_instances;

create policy checkin_instances_coach_full_access on checkin_instances for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

create policy checkin_instances_client_read on checkin_instances for select to authenticated
  using (client_id = (select private.current_client_id()));

create policy checkin_instances_client_insert on checkin_instances for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and status = 'pending'
    and submitted_at is null
    and reviewed_at is null
    and review_opened_at is null
  );

create policy checkin_instances_client_submit on checkin_instances for update to authenticated
  using (
    client_id = (select private.current_client_id())
    and status in ('pending', 'late')
  )
  with check (
    client_id = (select private.current_client_id())
    and status = 'submitted'
    and reviewed_at is null
    and review_opened_at is null
  );

drop policy if exists checkin_answers_by_instance on checkin_answers;
drop policy if exists checkin_answers_coach_full_access on checkin_answers;
drop policy if exists checkin_answers_client_read on checkin_answers;
drop policy if exists checkin_answers_client_insert on checkin_answers;
drop policy if exists checkin_answers_client_update on checkin_answers;

create policy checkin_answers_coach_full_access on checkin_answers for all to authenticated
  using (checkin_id in (select id from checkin_instances where private.is_coach_of_client(client_id)))
  with check (checkin_id in (select id from checkin_instances where private.is_coach_of_client(client_id)));

create policy checkin_answers_client_read on checkin_answers for select to authenticated
  using (checkin_id in (select id from checkin_instances where client_id = (select private.current_client_id())));

create policy checkin_answers_client_insert on checkin_answers for insert to authenticated
  with check (
    checkin_id in (
      select id from checkin_instances
      where client_id = (select private.current_client_id())
        and status in ('pending', 'late')
    )
  );

create policy checkin_answers_client_update on checkin_answers for update to authenticated
  using (
    checkin_id in (
      select id from checkin_instances
      where client_id = (select private.current_client_id())
        and status in ('pending', 'late')
    )
  )
  with check (
    checkin_id in (
      select id from checkin_instances
      where client_id = (select private.current_client_id())
        and status in ('pending', 'late')
    )
  );

-- ============================================================================
-- D. UNICIDADE DEFENSIVA — photos(client_id, week_number, angle) e orientations(client_id, week_number)
-- ============================================================================
-- A app faz "upsert" manual nas duas (select -> update/insert, com auto-cura de duplicata por
-- corrida), o que indica que duplicatas PODEM existir em produção. Criar um unique com duplicata
-- presente derrubaria a migration inteira — e eu não posso apagar dado. Então: só cria o índice se
-- não houver duplicata; se houver, emite NOTICE e segue (o resto da migration não depende disso).
-- Se pular, o humano limpa as duplicatas (manter a linha mais antiga) e roda ESTE bloco de novo.
-- Conferir depois: select indexname from pg_indexes
--   where indexname in ('photos_client_week_angle_uidx', 'orientations_client_week_uidx');
-- Consequência no app quando o índice existe: um INSERT concorrente perdedor passa a falhar com
-- 23505 em vez de gerar duplicata — o app deve tratar (reler e atualizar) e habilita upsert por
-- onConflict "client_id,week_number,angle" / "client_id,week_number".

do $$
begin
  if exists (select 1 from photos group by client_id, week_number, angle having count(*) > 1) then
    raise notice '0003: photos tem duplicatas em (client_id, week_number, angle) — unique NAO criado. Limpe as duplicatas e rode este bloco de novo.';
  else
    create unique index if not exists photos_client_week_angle_uidx on photos(client_id, week_number, angle);
  end if;

  if exists (select 1 from orientations group by client_id, week_number having count(*) > 1) then
    raise notice '0003: orientations tem duplicatas em (client_id, week_number) — unique NAO criado. Limpe as duplicatas e rode este bloco de novo.';
  else
    create unique index if not exists orientations_client_week_uidx on orientations(client_id, week_number);
  end if;
end $$;

-- ============================================================================
-- E. POLICIES — templates de treino/dieta (só o coach dono da conta)
-- ============================================================================
-- Aditivas: convivem (OR) com as policies por aluno do 0001, que já negam qualquer linha de
-- template (client_id NULL). O aluno nunca enxerga template: nenhuma policy de aluno os alcança.

drop policy if exists workout_plans_template_by_account on workout_plans;
create policy workout_plans_template_by_account on workout_plans for all to authenticated
  using (is_template and account_id = (select private.current_account_id()))
  with check (is_template and account_id = (select private.current_account_id()));

drop policy if exists workout_days_template_by_account on workout_days;
create policy workout_days_template_by_account on workout_days for all to authenticated
  using (
    plan_id in (
      select id from workout_plans
      where is_template and account_id = (select private.current_account_id())
    )
  )
  with check (
    plan_id in (
      select id from workout_plans
      where is_template and account_id = (select private.current_account_id())
    )
  );

drop policy if exists workout_exercises_template_by_account on workout_exercises;
create policy workout_exercises_template_by_account on workout_exercises for all to authenticated
  using (
    day_id in (
      select wd.id from workout_days wd
      join workout_plans wp on wp.id = wd.plan_id
      where wp.is_template and wp.account_id = (select private.current_account_id())
    )
  )
  with check (
    day_id in (
      select wd.id from workout_days wd
      join workout_plans wp on wp.id = wd.plan_id
      where wp.is_template and wp.account_id = (select private.current_account_id())
    )
  );

drop policy if exists nutrition_plans_template_by_account on nutrition_plans;
create policy nutrition_plans_template_by_account on nutrition_plans for all to authenticated
  using (is_template and account_id = (select private.current_account_id()))
  with check (is_template and account_id = (select private.current_account_id()));

drop policy if exists meals_template_by_account on meals;
create policy meals_template_by_account on meals for all to authenticated
  using (
    plan_id in (
      select id from nutrition_plans
      where is_template and account_id = (select private.current_account_id())
    )
  )
  with check (
    plan_id in (
      select id from nutrition_plans
      where is_template and account_id = (select private.current_account_id())
    )
  );

drop policy if exists meal_items_template_by_account on meal_items;
create policy meal_items_template_by_account on meal_items for all to authenticated
  using (
    meal_id in (
      select m.id from meals m
      join nutrition_plans np on np.id = m.plan_id
      where np.is_template and np.account_id = (select private.current_account_id())
    )
  )
  with check (
    meal_id in (
      select m.id from meals m
      join nutrition_plans np on np.id = m.plan_id
      where np.is_template and np.account_id = (select private.current_account_id())
    )
  );

drop policy if exists meal_substitutions_template_by_account on meal_substitutions;
create policy meal_substitutions_template_by_account on meal_substitutions for all to authenticated
  using (
    meal_item_id in (
      select mi.id from meal_items mi
      join meals m on m.id = mi.meal_id
      join nutrition_plans np on np.id = m.plan_id
      where np.is_template and np.account_id = (select private.current_account_id())
    )
  )
  with check (
    meal_item_id in (
      select mi.id from meal_items mi
      join meals m on m.id = mi.meal_id
      join nutrition_plans np on np.id = m.plan_id
      where np.is_template and np.account_id = (select private.current_account_id())
    )
  );

-- ============================================================================
-- F. POLICIES — tabelas novas (RLS já habilitado acima em cada uma)
-- ============================================================================
-- Padrão: coach da conta = `for all` via private.is_coach_of_client; aluno = só o que precisa,
-- sempre amarrado ao próprio client_id (private.current_client_id()). Outro aluno (mesma ou outra
-- conta) e outra conta de coach não passam em nenhuma policy.

-- workout_sessions: aluno lê, cria e atualiza (pausar/concluir/resumo) as PRÓPRIAS sessões; não
-- apaga. WITH CHECK amarra plan_id/day_id a planos do mesmo aluno (nada de apontar pro plano de outro).
drop policy if exists workout_sessions_coach_full_access on workout_sessions;
create policy workout_sessions_coach_full_access on workout_sessions for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

drop policy if exists workout_sessions_client_read on workout_sessions;
create policy workout_sessions_client_read on workout_sessions for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists workout_sessions_client_insert on workout_sessions;
create policy workout_sessions_client_insert on workout_sessions for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and (plan_id is null or plan_id in (
      select id from workout_plans where client_id = workout_sessions.client_id
    ))
    and (day_id is null or day_id in (
      select wd.id from workout_days wd
      join workout_plans wp on wp.id = wd.plan_id
      where wp.client_id = workout_sessions.client_id
    ))
  );

drop policy if exists workout_sessions_client_update on workout_sessions;
create policy workout_sessions_client_update on workout_sessions for update to authenticated
  using (client_id = (select private.current_client_id()))
  with check (
    client_id = (select private.current_client_id())
    and (plan_id is null or plan_id in (
      select id from workout_plans where client_id = workout_sessions.client_id
    ))
    and (day_id is null or day_id in (
      select wd.id from workout_days wd
      join workout_plans wp on wp.id = wd.plan_id
      where wp.client_id = workout_sessions.client_id
    ))
  );

-- workout_logs (tabela existente): NENHUMA policy nova. `workout_logs_by_client` (0001, for all via
-- can_access_client) já deixa o aluno ler/gravar os próprios logs e o coach os do aluno dele, e
-- as colunas novas herdam isso. A amarra "log só aponta pra sessão do mesmo aluno" está na FK
-- composta workout_logs_session_client_fk (A.5).

-- plan_change_logs: só o coach da conta, só LER e INSERIR (append-only). O INSERT exige que o autor
-- seja o próprio usuário autenticado (sem forjar "quem") e, se houver client_id, que o aluno seja
-- da conta. Aluno não lê nem escreve (é log interno do coach).
drop policy if exists plan_change_logs_coach_read on plan_change_logs;
create policy plan_change_logs_coach_read on plan_change_logs for select to authenticated
  using (account_id = (select private.current_account_id()));

drop policy if exists plan_change_logs_coach_insert on plan_change_logs;
create policy plan_change_logs_coach_insert on plan_change_logs for insert to authenticated
  with check (
    account_id = (select private.current_account_id())
    and actor_id = (select auth.uid())
    and (client_id is null or private.is_coach_of_client(client_id))
  );

-- food_equivalences: coach escreve (só com alimentos da própria conta); aluno só lê as
-- equivalências entre alimentos que ele já enxerga no plano publicado.
drop policy if exists food_equivalences_coach_full_access on food_equivalences;
create policy food_equivalences_coach_full_access on food_equivalences for all to authenticated
  using (account_id = (select private.current_account_id()))
  with check (
    account_id = (select private.current_account_id())
    and food_id in (select id from foods where account_id = (select private.current_account_id()))
    and equivalent_food_id in (select id from foods where account_id = (select private.current_account_id()))
  );

drop policy if exists food_equivalences_client_read on food_equivalences;
create policy food_equivalences_client_read on food_equivalences for select to authenticated
  using (
    account_id = (select private.current_client_account_id())
    and food_id in (select private.client_visible_food_ids())
    and equivalent_food_id in (select private.client_visible_food_ids())
  );

-- meal_logs: aluno lê, marca, corrige e DESMARCA (delete) as próprias refeições — o desmarcar é a
-- lacuna anotada em markMealRealized. WITH CHECK: meal_id (se houver) precisa ser refeição de plano
-- do mesmo aluno e storage_path (se houver) precisa estar sob `account_id/client_id/`.
drop policy if exists meal_logs_coach_full_access on meal_logs;
create policy meal_logs_coach_full_access on meal_logs for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

drop policy if exists meal_logs_client_read on meal_logs;
create policy meal_logs_client_read on meal_logs for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists meal_logs_client_insert on meal_logs;
create policy meal_logs_client_insert on meal_logs for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and (meal_id is null or meal_id in (
      select m.id from meals m
      join nutrition_plans np on np.id = m.plan_id
      where np.client_id = meal_logs.client_id
    ))
    and (
      storage_path is null
      or (
        starts_with(storage_path, (select private.current_client_account_id())::text || '/' || client_id::text || '/')
        and position('..' in storage_path) = 0
      )
    )
  );

drop policy if exists meal_logs_client_update on meal_logs;
create policy meal_logs_client_update on meal_logs for update to authenticated
  using (client_id = (select private.current_client_id()))
  with check (
    client_id = (select private.current_client_id())
    and (meal_id is null or meal_id in (
      select m.id from meals m
      join nutrition_plans np on np.id = m.plan_id
      where np.client_id = meal_logs.client_id
    ))
    and (
      storage_path is null
      or (
        starts_with(storage_path, (select private.current_client_account_id())::text || '/' || client_id::text || '/')
        and position('..' in storage_path) = 0
      )
    )
  );

drop policy if exists meal_logs_client_delete on meal_logs;
create policy meal_logs_client_delete on meal_logs for delete to authenticated
  using (client_id = (select private.current_client_id()));

-- water_logs: aluno lê, cria e atualiza o total do dia (upsert) só pro próprio client_id; sem delete
-- (zerar = update amount_ml = 0).
drop policy if exists water_logs_coach_full_access on water_logs;
create policy water_logs_coach_full_access on water_logs for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

drop policy if exists water_logs_client_read on water_logs;
create policy water_logs_client_read on water_logs for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists water_logs_client_insert on water_logs;
create policy water_logs_client_insert on water_logs for insert to authenticated
  with check (client_id = (select private.current_client_id()));

drop policy if exists water_logs_client_update on water_logs;
create policy water_logs_client_update on water_logs for update to authenticated
  using (client_id = (select private.current_client_id()))
  with check (client_id = (select private.current_client_id()));

-- ============================================================================
-- G. PRIVILÉGIOS DE TABELA (GRANT/REVOKE) DAS TABELAS NOVAS
-- ============================================================================
-- RLS decide QUAIS LINHAS; o GRANT decide se o role sequer chega na tabela. Num projeto Supabase
-- os default privileges já concedem tudo em `public` aos roles da API, e os GRANTs abaixo são então
-- no-ops; ficam explícitos pra a migration não depender disso (o Supabase vem restringindo esse
-- default em projetos novos) — sem GRANT o app receberia "permission denied" nas tabelas novas.
-- `anon` (não autenticado) não tem nenhuma policy nas tabelas novas: tiro o acesso também no
-- GRANT. `plan_change_logs` é append-only: além de não ter policy de UPDATE/DELETE, o `authenticated`
-- nem tem o privilégio (defesa em profundidade). Nenhum REVOKE toca em tabela existente.

revoke all on workout_sessions, plan_change_logs, food_equivalences, meal_logs, water_logs from anon;

grant select, insert, update, delete on workout_sessions, food_equivalences, meal_logs, water_logs to authenticated;
grant select, insert on plan_change_logs to authenticated;
revoke update, delete, truncate on plan_change_logs from authenticated;

grant select, insert, update, delete on workout_sessions, food_equivalences, meal_logs, water_logs, plan_change_logs to service_role;

commit;

-- ============================================================================
-- CONFERÊNCIA PÓS-MIGRATION (rodar à parte, só leitura)
-- ============================================================================
--   -- 1) toda tabela de public com RLS ligado (esperado: nenhuma linha com rowsecurity = false)
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
--   -- 2) os dois unique defensivos foram criados? (se faltar, houve duplicata: ver NOTICE / seção D)
--   select indexname from pg_indexes
--   where indexname in ('photos_client_week_angle_uidx', 'orientations_client_week_uidx');
--   -- 3) policies das tabelas mexidas
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' order by tablename, policyname;
