-- Trackly — 0005: métricas individuais por aluno (item 17 do master TODO)
--
-- APLICAR DEPOIS da 0004 (0001 -> 0002 -> 0003 -> 0004 -> 0005). Migration ADITIVA, feita pra
-- rodar de uma vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou
-- passa inteira ou falha inteira. Reexecutável (idempotente): `create table/index if not exists`,
-- `create or replace function`, `drop policy if exists` só nas policies que ESTA migration
-- cria/recria, e a troca do CHECK de `metrics.key` (bloco B) é guardada em `pg_constraint`. Não há
-- DROP TABLE/COLUMN, ALTER TYPE, UPDATE/DELETE em dados existentes. Nenhum segredo.
--
-- POR QUE EXISTE
--   Até aqui as perguntas de check-in (`checkin_questions`) e a lista fixa de chaves de `metrics`
--   (CHECK da 0001) são as MESMAS pra todos os alunos de uma conta — não existe "o coach escolhe
--   quais métricas acompanhar PARA ESTE aluno". Esta migration cria essa camada sem tocar no
--   template de check-in (que continua por conta, item já implementado): uma tabela nova,
--   `client_metric_settings`, por ALUNO, que decide (a) se cada métrica do catálogo padrão (peso,
--   cintura, quadril, energia) está sendo acompanhada por ESTE aluno, (b) métricas CUSTOM que só
--   este aluno tem, e (c) a meta (valor-alvo + direção) desse aluno pra cada métrica. Remover uma
--   métrica é sempre "parar de coletar" (`tracked = false`) — NUNCA um DELETE —, então o histórico
--   já gravado em `metrics` nunca é apagado por essa tela.
--
-- O QUE FAZ
--   A) `client_metric_settings`: tabela nova (catálogo padrão documentado em
--      web/lib/metrics-catalog.ts — a fonte da verdade do label/unidade do catálogo vive no código,
--      não no banco; esta tabela só guarda o override por aluno: acompanha/não acompanha, meta,
--      e as métricas CUSTOM completas, que não existem em nenhum catálogo de código).
--   B) `metrics.key`: o CHECK antigo (`key in ('weight_kg', ...)`, 15 chaves fixas) é trocado por
--      um CHECK de FORMATO (`snake_case`, 1–50 chars) — sem isso o histórico de uma métrica custom
--      não teria como ser gravado em `metrics` (mesma tabela usada por peso/cintura/etc. hoje).
--      Nenhuma linha existente muda: todas as chaves atuais já batem com o novo formato.
--   C) `private.client_can_write_metric`: passa a aceitar, além das 10 chaves fixas de sempre, uma
--      chave CUSTOM do próprio aluno (`client_metric_settings.source = 'custom' and tracked = true`)
--      — mesma condição de janela (semana com check-in pending/late/submitted) de antes.
--   D) RLS: coach da conta tem acesso total (`private.is_coach_of_client`); o aluno só LÊ a própria
--      configuração — nunca escreve (a escolha de métricas/metas é sempre do coach), mesmo padrão
--      de `goals`/`history_events` (0003).
--
-- EFEITO COLATERAL QUE O HUMANO PRECISA SABER
--   Nenhum aluno existente tem linha em `client_metric_settings` hoje (tabela nova, vazia). Sem
--   linha nenhuma pra um `client_id`, o app trata TODO o catálogo padrão como acompanhado (mesmo
--   comportamento de hoje) — só alunos em que o coach mexer na tela nova passam a ter métricas
--   ocultas/custom. Ver web/lib/metrics-settings.ts (`resolveClientMetrics`) pra essa regra.
--
-- Convenções herdadas do 0001/0003/0004: snake_case; funções de RLS no schema `private` (security
-- definer, stable, set search_path = public); `(select auth.uid())`/`(select private.fn())` em
-- subquery pra o Postgres avaliar uma vez por statement; enums como CHECK (nunca tipo ENUM).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================================
-- A. client_metric_settings
-- ============================================================================
-- `metric_key`: mesmo formato de `metrics.key` (bloco B) — snake_case, 1–50 chars. `source`
-- distingue o catálogo padrão (label/unidade vêm do código, `web/lib/metrics-catalog.ts`) de uma
-- métrica CUSTOM (label/unidade só existem aqui — por isso o CHECK exige as duas pra `custom`).
-- `goal_direction`: mesma ideia de `Trackly.isGoodWeightDelta` do protótipo (item 22) generalizada
-- pra qualquer métrica — "aumentar"/"diminuir"/"manter" — em vez de assumir peso.
create table if not exists client_metric_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{0,49}$'),
  source text not null default 'catalog' check (source in ('catalog', 'custom')),
  label text,
  unit text,
  tracked boolean not null default true,
  target_value numeric,
  goal_direction text check (goal_direction is null or goal_direction in ('increase', 'decrease', 'maintain')),
  created_at timestamptz not null default now(),
  unique (client_id, metric_key),
  check (source <> 'custom' or (label is not null and length(trim(label)) > 0))
);
create index if not exists client_metric_settings_client_id_idx on client_metric_settings(client_id);

alter table client_metric_settings enable row level security;

drop policy if exists client_metric_settings_coach_full_access on client_metric_settings;
create policy client_metric_settings_coach_full_access on client_metric_settings for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

drop policy if exists client_metric_settings_client_read on client_metric_settings;
create policy client_metric_settings_client_read on client_metric_settings for select to authenticated
  using (client_id = (select private.current_client_id()));

revoke all on client_metric_settings from anon;
grant select, insert, update, delete on client_metric_settings to authenticated;
grant select, insert, update, delete on client_metric_settings to service_role;

-- ============================================================================
-- B. metrics.key — de lista fixa pra CHECK de formato
-- ============================================================================
-- O nome padrão que o Postgres dá a um CHECK inline de coluna é `<tabela>_<coluna>_check`
-- (`metrics_key_check`, criado assim pela 0001). Confirma pelo `pg_constraint` antes de trocar —
-- se por algum motivo o nome real for outro, o bloco below acha e derruba pelo texto da definição
-- em vez de silenciosamente deixar as duas regras coexistirem (o que travaria toda chave custom).
do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.metrics'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%key%weight_kg%'
  loop
    execute format('alter table metrics drop constraint %I', con.conname);
  end loop;
end $$;

alter table metrics add constraint metrics_key_check check (key ~ '^[a-z][a-z0-9_]{0,49}$');

-- ============================================================================
-- C. private.client_can_write_metric — aceita chave CUSTOM acompanhada do próprio aluno
-- ============================================================================
create or replace function private.client_can_write_metric(client_row_id uuid, p_week integer, p_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
      p_key in (
        'weight_kg', 'waist_cm', 'hip_cm', 'body_fat_pct', 'workouts_count',
        'cardio_count', 'water_l', 'sleep_h', 'energy', 'hunger'
      )
      or exists (
        select 1 from client_metric_settings cms
        where cms.client_id = client_row_id
          and cms.metric_key = p_key
          and cms.source = 'custom'
          and cms.tracked = true
      )
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

commit;

-- ============================================================================
-- CONFERÊNCIA PÓS-MIGRATION (rodar à parte, só leitura)
-- ============================================================================
--   -- 1) tabela nova com RLS ligado
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relname = 'client_metric_settings';
--   -- 2) policies da tabela nova
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'client_metric_settings' order by policyname;
--   -- 3) o CHECK novo de metrics.key existe e o antigo sumiu
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.metrics'::regclass and contype = 'c';
