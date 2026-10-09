-- Trackly — 0007: construtor de treino do coach (item 18 do master TODO)
--
-- APLICAR DEPOIS da 0006 (0001 -> ... -> 0006 -> 0007). Migration ADITIVA, feita pra rodar de uma
-- vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou passa inteira ou
-- falha inteira. Reexecutável (idempotente): `add column if not exists`, `create index if not
-- exists`, `create or replace function`, constraints atrás de guarda em `pg_constraint`, índices
-- únicos só criados se os dados existentes permitirem (senão NOTICE). Não há DROP TABLE/COLUMN,
-- ALTER TYPE, nem UPDATE/DELETE em dados existentes. Nenhum segredo. NÃO cria nem altera nenhuma
-- policy de RLS (ver "RLS" abaixo).
--
-- POR QUE EXISTE
--   A 0003 já trouxe quase tudo que o construtor precisa (grupo muscular/equipamento, faixa de reps,
--   carga sugerida, cadência, bloco warmup/normal/cardio, superset/circuito, substituto, templates,
--   plan_change_logs). Faltava o CICLO DE VIDA do plano e a atomicidade das operações compostas:
--   * rascunho x publicado x versão anterior: hoje `is_draft` é o único estado, então não existe
--     "editar sem o aluno ver" (o coach editaria o publicado ao vivo) nem "versão anterior";
--   * duplicar plano/dia, publicar (arquivar o anterior) e reordenar são VÁRIOS statements — sem
--     transação no supabase-js, uma falha no meio deixaria plano pela metade.
--
-- O QUE FAZ
--   A) workout_plans: `published_at`, `archived_at` (+ CHECK: arquivado ⇒ publicado, não-template) e
--      índices únicos parciais: no máximo 1 plano PUBLICADO ATIVO e no máximo 1 RASCUNHO por aluno.
--      Estados: template (`is_template`) | rascunho (`is_draft`) | publicado ativo (`not is_draft and
--      archived_at is null`) | versão anterior (`archived_at` preenchido). Linhas existentes seguem
--      válidas: as publicadas ficam "ativas", `published_at` nulo (o app usa created_at de fallback).
--   B) workout_days.notes (observações do dia).
--   C) exercises: URL de vídeo só http(s) (CHECK NOT VALID — vale pra escritas novas, não varre a
--      tabela) e nome único por conta entre os não arquivados (índice único, só se não houver duplicata).
--   D) Funções `security INVOKER` (o RLS do chamador continua valendo — nada de service role):
--        duplicate_workout_plan   copia plano+dias+exercícios (aluno->aluno, template->aluno, aluno->template)
--        duplicate_workout_day    copia um dia com os exercícios, logo depois do original
--        publish_workout_plan     rascunho -> publicado, arquivando o publicado anterior (atômico)
--        reorder_workout_days / reorder_workout_exercises   aplica uma ordem completa de uma vez
--        import_exercise_catalog  semeia a biblioteca base da conta (is_custom = false), sem duplicar nome
--      Erros de negócio saem como `raise exception 'trackly:<codigo>'`; o app traduz o código.
--
-- RLS (nada novo, de propósito)
--   Coach da conta: as policies da 0003 (templates) e da 0004 (`*_coach_full_access`) já cobrem as
--   colunas/linhas novas. Aluno: só LÊ plano `is_draft = false` do próprio client_id (0004) — versões
--   arquivadas continuam legíveis por ele (já foram publicadas pra ele; o app filtra o ativo) e o
--   aluno NUNCA escreve plano. As funções abaixo são `security invoker`: um aluno que as chamasse
--   esbarra no RLS (não vê o rascunho, não insere plano) e recebe erro. `anon` não tem EXECUTE.
--
-- EFEITOS COLATERAIS QUE O HUMANO PRECISA SABER
--   1. Os dois índices únicos de (A) só são criados se não houver, hoje, aluno com 2+ publicados
--      ativos ou 2+ rascunhos; se houver, a migration emite NOTICE e segue (o app continua
--      funcionando, mas sem a trava no banco). Limpe as duplicatas e rode de novo.
--   2. O índice único de nome de exercício (C) idem: NOTICE se já houver nomes repetidos na conta.
--   3. `duplicate_workout_*` copiam colunas por lista explícita: coluna nova de treino no futuro
--      precisa ser adicionada nessas funções (create or replace).

begin;

-- ============================================================================
-- A. workout_plans — ciclo de vida (rascunho / publicado / versão anterior)
-- ============================================================================

alter table workout_plans
  add column if not exists published_at timestamptz,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workout_plans_archived_check'
      and conrelid = 'workout_plans'::regclass
  ) then
    alter table workout_plans add constraint workout_plans_archived_check
      check (archived_at is null or (not is_draft and not is_template));
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from workout_plans
    where client_id is not null and not is_draft and not is_template and archived_at is null
    group by client_id having count(*) > 1
  ) then
    raise notice '0007: ha aluno com 2+ planos de treino publicados ativos — indice unico de publicado NAO criado. Arquive/apague os extras e rode este bloco de novo.';
  else
    create unique index if not exists workout_plans_one_published_per_client_uidx
      on workout_plans(client_id) where client_id is not null and not is_draft and not is_template and archived_at is null;
  end if;

  if exists (
    select 1 from workout_plans
    where client_id is not null and is_draft and not is_template
    group by client_id having count(*) > 1
  ) then
    raise notice '0007: ha aluno com 2+ rascunhos de treino — indice unico de rascunho NAO criado. Apague os extras e rode este bloco de novo.';
  else
    create unique index if not exists workout_plans_one_draft_per_client_uidx
      on workout_plans(client_id) where client_id is not null and is_draft and not is_template;
  end if;
end $$;

create index if not exists workout_plans_client_state_idx on workout_plans(client_id, created_at desc) where client_id is not null;

-- ============================================================================
-- B. workout_days — observações do dia
-- ============================================================================

alter table workout_days
  add column if not exists notes text check (notes is null or char_length(notes) <= 1000);

create index if not exists workout_days_plan_sort_idx on workout_days(plan_id, sort_order);
create index if not exists workout_exercises_day_sort_idx on workout_exercises(day_id, sort_order);

-- ============================================================================
-- C. exercises — vídeo só http(s) e nome único por conta
-- ============================================================================
-- NOT VALID: a checagem vale pra INSERT/UPDATE novos sem varrer (nem rejeitar) linhas antigas.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exercises_video_url_check'
      and conrelid = 'exercises'::regclass
  ) then
    alter table exercises add constraint exercises_video_url_check
      check (video_url is null or video_url ~* '^https?://') not valid;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from exercises where not is_archived
    group by account_id, lower(name) having count(*) > 1
  ) then
    raise notice '0007: ha exercicios com o mesmo nome na mesma conta — indice unico de nome NAO criado. Renomeie/arquive os repetidos e rode este bloco de novo.';
  else
    create unique index if not exists exercises_account_name_active_uidx
      on exercises(account_id, lower(name)) where not is_archived;
  end if;
end $$;

-- ============================================================================
-- D. Funções (security invoker — o RLS do chamador vale)
-- ============================================================================

-- ---- duplicar plano -------------------------------------------------------
-- p_as_template = true  : cria um TEMPLATE da conta (client_id nulo) a partir de qualquer plano
--                         (de aluno ou outro template). p_target_client_id é ignorado.
-- p_as_template = false : cria um RASCUNHO pro aluno p_target_client_id (da mesma conta da origem);
--                         se a origem é template, grava source_template_id. Falha se o aluno já tem
--                         rascunho (o app oferece "descartar o rascunho" antes).
create or replace function public.duplicate_workout_plan(
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
  v_src workout_plans%rowtype;
  v_account uuid;
  v_target_account uuid;
  v_new uuid;
  v_day record;
  v_new_day uuid;
  v_name text;
begin
  select * into v_src from workout_plans where id = p_source_plan_id;
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
    insert into workout_plans (client_id, account_id, name, description, is_draft, is_template, source_template_id)
    values (null, v_account, v_name, coalesce(p_description, v_src.description), false, true, null)
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
      select 1 from workout_plans
      where client_id = p_target_client_id and is_draft and not is_template
    ) then
      raise exception 'trackly:draft_exists';
    end if;

    insert into workout_plans (client_id, account_id, name, description, is_draft, is_template, source_template_id)
    values (
      p_target_client_id, v_account, v_name, coalesce(p_description, v_src.description), true, false,
      case when v_src.is_template then v_src.id else null end
    )
    returning id into v_new;
  end if;

  for v_day in
    select * from workout_days where plan_id = p_source_plan_id order by sort_order, id
  loop
    insert into workout_days (plan_id, name, duration_min, sort_order, notes)
    values (v_new, v_day.name, v_day.duration_min, v_day.sort_order, v_day.notes)
    returning id into v_new_day;

    insert into workout_exercises (
      day_id, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
      reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
      substitute_exercise_id, duration_sec
    )
    select
      v_new_day, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
      reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
      substitute_exercise_id, duration_sec
    from workout_exercises
    where day_id = v_day.id
    order by sort_order, id;
  end loop;

  return v_new;
end;
$$;

-- ---- duplicar dia ---------------------------------------------------------
create or replace function public.duplicate_workout_day(p_day_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day workout_days%rowtype;
  v_new uuid;
begin
  select * into v_day from workout_days where id = p_day_id;
  if not found then
    raise exception 'trackly:day_not_found';
  end if;

  -- Abre espaço logo depois do original.
  update workout_days set sort_order = sort_order + 1
  where plan_id = v_day.plan_id and sort_order > v_day.sort_order;

  insert into workout_days (plan_id, name, duration_min, sort_order, notes)
  values (v_day.plan_id, left(v_day.name || ' (cópia)', 120), v_day.duration_min, v_day.sort_order + 1, v_day.notes)
  returning id into v_new;

  insert into workout_exercises (
    day_id, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
    reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
    substitute_exercise_id, duration_sec
  )
  select
    v_new, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
    reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
    substitute_exercise_id, duration_sec
  from workout_exercises
  where day_id = p_day_id
  order by sort_order, id;

  return v_new;
end;
$$;

-- ---- publicar -------------------------------------------------------------
-- Devolve o id do plano publicado que foi ARQUIVADO (ou null se não havia).
create or replace function public.publish_workout_plan(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan workout_plans%rowtype;
  v_prev uuid;
begin
  select * into v_plan from workout_plans where id = p_plan_id for update;
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
    select 1 from workout_exercises we
    join workout_days wd on wd.id = we.day_id
    where wd.plan_id = p_plan_id
  ) then
    raise exception 'trackly:plan_empty';
  end if;

  select id into v_prev from workout_plans
  where client_id = v_plan.client_id and not is_draft and not is_template and archived_at is null and id <> p_plan_id
  order by coalesce(published_at, created_at) desc
  limit 1;

  update workout_plans set archived_at = now()
  where client_id = v_plan.client_id and not is_draft and not is_template and archived_at is null and id <> p_plan_id;

  update workout_plans set is_draft = false, published_at = now(), archived_at = null
  where id = p_plan_id;

  return v_prev;
end;
$$;

-- ---- reordenar ------------------------------------------------------------
create or replace function public.reorder_workout_days(p_plan_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_given integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into v_count from workout_days where plan_id = p_plan_id;
  if v_count = 0 or v_count <> v_given
     or (select count(distinct i) from unnest(p_ids) i) <> v_given
     or exists (
       select 1 from unnest(p_ids) i
       where not exists (select 1 from workout_days d where d.id = i and d.plan_id = p_plan_id)
     ) then
    raise exception 'trackly:order_mismatch';
  end if;

  update workout_days d set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where d.id = o.id;
end;
$$;

create or replace function public.reorder_workout_exercises(p_day_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_given integer := coalesce(array_length(p_ids, 1), 0);
begin
  select count(*) into v_count from workout_exercises where day_id = p_day_id;
  if v_count = 0 or v_count <> v_given
     or (select count(distinct i) from unnest(p_ids) i) <> v_given
     or exists (
       select 1 from unnest(p_ids) i
       where not exists (select 1 from workout_exercises e where e.id = i and e.day_id = p_day_id)
     ) then
    raise exception 'trackly:order_mismatch';
  end if;

  update workout_exercises e set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where e.id = o.id;
end;
$$;

-- ---- semear a biblioteca base ---------------------------------------------
-- p_items: array jsonb de { name, category, muscle_group, equipment, instruction }. Insere só o que
-- ainda não existe (nome, sem diferenciar maiúsculas) na conta do coach autenticado; devolve quantos.
create or replace function public.import_exercise_catalog(p_items jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_account uuid;
  v_n integer;
begin
  select account_id into v_account from coach_users where id = (select auth.uid());
  if v_account is null then
    raise exception 'trackly:not_coach';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'trackly:invalid_items';
  end if;

  with ins as (
    insert into exercises (account_id, name, category, instruction, muscle_group, equipment, is_custom)
    select
      v_account,
      left(btrim(x ->> 'name'), 120),
      left(btrim(x ->> 'category'), 40),
      left(nullif(btrim(x ->> 'instruction'), ''), 1000),
      left(nullif(btrim(x ->> 'muscle_group'), ''), 40),
      left(nullif(btrim(x ->> 'equipment'), ''), 40),
      false
    from jsonb_array_elements(p_items) as x
    where nullif(btrim(x ->> 'name'), '') is not null
      and nullif(btrim(x ->> 'category'), '') is not null
      and not exists (
        select 1 from exercises e
        where e.account_id = v_account and lower(e.name) = lower(btrim(x ->> 'name'))
      )
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from ins;

  return v_n;
end;
$$;

-- ---- permissões -----------------------------------------------------------
revoke all on function public.duplicate_workout_plan(uuid, uuid, boolean, text, text) from public, anon;
revoke all on function public.duplicate_workout_day(uuid) from public, anon;
revoke all on function public.publish_workout_plan(uuid) from public, anon;
revoke all on function public.reorder_workout_days(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_workout_exercises(uuid, uuid[]) from public, anon;
revoke all on function public.import_exercise_catalog(jsonb) from public, anon;

grant execute on function public.duplicate_workout_plan(uuid, uuid, boolean, text, text) to authenticated, service_role;
grant execute on function public.duplicate_workout_day(uuid) to authenticated, service_role;
grant execute on function public.publish_workout_plan(uuid) to authenticated, service_role;
grant execute on function public.reorder_workout_days(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.reorder_workout_exercises(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.import_exercise_catalog(jsonb) to authenticated, service_role;

commit;
