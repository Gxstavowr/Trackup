-- Trackly — 0015: aluno não reescreve as próprias métricas depois de enviar o check-in
--
-- APLICAR DEPOIS da 0014 e SÓ COM o app que grava as métricas ANTES de marcar o check-in como
-- enviado (`submitCheckin` em web/lib/repository.ts, 09/10/2026). Com o app antigo (métricas
-- gravadas depois do `submitted`), o envio continuaria funcionando mas as métricas da semana
-- deixariam de ser gravadas. Reexecutável (create or replace). Não altera nem apaga nenhuma linha.
--
-- POR QUE EXISTE (correção aprovada em 09/10)
--   A 0005 deixava o aluno gravar `metrics` com o check-in `pending`, `late` OU `submitted` — o
--   `submitted` só existia porque o app gravava as métricas logo depois de virar o status. Na
--   prática o aluno podia, pela API, trocar o próprio peso/medidas enquanto o coach avaliava.
--   Agora só com o check-in ainda aberto (pending/late), igual a `checkin_answers`.
--
-- Idêntica à 0005 (seção C), menos o 'submitted'.

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
        and ci.status in ('pending', 'late')
        and c.auth_user_id = (select auth.uid())
    )
$$;
