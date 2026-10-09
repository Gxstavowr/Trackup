-- Trackly — 0009: bloqueia REFERÊNCIAS CRUZADAS entre contas (autorização por tenant)
--
-- APLICAR DEPOIS da 0008 (0001 -> ... -> 0008 -> 0009). Migration ADITIVA, feita pra rodar de uma
-- vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou passa inteira ou
-- falha inteira. Reexecutável (idempotente): `create or replace function`, `drop trigger if exists`.
-- Não há DROP TABLE/COLUMN, ALTER TYPE, policy nova/alterada, GRANT/REVOKE em tabela, nem
-- UPDATE/DELETE em dados. Nenhum segredo. Triggers só validam escritas NOVAS — linhas existentes
-- não são relidas nem alteradas (a seção "CONFERÊNCIA" no fim lista as que já violariam a regra).
--
-- POR QUE EXISTE
--   Varredura de autorização contra o banco real (2026-10-08): o RLS confere se a LINHA gravada é
--   da conta de quem grava, mas NÃO confere se os IDs que a linha REFERENCIA (FKs) são da mesma
--   conta. Reproduzido com o token de um coach da conta A e de um aluno da conta A:
--     - clients.coach_id                    -> coach de outra conta          (coach A)
--     - workout_exercises.exercise_id       -> exercício da conta B          (coach A)
--     - workout_exercises.substitute_exercise_id -> exercício da conta B     (coach A)
--     - meal_items.food_id                  -> alimento da conta B           (coach A)
--     - orientations.author_id              -> coach de outra conta          (coach A)
--     - checkin_instances.template_id       -> template da conta B           (coach A)
--     - workout_logs.exercise_id            -> exercício da conta B          (ALUNO A)
--   Impacto: (1) leitura cruzada — o portal do aluno resolve exercícios/alimentos do plano com o
--   client admin (lib/repository.ts `getExercisesByIds`/`getFoodsByIds`), então um coach que
--   soubesse o UUID de um exercício/alimento de outra conta conseguiria ler o conteúdo dele pelo
--   portal de um aluno de teste; (2) negação de serviço — `exercise_id ... on delete restrict` e
--   `coach_id ... on delete restrict` impediriam a conta B de apagar o próprio exercício / coach;
--   (3) integridade — convite (`lib/invite-preview.ts`) mostraria o nome do coach de outra conta.
--   UUIDs não são adivinháveis, o que limita a exploração — mas autorização não pode depender de
--   segredo de ID.
--
-- O QUE FAZ
--   Um trigger BEFORE INSERT/UPDATE por tabela, chamando funções `private.*` (security definer,
--   pra enxergar a linha referenciada independente do RLS de quem grava). Regra única: todo ID
--   referenciado precisa pertencer à MESMA conta (account_id) da linha que referencia. Violação ->
--   `raise exception 'trackly:cross_account_reference'` (SQLSTATE 42501, mesmo código de erro de
--   RLS — o app já trata como "sem permissão"). Também cobre, pela mesma regra, referências que o
--   teste não exercitou mas são da mesma classe: meal_substitutions.alternative_food_id,
--   workout_plans/nutrition_plans.source_template_id, photos.checkin_id, meal_logs.meal_id.
--   NULL continua permitido onde a coluna já aceitava NULL.
--
-- Vale pra todo mundo (inclusive service_role): o próprio app nunca grava referência cruzada.

begin;

-- ============================================================================
-- Funções de apoio (schema private)
-- ============================================================================

-- Conta "dona" de um plano de treino: template -> account_id; plano de aluno -> conta do aluno.
create or replace function private.workout_plan_account(p_plan_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(p.account_id, c.account_id)
  from workout_plans p
  left join clients c on c.id = p.client_id
  where p.id = p_plan_id
$$;

create or replace function private.nutrition_plan_account(p_plan_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(p.account_id, c.account_id)
  from nutrition_plans p
  left join clients c on c.id = p.client_id
  where p.id = p_plan_id
$$;

create or replace function private.raise_cross_account(p_what text)
returns void
language plpgsql
as $$
begin
  raise exception 'trackly:cross_account_reference'
    using errcode = '42501', detail = p_what;
end;
$$;

-- ---- clients.coach_id -------------------------------------------------------
create or replace function private.guard_clients_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from coach_users cu where cu.id = new.coach_id and cu.account_id = new.account_id
  ) then
    perform private.raise_cross_account('clients.coach_id');
  end if;
  return new;
end;
$$;

-- ---- orientations.author_id / checkin_instances.template_id / photos.checkin_id ----------
create or replace function private.guard_orientations_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.author_id is not null and not exists (
    select 1 from coach_users cu join clients c on c.account_id = cu.account_id
    where cu.id = new.author_id and c.id = new.client_id
  ) then
    perform private.raise_cross_account('orientations.author_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_checkin_instances_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.template_id is not null and not exists (
    select 1 from checkin_templates t join clients c on c.account_id = t.account_id
    where t.id = new.template_id and c.id = new.client_id
  ) then
    perform private.raise_cross_account('checkin_instances.template_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_photos_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.checkin_id is not null and not exists (
    select 1 from checkin_instances ci where ci.id = new.checkin_id and ci.client_id = new.client_id
  ) then
    perform private.raise_cross_account('photos.checkin_id');
  end if;
  return new;
end;
$$;

-- ---- treino -----------------------------------------------------------------
create or replace function private.guard_workout_exercises_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  select private.workout_plan_account(d.plan_id) into v_account
  from workout_days d where d.id = new.day_id;

  if not exists (select 1 from exercises e where e.id = new.exercise_id and e.account_id = v_account) then
    perform private.raise_cross_account('workout_exercises.exercise_id');
  end if;
  if new.substitute_exercise_id is not null and not exists (
    select 1 from exercises e where e.id = new.substitute_exercise_id and e.account_id = v_account
  ) then
    perform private.raise_cross_account('workout_exercises.substitute_exercise_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_workout_logs_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from exercises e join clients c on c.account_id = e.account_id
    where e.id = new.exercise_id and c.id = new.client_id
  ) then
    perform private.raise_cross_account('workout_logs.exercise_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_workout_plans_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_template_id is not null
     and private.workout_plan_account(new.source_template_id) is distinct from
         coalesce(new.account_id, (select account_id from clients where id = new.client_id)) then
    perform private.raise_cross_account('workout_plans.source_template_id');
  end if;
  return new;
end;
$$;

-- ---- nutrição ---------------------------------------------------------------
create or replace function private.guard_meal_items_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.food_id is not null and not exists (
    select 1 from meals m join foods f on f.id = new.food_id
    where m.id = new.meal_id and f.account_id = private.nutrition_plan_account(m.plan_id)
  ) then
    perform private.raise_cross_account('meal_items.food_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_meal_substitutions_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.alternative_food_id is not null and not exists (
    select 1 from meal_items mi
    join meals m on m.id = mi.meal_id
    join foods f on f.id = new.alternative_food_id
    where mi.id = new.meal_item_id and f.account_id = private.nutrition_plan_account(m.plan_id)
  ) then
    perform private.raise_cross_account('meal_substitutions.alternative_food_id');
  end if;
  return new;
end;
$$;

create or replace function private.guard_nutrition_plans_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_template_id is not null
     and private.nutrition_plan_account(new.source_template_id) is distinct from
         coalesce(new.account_id, (select account_id from clients where id = new.client_id)) then
    perform private.raise_cross_account('nutrition_plans.source_template_id');
  end if;
  return new;
end;
$$;

-- meal_logs.meal_id: a refeição precisa ser de um plano do PRÓPRIO aluno da linha.
create or replace function private.guard_meal_logs_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.meal_id is not null and not exists (
    select 1 from meals m join nutrition_plans p on p.id = m.plan_id
    where m.id = new.meal_id and p.client_id = new.client_id
  ) then
    perform private.raise_cross_account('meal_logs.meal_id');
  end if;
  return new;
end;
$$;

-- As funções de trigger não são chamáveis como RPC (schema private não é exposto), mas por
-- garantia ninguém além do dono executa diretamente.
revoke all on function private.workout_plan_account(uuid) from public, anon, authenticated;
revoke all on function private.nutrition_plan_account(uuid) from public, anon, authenticated;

-- ============================================================================
-- Triggers (BEFORE, só nas colunas de referência — UPDATE de outros campos não paga o custo)
-- ============================================================================

drop trigger if exists clients_guard_refs on clients;
create trigger clients_guard_refs before insert or update of coach_id, account_id on clients
  for each row execute function private.guard_clients_refs();

drop trigger if exists orientations_guard_refs on orientations;
create trigger orientations_guard_refs before insert or update of author_id, client_id on orientations
  for each row execute function private.guard_orientations_refs();

drop trigger if exists checkin_instances_guard_refs on checkin_instances;
create trigger checkin_instances_guard_refs before insert or update of template_id, client_id on checkin_instances
  for each row execute function private.guard_checkin_instances_refs();

drop trigger if exists photos_guard_refs on photos;
create trigger photos_guard_refs before insert or update of checkin_id, client_id on photos
  for each row execute function private.guard_photos_refs();

drop trigger if exists workout_exercises_guard_refs on workout_exercises;
create trigger workout_exercises_guard_refs before insert or update of exercise_id, substitute_exercise_id, day_id on workout_exercises
  for each row execute function private.guard_workout_exercises_refs();

drop trigger if exists workout_logs_guard_refs on workout_logs;
create trigger workout_logs_guard_refs before insert or update of exercise_id, client_id on workout_logs
  for each row execute function private.guard_workout_logs_refs();

drop trigger if exists workout_plans_guard_refs on workout_plans;
create trigger workout_plans_guard_refs before insert or update of source_template_id, client_id, account_id on workout_plans
  for each row execute function private.guard_workout_plans_refs();

drop trigger if exists meal_items_guard_refs on meal_items;
create trigger meal_items_guard_refs before insert or update of food_id, meal_id on meal_items
  for each row execute function private.guard_meal_items_refs();

drop trigger if exists meal_substitutions_guard_refs on meal_substitutions;
create trigger meal_substitutions_guard_refs before insert or update of alternative_food_id, meal_item_id on meal_substitutions
  for each row execute function private.guard_meal_substitutions_refs();

drop trigger if exists nutrition_plans_guard_refs on nutrition_plans;
create trigger nutrition_plans_guard_refs before insert or update of source_template_id, client_id, account_id on nutrition_plans
  for each row execute function private.guard_nutrition_plans_refs();

drop trigger if exists meal_logs_guard_refs on meal_logs;
create trigger meal_logs_guard_refs before insert or update of meal_id, client_id on meal_logs
  for each row execute function private.guard_meal_logs_refs();

commit;

-- ============================================================================
-- CONFERÊNCIA (opcional, só leitura) — linhas JÁ existentes que violariam a regra. Esperado: 0 em
-- tudo. Rodar separado, depois do commit.
-- ============================================================================
-- select 'clients' t, count(*) from clients c where not exists (select 1 from coach_users cu where cu.id = c.coach_id and cu.account_id = c.account_id)
-- union all select 'workout_exercises', count(*) from workout_exercises we join workout_days d on d.id = we.day_id join exercises e on e.id = we.exercise_id where e.account_id is distinct from private.workout_plan_account(d.plan_id)
-- union all select 'meal_items', count(*) from meal_items mi join meals m on m.id = mi.meal_id join foods f on f.id = mi.food_id where f.account_id is distinct from private.nutrition_plan_account(m.plan_id)
-- union all select 'workout_logs', count(*) from workout_logs wl join clients c on c.id = wl.client_id join exercises e on e.id = wl.exercise_id where e.account_id <> c.account_id
-- union all select 'checkin_instances', count(*) from checkin_instances ci join clients c on c.id = ci.client_id join checkin_templates t on t.id = ci.template_id where t.account_id <> c.account_id
-- union all select 'orientations', count(*) from orientations o join clients c on c.id = o.client_id join coach_users cu on cu.id = o.author_id where cu.account_id <> c.account_id;
