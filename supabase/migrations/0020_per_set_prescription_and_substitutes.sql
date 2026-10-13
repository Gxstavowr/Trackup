-- Trackly — 0020: prescrição POR SÉRIE e VÁRIOS substitutos por exercício do treino
--
-- APLICAR DEPOIS da 0019, pelo runner (`node scripts/migrate.mjs apply`, a partir de web/), que já
-- envolve o arquivo numa transação junto com o registro no histórico — por isso este arquivo NÃO
-- tem begin/commit próprios. ADITIVA e reexecutável (create ... if not exists, create or replace,
-- drop policy/trigger if exists, insert ... on conflict do nothing). Não apaga nem altera coluna
-- existente; a única escrita em dado existente é a CÓPIA do substituto antigo (seção 3).
--
-- POR QUE EXISTE (aprovado pelo dono)
--   1. Hoje cada exercício do dia tem UMA prescrição uniforme (sets, reps/faixa, carga, RIR,
--      descanso). O coach quer variar por série: série 1 = 12 × 20 kg, série 2 = 10 × 22 kg,
--      série 3 = 8 × 24 kg (opcionalmente RIR/descanso por série).
--   2. Hoje cada exercício tem no máximo UM substituto (`workout_exercises.substitute_exercise_id`,
--      0003). O coach quer oferecer vários, em ordem.
--
-- O QUE FAZ
--   1) `workout_exercise_sets`: overrides OPCIONAIS por série (set_number 1..50). Cada campo nulo
--      cai no valor uniforme do exercício — sem linhas, o exercício se comporta exatamente como
--      antes. Regra de resolução espelhada (e testada) em web/lib/workout-prescription.ts.
--   2) `workout_exercise_substitutes`: substitutos ordenados (sort_order), sem repetir exercício.
--      FK pra `exercises` com ON DELETE CASCADE (equivale ao ON DELETE SET NULL da coluna antiga:
--      apagar o exercício só some com a opção de substituição).
--   3) MIGRA o substituto antigo: cada `substitute_exercise_id` não nulo vira a linha sort_order 0
--      da tabela nova (só quando o exercício é da MESMA conta do plano — linha que violaria a regra
--      da 0009 fica só na coluna antiga e sai num NOTICE). A COLUNA ANTIGA FICA: o app passa a
--      mantê-la igual ao 1º substituto (função da seção 6), então leituras antigas (histórico,
--      exportação LGPD, código que ainda lê a coluna) continuam coerentes. O app lê a tabela nova e
--      só cai na coluna antiga se a tabela não tiver linha nenhuma pro exercício.
--   4) RLS espelhando `workout_exercises` (0003/0004): coach da conta = tudo (rascunho, publicado e
--      template); aluno = só SELECT do que pertence a plano PUBLICADO dele; `anon` nada (0012).
--   5) Guardas de conta (padrão 0009): o substituto precisa ser exercício da mesma conta do plano.
--   6) `set_workout_exercise_details`: grava, numa chamada atômica, as séries e os substitutos de um
--      exercício (substitui o conjunto inteiro) e sincroniza a coluna antiga.
--   7) `duplicate_workout_plan` / `duplicate_workout_day` (0007) passam a copiar as duas tabelas
--      novas — sem isso, aplicar template, salvar como template, duplicar pra outro aluno, criar
--      rascunho a partir do publicado e duplicar dia PERDERIAM os dados. Assinaturas iguais (os
--      GRANTs da 0007 continuam valendo). `publish_workout_plan` NÃO muda: publicar só vira as
--      flags do próprio plano (as linhas filhas continuam penduradas nele).
--   8) `private.client_visible_exercise_ids()` (0003) passa a incluir os substitutos novos, pra
--      a policy `exercises_client_read` deixar o aluno ler o nome/instrução deles.

-- ============================================================================
-- 1) Prescrição por série
-- ============================================================================

create table if not exists public.workout_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number integer not null check (set_number between 1 and 50),
  reps_min integer check (reps_min is null or reps_min between 0 and 1000),
  reps_max integer check (reps_max is null or reps_max between 0 and 1000),
  load numeric check (load is null or (load >= 0 and load <= 10000)),
  rir integer check (rir is null or rir between 0 and 10),
  rest_sec integer check (rest_sec is null or rest_sec between 0 and 3600),
  constraint workout_exercise_sets_reps_range_check
    check (reps_min is null or reps_max is null or reps_max >= reps_min),
  constraint workout_exercise_sets_unique_set unique (workout_exercise_id, set_number)
);

-- ============================================================================
-- 2) Substitutos ordenados
-- ============================================================================

create table if not exists public.workout_exercise_substitutes (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  constraint workout_exercise_substitutes_unique_exercise unique (workout_exercise_id, exercise_id)
);

create index if not exists workout_exercise_substitutes_parent_sort_idx
  on public.workout_exercise_substitutes(workout_exercise_id, sort_order);
create index if not exists workout_exercise_substitutes_exercise_idx
  on public.workout_exercise_substitutes(exercise_id);

-- ============================================================================
-- 3) Migra o substituto único (coluna 0003) para a tabela nova — ANTES do trigger de guarda
-- ============================================================================

insert into public.workout_exercise_substitutes (workout_exercise_id, exercise_id, sort_order)
select we.id, we.substitute_exercise_id, 0
from public.workout_exercises we
join public.workout_days wd on wd.id = we.day_id
join public.exercises e on e.id = we.substitute_exercise_id
where we.substitute_exercise_id is not null
  and we.substitute_exercise_id <> we.exercise_id
  and e.account_id = private.workout_plan_account(wd.plan_id)
on conflict (workout_exercise_id, exercise_id) do nothing;

do $$
declare
  v_skipped integer;
begin
  select count(*) into v_skipped
  from public.workout_exercises we
  where we.substitute_exercise_id is not null
    and not exists (
      select 1 from public.workout_exercise_substitutes s
      where s.workout_exercise_id = we.id and s.exercise_id = we.substitute_exercise_id
    );
  if v_skipped > 0 then
    raise notice '0020: % substituto(s) antigo(s) NAO copiado(s) (exercicio de outra conta ou igual ao prescrito) — ficam so na coluna substitute_exercise_id.', v_skipped;
  end if;
end $$;

-- ============================================================================
-- 4) RLS + permissões (espelha workout_exercises: 0003 template, 0004 coach/aluno)
-- ============================================================================

alter table public.workout_exercise_sets enable row level security;
alter table public.workout_exercise_substitutes enable row level security;

revoke all on table public.workout_exercise_sets from public, anon;
revoke all on table public.workout_exercise_substitutes from public, anon;
grant select, insert, update, delete on table public.workout_exercise_sets to authenticated;
grant select, insert, update, delete on table public.workout_exercise_substitutes to authenticated;
grant all on table public.workout_exercise_sets to service_role;
grant all on table public.workout_exercise_substitutes to service_role;

-- ---- workout_exercise_sets ----
drop policy if exists workout_exercise_sets_coach_full_access on public.workout_exercise_sets;
create policy workout_exercise_sets_coach_full_access on public.workout_exercise_sets for all to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ))
  with check (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ));

drop policy if exists workout_exercise_sets_template_by_account on public.workout_exercise_sets;
create policy workout_exercise_sets_template_by_account on public.workout_exercise_sets for all to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.is_template and wp.account_id = (select private.current_account_id())
  ))
  with check (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.is_template and wp.account_id = (select private.current_account_id())
  ));

drop policy if exists workout_exercise_sets_client_read on public.workout_exercise_sets;
create policy workout_exercise_sets_client_read on public.workout_exercise_sets for select to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.client_id = (select private.current_client_id()) and wp.is_draft = false
  ));

-- ---- workout_exercise_substitutes ----
drop policy if exists workout_exercise_substitutes_coach_full_access on public.workout_exercise_substitutes;
create policy workout_exercise_substitutes_coach_full_access on public.workout_exercise_substitutes for all to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ))
  with check (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ));

drop policy if exists workout_exercise_substitutes_template_by_account on public.workout_exercise_substitutes;
create policy workout_exercise_substitutes_template_by_account on public.workout_exercise_substitutes for all to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.is_template and wp.account_id = (select private.current_account_id())
  ))
  with check (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.is_template and wp.account_id = (select private.current_account_id())
  ));

drop policy if exists workout_exercise_substitutes_client_read on public.workout_exercise_substitutes;
create policy workout_exercise_substitutes_client_read on public.workout_exercise_substitutes for select to authenticated
  using (workout_exercise_id in (
    select we.id from public.workout_exercises we
    join public.workout_days wd on wd.id = we.day_id
    join public.workout_plans wp on wp.id = wd.plan_id
    where wp.client_id = (select private.current_client_id()) and wp.is_draft = false
  ));

-- ============================================================================
-- 5) Guarda de conta (padrão 0009): substituto = exercício da MESMA conta do plano
-- ============================================================================

create or replace function private.guard_workout_exercise_substitutes_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
begin
  select private.workout_plan_account(d.plan_id) into v_account
  from workout_exercises we
  join workout_days d on d.id = we.day_id
  where we.id = new.workout_exercise_id;

  if not exists (select 1 from exercises e where e.id = new.exercise_id and e.account_id = v_account) then
    perform private.raise_cross_account('workout_exercise_substitutes.exercise_id');
  end if;
  return new;
end;
$$;

revoke all on function private.guard_workout_exercise_substitutes_refs() from public, anon;

drop trigger if exists workout_exercise_substitutes_guard_refs on public.workout_exercise_substitutes;
create trigger workout_exercise_substitutes_guard_refs
  before insert or update of exercise_id, workout_exercise_id on public.workout_exercise_substitutes
  for each row execute function private.guard_workout_exercise_substitutes_refs();

-- ============================================================================
-- 6) Gravação atômica das séries + substitutos de um exercício (security invoker)
-- ============================================================================
-- p_sets: array jsonb de { set_number, reps_min, reps_max, load, rir, rest_sec } (campos nulos =
--         "usa o valor uniforme"; item sem nenhum valor é ignorado). '[]' ou null = sem variação.
-- p_substitute_ids: ids em ordem; repetidos e o próprio exercício prescrito são descartados.
-- Substitui o conjunto inteiro das duas tabelas e mantém workout_exercises.substitute_exercise_id
-- igual ao 1º substituto (compatibilidade). O RLS de quem chama vale: aluno esbarra e recebe erro.
create or replace function public.set_workout_exercise_details(
  p_workout_exercise_id uuid,
  p_sets jsonb,
  p_substitute_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_main uuid;
  v_first uuid;
begin
  select exercise_id into v_main from workout_exercises where id = p_workout_exercise_id;
  if v_main is null then
    raise exception 'trackly:workout_exercise_not_found';
  end if;
  if p_sets is not null and jsonb_typeof(p_sets) <> 'array' then
    raise exception 'trackly:invalid_items';
  end if;

  delete from workout_exercise_sets where workout_exercise_id = p_workout_exercise_id;
  if p_sets is not null then
    insert into workout_exercise_sets (workout_exercise_id, set_number, reps_min, reps_max, load, rir, rest_sec)
    select
      p_workout_exercise_id,
      (x ->> 'set_number')::integer,
      (x ->> 'reps_min')::integer,
      (x ->> 'reps_max')::integer,
      (x ->> 'load')::numeric,
      (x ->> 'rir')::integer,
      (x ->> 'rest_sec')::integer
    from jsonb_array_elements(p_sets) as x
    where coalesce(x ->> 'reps_min', x ->> 'reps_max', x ->> 'load', x ->> 'rir', x ->> 'rest_sec') is not null;
  end if;

  delete from workout_exercise_substitutes where workout_exercise_id = p_workout_exercise_id;
  insert into workout_exercise_substitutes (workout_exercise_id, exercise_id, sort_order)
  select p_workout_exercise_id, s.id, (row_number() over (order by s.first_pos)) - 1
  from (
    select i.id, min(i.pos) as first_pos
    from unnest(coalesce(p_substitute_ids, '{}'::uuid[])) with ordinality as i(id, pos)
    where i.id is not null and i.id <> v_main
    group by i.id
  ) s;

  select exercise_id into v_first
  from workout_exercise_substitutes
  where workout_exercise_id = p_workout_exercise_id
  order by sort_order
  limit 1;

  update workout_exercises set substitute_exercise_id = v_first
  where id = p_workout_exercise_id and substitute_exercise_id is distinct from v_first;
end;
$$;

revoke all on function public.set_workout_exercise_details(uuid, jsonb, uuid[]) from public, anon;
grant execute on function public.set_workout_exercise_details(uuid, jsonb, uuid[]) to authenticated, service_role;

-- ============================================================================
-- 7) Duplicações (0007) copiam as tabelas novas
-- ============================================================================

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
  v_ex record;
  v_new_ex uuid;
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

    for v_ex in
      select * from workout_exercises where day_id = v_day.id order by sort_order, id
    loop
      insert into workout_exercises (
        day_id, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
        reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
        substitute_exercise_id, duration_sec
      )
      values (
        v_new_day, v_ex.exercise_id, v_ex.sets, v_ex.reps, v_ex.rest_sec, v_ex.rir, v_ex.notes, v_ex.sort_order,
        v_ex.reps_min, v_ex.reps_max, v_ex.suggested_load, v_ex.tempo, v_ex.block_type, v_ex.group_kind, v_ex.group_key,
        v_ex.substitute_exercise_id, v_ex.duration_sec
      )
      returning id into v_new_ex;

      insert into workout_exercise_sets (workout_exercise_id, set_number, reps_min, reps_max, load, rir, rest_sec)
      select v_new_ex, set_number, reps_min, reps_max, load, rir, rest_sec
      from workout_exercise_sets where workout_exercise_id = v_ex.id;

      insert into workout_exercise_substitutes (workout_exercise_id, exercise_id, sort_order)
      select v_new_ex, exercise_id, sort_order
      from workout_exercise_substitutes where workout_exercise_id = v_ex.id;
    end loop;
  end loop;

  return v_new;
end;
$$;

create or replace function public.duplicate_workout_day(p_day_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day workout_days%rowtype;
  v_new uuid;
  v_ex record;
  v_new_ex uuid;
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

  for v_ex in
    select * from workout_exercises where day_id = p_day_id order by sort_order, id
  loop
    insert into workout_exercises (
      day_id, exercise_id, sets, reps, rest_sec, rir, notes, sort_order,
      reps_min, reps_max, suggested_load, tempo, block_type, group_kind, group_key,
      substitute_exercise_id, duration_sec
    )
    values (
      v_new, v_ex.exercise_id, v_ex.sets, v_ex.reps, v_ex.rest_sec, v_ex.rir, v_ex.notes, v_ex.sort_order,
      v_ex.reps_min, v_ex.reps_max, v_ex.suggested_load, v_ex.tempo, v_ex.block_type, v_ex.group_kind, v_ex.group_key,
      v_ex.substitute_exercise_id, v_ex.duration_sec
    )
    returning id into v_new_ex;

    insert into workout_exercise_sets (workout_exercise_id, set_number, reps_min, reps_max, load, rir, rest_sec)
    select v_new_ex, set_number, reps_min, reps_max, load, rir, rest_sec
    from workout_exercise_sets where workout_exercise_id = v_ex.id;

    insert into workout_exercise_substitutes (workout_exercise_id, exercise_id, sort_order)
    select v_new_ex, exercise_id, sort_order
    from workout_exercise_substitutes where workout_exercise_id = v_ex.id;
  end loop;

  return v_new;
end;
$$;

-- ============================================================================
-- 8) Aluno lê os exercícios substitutos novos (policy exercises_client_read, 0003)
-- ============================================================================

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
  union
  select s.exercise_id
  from clients c
  join workout_plans wp on wp.client_id = c.id and wp.is_draft = false
  join workout_days wd on wd.plan_id = wp.id
  join workout_exercises we on we.day_id = wd.id
  join workout_exercise_substitutes s on s.workout_exercise_id = we.id
  where c.auth_user_id = (select auth.uid())
$$;

-- ============================================================================
-- CONFERÊNCIA (só leitura, rodar à parte)
-- ============================================================================
-- Substitutos antigos x novos (deve voltar 0, salvo os do NOTICE):
-- select count(*) from workout_exercises we
--  where we.substitute_exercise_id is not null
--    and not exists (select 1 from workout_exercise_substitutes s
--                    where s.workout_exercise_id = we.id and s.exercise_id = we.substitute_exercise_id);
-- RLS ligado nas duas tabelas novas:
-- select relname, relrowsecurity from pg_class
--  where relname in ('workout_exercise_sets', 'workout_exercise_substitutes');
