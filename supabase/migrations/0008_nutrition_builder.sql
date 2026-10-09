-- Trackly — 0008: construtor de nutrição do coach (item 20 do master TODO)
--
-- APLICAR DEPOIS da 0007 (0001 -> ... -> 0007 -> 0008). Migration ADITIVA, feita pra rodar de
-- uma vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou passa
-- inteira ou falha inteira. Reexecutável (idempotente): `add column if not exists`, `create
-- index if not exists`, `create or replace function`, constraints atrás de guarda em
-- `pg_constraint`, índices únicos só criados se os dados existentes permitirem (senão NOTICE).
-- Não há DROP TABLE/COLUMN, ALTER TYPE, nem UPDATE/DELETE em dados existentes. Nenhum segredo.
-- NÃO cria nem altera nenhuma policy de RLS (ver "RLS" abaixo) nem toca em nada de treino
-- (`workout_*`, `exercises`) — só nutrição.
--
-- POR QUE EXISTE
--   A 0003 já trouxe quase tudo que o construtor de nutrição precisa (categoria de alimento,
--   metas por plano — kcal/proteína/carbo/gordura/água —, dia da semana por refeição, quantidade
--   estruturada + ordem por item, `food_equivalences`, `meal_logs`, templates via
--   `is_template`/`source_template_id`, `plan_change_logs` já compartilhado com treino via
--   `plan_kind`). Faltava exatamente o mesmo que faltava pro treino antes da 0007: o CICLO DE
--   VIDA do plano (rascunho x publicado x versão anterior — hoje `is_draft` é o único estado) e
--   a atomicidade das operações compostas (duplicar plano/refeição/dia e publicar são vários
--   statements — sem transação no supabase-js, uma falha no meio deixaria o plano pela metade).
--
-- O QUE FAZ
--   A) nutrition_plans: `published_at`, `archived_at` (+ CHECK: arquivado ⇒ publicado, não-
--      template) e índices únicos parciais: no máximo 1 plano PUBLICADO ATIVO e no máximo 1
--      RASCUNHO por aluno — mesmo desenho de `workout_plans` na 0007. Linhas existentes seguem
--      válidas: as publicadas ficam "ativas", `published_at` nulo (o app usa `updated_at` de
--      fallback, mesma convenção que `NutritionPlan` já usava antes desta migration).
--   B) meals: índice (plan_id, day_of_week, sort_order) pra visualização diária (item 20) não
--      precisar varrer o plano inteiro pra montar a lista de um dia da semana.
--   C) Funções `security INVOKER` (o RLS do chamador continua valendo — nada de service role):
--        duplicate_nutrition_plan   copia plano+refeições+itens+substituições (aluno->aluno,
--                                   template->aluno, aluno->template)
--        duplicate_nutrition_meal   copia uma refeição (+ itens + substituições), logo depois
--                                   da original no mesmo "dia" (day_of_week)
--        duplicate_nutrition_day    copia TODAS as refeições de um day_of_week de origem pra um
--                                   day_of_week de destino (dentro do mesmo plano) — "duplicar
--                                   dia" no schema de nutrição, que não tem uma tabela de "dia"
--                                   própria (diferente de `workout_days`): o "dia" aqui é o valor
--                                   de `meals.day_of_week` (1..7; NULL = todo dia)
--        publish_nutrition_plan     rascunho -> publicado, arquivando o publicado anterior
--                                   (atômico) — falha se vazio (nenhum item em nenhuma refeição)
--        reorder_nutrition_meals    aplica uma ordem completa de refeições DENTRO DE UM MESMO
--                                   "dia" (day_of_week, NULL incluso) — mesma decisão de produto
--                                   de `reorder_workout_exercises` (a ordem é por dia, refeição
--                                   "todo dia" e refeição de um dia específico não se misturam
--                                   na mesma chamada)
--        reorder_meal_items         aplica uma ordem completa de itens de uma refeição
--      Erros de negócio saem como `raise exception 'trackly:<codigo>'`; o app traduz o código
--      (`lib/nutrition-builder.ts`, cópia própria de `translateTracklyError` — NUTRIÇÃO não
--      importa nada de `lib/workout-builder.ts` de propósito, pra ficar自 contida e não correr
--      risco de "tocar" na área congelada de treino desta sessão).
--
-- RLS (nada novo, de propósito)
--   Coach da conta: as policies da 0003 (`nutrition_plans_template_by_account`, `meals_template_
--   by_account`, `meal_items_template_by_account`, `meal_substitutions_template_by_account`) e da
--   0004 (`*_coach_full_access`) já cobrem as colunas/linhas novas. Aluno: só LÊ plano
--   `is_draft = false` do próprio client_id (0004) — versões arquivadas continuam legíveis por
--   ele (já foram publicadas pra ele; o app filtra a ativa, mesma decisão de `getActiveWorkoutFor
--   Client`) e o aluno NUNCA escreve plano. As funções abaixo são `security invoker`: um aluno
--   que as chamasse esbarra no RLS (não vê o rascunho, não insere plano) e recebe erro. `anon`
--   não tem EXECUTE.
--
-- EFEITOS COLATERAIS QUE O HUMANO PRECISA SABER
--   1. Os dois índices únicos de (A) só são criados se não houver, hoje, aluno com 2+ planos de
--      nutrição publicados ativos ou 2+ rascunhos; se houver, a migration emite NOTICE e segue (o
--      app continua funcionando, mas sem a trava no banco). Limpe as duplicatas e rode de novo.
--   2. `duplicate_nutrition_*` copiam colunas por lista explícita: coluna nova de nutrição no
--      futuro precisa ser adicionada nessas funções (create or replace).
--   3. `getActiveNutritionPlanForClient` (lib/repository.ts) passa a também excluir
--      `archived_at is not null` — antes desta migration a coluna não existia, então nada
--      mudava; a partir de agora o aluno só vê a versão ativa (mesma correção que `publish_
--      workout_plan`/`getActiveWorkoutForClient` já tinham desde a 0007).

begin;

-- ============================================================================
-- A. nutrition_plans — ciclo de vida (rascunho / publicado / versão anterior)
-- ============================================================================

alter table nutrition_plans
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nutrition_plans_archived_check'
      and conrelid = 'nutrition_plans'::regclass
  ) then
    alter table nutrition_plans add constraint nutrition_plans_archived_check
      check (archived_at is null or (not is_draft and not is_template));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from nutrition_plans
    where client_id is not null and not is_draft and not is_template and archived_at is null
    group by client_id having count(*) > 1
  ) then
    raise notice '0008: ha aluno com 2+ planos de nutricao publicados ativos — indice unico de publicado NAO criado. Arquive/apague os extras e rode este bloco de novo.';
  else
    create unique index if not exists nutrition_plans_one_published_per_client_uidx
      on nutrition_plans(client_id) where client_id is not null and not is_draft and not is_template and archived_at is null;
  end if;

  if exists (
    select 1 from nutrition_plans
    where client_id is not null and is_draft and not is_template
    group by client_id having count(*) > 1
  ) then
    raise notice '0008: ha aluno com 2+ rascunhos de nutricao — indice unico de rascunho NAO criado. Apague os extras e rode este bloco de novo.';
  else
    create unique index if not exists nutrition_plans_one_draft_per_client_uidx
      on nutrition_plans(client_id) where client_id is not null and is_draft and not is_template;
  end if;
end $$;

create index if not exists nutrition_plans_client_state_idx on nutrition_plans(client_id, updated_at desc) where client_id is not null;

-- ============================================================================
-- B. meals — índice pra visualização diária (agrupar por day_of_week rapidamente)
-- ============================================================================

create index if not exists meals_plan_day_sort_idx on meals(plan_id, day_of_week, sort_order);
create index if not exists meal_items_meal_sort_idx on meal_items(meal_id, sort_order);

-- ============================================================================
-- C. Funções (security invoker — o RLS do chamador vale)
-- ============================================================================

-- ---- duplicar plano -------------------------------------------------------
-- p_as_template = true  : cria um TEMPLATE da conta (client_id nulo) a partir de qualquer plano
--                         (de aluno ou outro template), preservando as metas (kcal/macros/água).
-- p_as_template = false : cria um RASCUNHO pro aluno p_target_client_id (da mesma conta da
--                         origem); se a origem é template, grava source_template_id. Falha se o
--                         aluno já tem rascunho (o app oferece "descartar o rascunho" antes).
create or replace function public.duplicate_nutrition_plan(
  p_source_plan_id uuid,
  p_target_client_id uuid,
  p_as_template boolean,
  p_name text default null,
  p_description text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_src nutrition_plans%rowtype;
  v_account uuid;
  v_target_account uuid;
  v_new uuid;
  v_meal record;
  v_new_meal uuid;
  v_item record;
  v_new_item uuid;
  v_name text;
begin
  select * into v_src from nutrition_plans where id = p_source_plan_id;
  if not found then
    raise exception 'trackly:plan_not_found';
  end if;

  v_account := v_src.account_id;
  if v_account is null and v_src.client_id is not null then
    select account_id into v_account from clients where id = v_src.client_id;
  end if;
  if v_account is null then
    raise exception 'trackly:plan_not_found';
  end if;

  v_name := left(coalesce(nullif(btrim(p_name), ''), v_src.name), 120);

  if coalesce(p_as_template, false) then
    insert into nutrition_plans (
      client_id, account_id, name, description, is_draft, is_template, source_template_id,
      target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_water_ml
    )
    values (
      null, v_account, v_name, coalesce(p_description, v_src.description), false, true, null,
      v_src.target_kcal, v_src.target_protein_g, v_src.target_carbs_g, v_src.target_fat_g, v_src.target_water_ml
    )
    returning id into v_new;
  else
    if p_target_client_id is null then
      raise exception 'trackly:client_required';
    end if;
    select account_id into v_target_account from clients where id = p_target_client_id;
    if v_target_account is null then
      raise exception 'trackly:client_not_found';
    end if;
    if v_target_account <> v_account then
      raise exception 'trackly:cross_account';
    end if;
    if exists (
      select 1 from nutrition_plans
      where client_id = p_target_client_id and is_draft and not is_template
    ) then
      raise exception 'trackly:draft_exists';
    end if;

    insert into nutrition_plans (
      client_id, account_id, name, description, is_draft, is_template, source_template_id,
      target_kcal, target_protein_g, target_carbs_g, target_fat_g, target_water_ml
    )
    values (
      p_target_client_id, v_account, v_name, coalesce(p_description, v_src.description), true, false,
      case when v_src.is_template then v_src.id else null end,
      v_src.target_kcal, v_src.target_protein_g, v_src.target_carbs_g, v_src.target_fat_g, v_src.target_water_ml
    )
    returning id into v_new;
  end if;

  for v_meal in
    select * from meals where plan_id = p_source_plan_id order by sort_order, id
  loop
    insert into meals (plan_id, name, time, day_of_week, notes, sort_order)
    values (v_new, v_meal.name, v_meal.time, v_meal.day_of_week, v_meal.notes, v_meal.sort_order)
    returning id into v_new_meal;

    for v_item in
      select * from meal_items where meal_id = v_meal.id order by sort_order, id
    loop
      insert into meal_items (meal_id, food_id, qty, quantity, unit, notes, sort_order, macros)
      values (v_new_meal, v_item.food_id, v_item.qty, v_item.quantity, v_item.unit, v_item.notes, v_item.sort_order, v_item.macros)
      returning id into v_new_item;

      insert into meal_substitutions (meal_item_id, alternative_food_id, alternative_label, alternative_qty, macros, note)
      select v_new_item, alternative_food_id, alternative_label, alternative_qty, macros, note
      from meal_substitutions
      where meal_item_id = v_item.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

-- ---- duplicar refeição -----------------------------------------------------
create or replace function public.duplicate_nutrition_meal(p_meal_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meal meals%rowtype;
  v_new uuid;
  v_item record;
  v_new_item uuid;
begin
  select * into v_meal from meals where id = p_meal_id;
  if not found then
    raise exception 'trackly:meal_not_found';
  end if;

  -- Abre espaço logo depois da original, DENTRO DO MESMO "dia" (day_of_week, NULL incluso —
  -- `is not distinct from` trata NULL = NULL como igual, diferente de `=`).
  update meals set sort_order = sort_order + 1
  where plan_id = v_meal.plan_id
    and day_of_week is not distinct from v_meal.day_of_week
    and sort_order > v_meal.sort_order;

  insert into meals (plan_id, name, time, day_of_week, notes, sort_order)
  values (v_meal.plan_id, left(v_meal.name || ' (cópia)', 120), v_meal.time, v_meal.day_of_week, v_meal.notes, v_meal.sort_order + 1)
  returning id into v_new;

  for v_item in
    select * from meal_items where meal_id = p_meal_id order by sort_order, id
  loop
    insert into meal_items (meal_id, food_id, qty, quantity, unit, notes, sort_order, macros)
    values (v_new, v_item.food_id, v_item.qty, v_item.quantity, v_item.unit, v_item.notes, v_item.sort_order, v_item.macros)
    returning id into v_new_item;

    insert into meal_substitutions (meal_item_id, alternative_food_id, alternative_label, alternative_qty, macros, note)
    select v_new_item, alternative_food_id, alternative_label, alternative_qty, macros, note
    from meal_substitutions
    where meal_item_id = v_item.id;
  end loop;

  return v_new;
end;
$$;

-- ---- duplicar dia -----------------------------------------------------------
-- O schema de nutrição não tem uma tabela de "dia" própria (diferente de `workout_days`) — o
-- "dia" é o valor de `meals.day_of_week` (1=segunda..7=domingo; NULL="todo dia"). Copia TODAS as
-- refeições (+ itens + substituições) do dia de origem pro dia de destino, no fim da lista do
-- destino. Devolve quantas refeições foram copiadas. `p_source_day`/`p_target_day` iguais (via
-- `is not distinct from`, NULL-safe) ou dia de origem vazio são erro — nada silencioso.
create or replace function public.duplicate_nutrition_day(
  p_plan_id uuid,
  p_source_day smallint,
  p_target_day smallint
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meal record;
  v_new_meal uuid;
  v_item record;
  v_new_item uuid;
  v_next_order integer;
  v_count integer := 0;
begin
  if not exists (select 1 from nutrition_plans where id = p_plan_id) then
    raise exception 'trackly:plan_not_found';
  end if;
  if p_source_day is not distinct from p_target_day then
    raise exception 'trackly:same_day';
  end if;
  if not exists (
    select 1 from meals where plan_id = p_plan_id and day_of_week is not distinct from p_source_day
  ) then
    raise exception 'trackly:day_empty';
  end if;

  select coalesce(max(sort_order) + 1, 0) into v_next_order
  from meals where plan_id = p_plan_id and day_of_week is not distinct from p_target_day;

  for v_meal in
    select * from meals
    where plan_id = p_plan_id and day_of_week is not distinct from p_source_day
    order by sort_order, id
  loop
    insert into meals (plan_id, name, time, day_of_week, notes, sort_order)
    values (p_plan_id, v_meal.name, v_meal.time, p_target_day, v_meal.notes, v_next_order)
    returning id into v_new_meal;
    v_next_order := v_next_order + 1;
    v_count := v_count + 1;

    for v_item in
      select * from meal_items where meal_id = v_meal.id order by sort_order, id
    loop
      insert into meal_items (meal_id, food_id, qty, quantity, unit, notes, sort_order, macros)
      values (v_new_meal, v_item.food_id, v_item.qty, v_item.quantity, v_item.unit, v_item.notes, v_item.sort_order, v_item.macros)
      returning id into v_new_item;

      insert into meal_substitutions (meal_item_id, alternative_food_id, alternative_label, alternative_qty, macros, note)
      select v_new_item, alternative_food_id, alternative_label, alternative_qty, macros, note
      from meal_substitutions
      where meal_item_id = v_item.id;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- ---- publicar ---------------------------------------------------------------
-- Devolve o id do plano publicado que foi ARQUIVADO (ou null se não havia).
create or replace function public.publish_nutrition_plan(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan nutrition_plans%rowtype;
  v_prev uuid;
begin
  select * into v_plan from nutrition_plans where id = p_plan_id for update;
  if not found then
    raise exception 'trackly:plan_not_found';
  end if;
  if v_plan.is_template then
    raise exception 'trackly:template_not_publishable';
  end if;
  if not v_plan.is_draft then
    raise exception 'trackly:already_published';
  end if;
  if not exists (
    select 1 from meal_items mi
    join meals m on m.id = mi.meal_id
    where m.plan_id = p_plan_id
  ) then
    raise exception 'trackly:plan_empty';
  end if;

  select id into v_prev from nutrition_plans
  where client_id = v_plan.client_id and not is_draft and not is_template and archived_at is null and id <> p_plan_id
  order by coalesce(published_at, updated_at) desc
  limit 1;

  update nutrition_plans set archived_at = now()
  where client_id = v_plan.client_id and not is_draft and not is_template and archived_at is null and id <> p_plan_id;

  update nutrition_plans set is_draft = false, published_at = now(), archived_at = null, updated_at = now()
  where id = p_plan_id;

  return v_prev;
end;
$$;

-- ---- reordenar --------------------------------------------------------------
-- Reordena as refeições de UM "dia" (day_of_week, NULL incluso) por vez — mesma decisão de
-- produto de `reorder_workout_exercises` (a ordem é por dia; refeição "todo dia" e refeição de
-- um dia específico não se misturam na mesma chamada, então `p_ids` precisa bater exatamente com
-- as refeições daquele dia, nem mais nem menos).
create or replace function public.reorder_nutrition_meals(p_plan_id uuid, p_day_of_week smallint, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_given integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into v_count from meals
  where plan_id = p_plan_id and day_of_week is not distinct from p_day_of_week;

  if v_count = 0 or v_count <> v_given
     or (select count(distinct i) from unnest(p_ids) i) <> v_given
     or exists (
       select 1 from unnest(p_ids) i
       where not exists (
         select 1 from meals d
         where d.id = i and d.plan_id = p_plan_id and d.day_of_week is not distinct from p_day_of_week
       )
     ) then
    raise exception 'trackly:order_mismatch';
  end if;

  update meals d set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where d.id = o.id;
end;
$$;

create or replace function public.reorder_meal_items(p_meal_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_given integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into v_count from meal_items where meal_id = p_meal_id;
  if v_count = 0 or v_count <> v_given
     or (select count(distinct i) from unnest(p_ids) i) <> v_given
     or exists (
       select 1 from unnest(p_ids) i
       where not exists (select 1 from meal_items e where e.id = i and e.meal_id = p_meal_id)
     ) then
    raise exception 'trackly:order_mismatch';
  end if;

  update meal_items e set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where e.id = o.id;
end;
$$;

-- ---- permissões -------------------------------------------------------------
revoke all on function public.duplicate_nutrition_plan(uuid, uuid, boolean, text, text) from public, anon;
revoke all on function public.duplicate_nutrition_meal(uuid) from public, anon;
revoke all on function public.duplicate_nutrition_day(uuid, smallint, smallint) from public, anon;
revoke all on function public.publish_nutrition_plan(uuid) from public, anon;
revoke all on function public.reorder_nutrition_meals(uuid, smallint, uuid[]) from public, anon;
revoke all on function public.reorder_meal_items(uuid, uuid[]) from public, anon;

grant execute on function public.duplicate_nutrition_plan(uuid, uuid, boolean, text, text) to authenticated, service_role;
grant execute on function public.duplicate_nutrition_meal(uuid) to authenticated, service_role;
grant execute on function public.duplicate_nutrition_day(uuid, smallint, smallint) to authenticated, service_role;
grant execute on function public.publish_nutrition_plan(uuid) to authenticated, service_role;
grant execute on function public.reorder_nutrition_meals(uuid, smallint, uuid[]) to authenticated, service_role;
grant execute on function public.reorder_meal_items(uuid, uuid[]) to authenticated, service_role;

commit;
