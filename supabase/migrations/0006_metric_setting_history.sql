-- Trackly — 0006: histórico append-only de mudanças de meta/acompanhamento por aluno (item 30)
--
-- APLICAR DEPOIS da 0005 (0001 -> ... -> 0005 -> 0006). Migration ADITIVA, feita pra rodar de uma
-- vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou passa inteira ou
-- falha inteira. Reexecutável (idempotente): `create table/index if not exists`, `create or replace
-- function`, `drop trigger/policy if exists` só no que ESTA migration cria/recria. Não há DROP
-- TABLE/COLUMN, ALTER TYPE, UPDATE/DELETE em dados existentes. Nenhum segredo. Nenhuma linha de
-- dado é lida nem alterada. O app NÃO depende desta migration (nada em web/ lê a tabela nova ainda):
-- aplicá-la só passa a REGISTRAR o que antes era sobrescrito.
--
-- POR QUE EXISTE
--   Item 30 ("memória longitudinal real — evitar apagar/sobrescrever informação histórica
--   importante"). A auditoria do código achou UMA brecha real de sobrescrita: `setMetricGoal`
--   (web/lib/metrics-settings.ts) faz upsert por cima de `client_metric_settings`, então o
--   valor-alvo e a direção da meta de um indicador (ex.: peso alvo 78 kg -> 80 kg) são trocados
--   no lugar e o valor anterior some — não há como saber depois qual era a meta quando uma semana
--   passada foi medida. O mesmo vale pro `tracked` (parar/voltar a acompanhar). O histórico de
--   VALORES (`metrics`) já é preservado (ocultar métrica é soft, nunca DELETE); o que faltava era
--   o histórico da CONFIGURAÇÃO.
--
-- O QUE FAZ
--   A) `client_metric_setting_changes`: log append-only (uma linha por mudança de `tracked`,
--      `target_value` ou `goal_direction`, com o valor antigo e o novo, quem mudou e quando).
--   B) Trigger AFTER INSERT/UPDATE em `client_metric_settings` (função security definer no schema
--      `private`) que grava esse log sozinho — nenhum código do app precisa lembrar de chamar nada,
--      então nenhum caminho de escrita (Server Action, SQL Editor, service_role) escapa.
--      UPDATE que não muda nenhuma das três colunas (ex.: só `label`) não gera linha.
--   C) RLS: coach da conta LÊ (`private.is_coach_of_client`); NINGUÉM escreve pela API (sem policy
--      de insert/update/delete, e o privilégio de tabela também é negado ao `authenticated` — defesa
--      em profundidade, mesmo padrão de `plan_change_logs` da 0003). Só o trigger escreve. O aluno
--      não lê: é configuração interna do coach (o aluno continua lendo só a config vigente, 0005).
--
-- EFEITO COLATERAL QUE O HUMANO PRECISA SABER
--   Nenhum dado existente muda e nenhuma tela quebra. A tabela nasce vazia: o histórico começa a
--   valer da aplicação em diante (não há como reconstruir metas passadas). `client_id` é
--   `on delete cascade` como todo o resto — excluir o aluno leva o log junto (decisão deliberada de
--   exclusão de conta, não uma perda acidental).
--
-- Convenções herdadas do 0001/0003/0004/0005: snake_case; função de RLS/trigger no schema `private`
-- (security definer, set search_path = public); `(select auth.uid())` em subquery; enums como CHECK.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================================
-- A. client_metric_setting_changes (append-only)
-- ============================================================================
create table if not exists client_metric_setting_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  metric_key text not null,
  changed_at timestamptz not null default now(),
  -- auth.uid() de quem mudou; nulo quando a mudança veio do SQL Editor / service_role.
  changed_by uuid,
  -- 'insert' = primeira linha de configuração da métrica pro aluno (só `new_*` preenchidos);
  -- 'update' = mudança sobre uma linha existente (`old_*` e `new_*`).
  operation text not null check (operation in ('insert', 'update')),
  old_tracked boolean,
  new_tracked boolean,
  old_target_value numeric,
  new_target_value numeric,
  old_goal_direction text,
  new_goal_direction text
);
create index if not exists client_metric_setting_changes_client_metric_idx
  on client_metric_setting_changes(client_id, metric_key, changed_at desc);

alter table client_metric_setting_changes enable row level security;

drop policy if exists client_metric_setting_changes_coach_read on client_metric_setting_changes;
create policy client_metric_setting_changes_coach_read on client_metric_setting_changes for select to authenticated
  using (private.is_coach_of_client(client_id));

-- Sem policy de insert/update/delete de propósito: só o trigger (B) escreve. Privilégios de tabela
-- alinhados: `anon` nada; `authenticated` só SELECT; `service_role` só SELECT/INSERT (append-only).
revoke all on client_metric_setting_changes from anon;
revoke all on client_metric_setting_changes from authenticated;
grant select on client_metric_setting_changes to authenticated;
revoke all on client_metric_setting_changes from service_role;
grant select, insert on client_metric_setting_changes to service_role;

-- ============================================================================
-- B. Trigger em client_metric_settings
-- ============================================================================
create or replace function private.log_client_metric_setting_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into client_metric_setting_changes (
      client_id, metric_key, changed_by, operation,
      new_tracked, new_target_value, new_goal_direction
    ) values (
      new.client_id, new.metric_key, (select auth.uid()), 'insert',
      new.tracked, new.target_value, new.goal_direction
    );
  elsif row(new.tracked, new.target_value, new.goal_direction)
        is distinct from row(old.tracked, old.target_value, old.goal_direction) then
    insert into client_metric_setting_changes (
      client_id, metric_key, changed_by, operation,
      old_tracked, new_tracked,
      old_target_value, new_target_value,
      old_goal_direction, new_goal_direction
    ) values (
      new.client_id, new.metric_key, (select auth.uid()), 'update',
      old.tracked, new.tracked,
      old.target_value, new.target_value,
      old.goal_direction, new.goal_direction
    );
  end if;
  return null; -- AFTER trigger: o valor de retorno é ignorado
end;
$$;

drop trigger if exists client_metric_settings_log_change on client_metric_settings;
create trigger client_metric_settings_log_change
  after insert or update on client_metric_settings
  for each row execute function private.log_client_metric_setting_change();

commit;

-- ============================================================================
-- CONFERÊNCIA PÓS-MIGRATION (rodar à parte, só leitura)
-- ============================================================================
--   -- 1) tabela nova com RLS ligado (esperado: relrowsecurity = true)
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relname = 'client_metric_setting_changes';
--   -- 2) só a policy de leitura do coach (esperado: 1 linha, cmd = SELECT)
--   select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'client_metric_setting_changes';
--   -- 3) privilégios (esperado: authenticated = SELECT; service_role = INSERT, SELECT; anon = nenhum)
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'client_metric_setting_changes' order by 1, 2;
--   -- 4) trigger presente em client_metric_settings
--   select tgname from pg_trigger
--   where tgrelid = 'public.client_metric_settings'::regclass and not tgisinternal;
--   -- 5) teste funcional (num aluno de teste, dentro de begin; ... rollback;): mudar a meta e conferir o log
--   --   begin;
--   --   update client_metric_settings set target_value = 79 where client_id = '<aluno>' and metric_key = 'weight_kg';
--   --   select * from client_metric_setting_changes where client_id = '<aluno>' order by changed_at desc limit 1;
--   --   rollback;
