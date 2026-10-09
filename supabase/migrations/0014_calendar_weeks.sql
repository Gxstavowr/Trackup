-- Trackly — 0014: semana do check-in alinhada ao calendário (segunda a domingo, horário de SP)
--
-- APLICAR DEPOIS da 0013 e JUNTO com a versão do app que traz `web/lib/checkin-week.ts`.
-- Reexecutável (create or replace). Não altera nem apaga nenhuma linha.
--
-- DECISÃO DE PRODUTO (2026-10-09)
--   Antes: cada aluno contava a semana a partir do próprio `start_date` (ex.: quarta a terça),
--   mas a janela do check-in (sexta a domingo) segue o calendário — uma janela podia cruzar duas
--   semanas. Agora toda semana vai de SEGUNDA a DOMINGO, igual para todos; semana 1 = a semana de
--   calendário em que cai o `start_date`.
--
-- TAMBÉM CORRIGE O FUSO
--   Antes "hoje" era o dia em UTC: domingo depois das 21h em São Paulo (já segunda em UTC) o
--   check-in ainda estava aberto, mas a semana já tinha virado. Agora é o dia em America/Sao_Paulo,
--   o mesmo de `checkinWindow`/`todayDateSP` (web/lib/portal-today.ts).
--
-- Esta função é a trava do banco para o aluno criar a instância do check-in: precisa bater 1:1
-- com `computeWeekInfo` (web/lib/checkin-week.ts). `date_trunc('week', ...)` = segunda-feira.
--
-- Instâncias antigas mantêm o período com que foram criadas (só há dados de teste hoje).

create or replace function private.client_can_open_checkin(
  p_client uuid,
  p_week integer,
  p_period_start date,
  p_period_end date,
  p_template uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from clients c
    cross join lateral (
      select date_trunc('week', c.start_date)::date as first_monday,
             date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date as this_monday
    ) w
    where c.id = p_client
      and c.auth_user_id = (select auth.uid())
      and c.start_date is not null
      and p_week = greatest(1, (w.this_monday - w.first_monday) / 7 + 1)
      and p_period_start = w.first_monday + (p_week - 1) * 7
      and p_period_end = w.first_monday + (p_week - 1) * 7 + 6
      and (
        p_template is null
        or exists (
          select 1 from checkin_templates t
          where t.id = p_template and t.account_id = c.account_id
        )
      )
  )
$$;

-- CONFERÊNCIA (só leitura) — semana atual de cada aluno ativo pela regra nova:
-- select c.name, c.start_date,
--        greatest(1, (date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date
--                     - date_trunc('week', c.start_date)::date) / 7 + 1) as semana_atual
--   from clients c where c.start_date is not null order by c.name;
