-- Trackly — 0004: fecha as brechas de escrita/leitura do ALUNO que sobraram depois da 0003
--
-- APLICAR DEPOIS da 0003 (0001 -> 0002 -> 0003 -> 0004). Migration ADITIVA, feita pra rodar de uma
-- vez num SQL Editor de produção, numa única transação (`begin; ... commit;`): ou passa inteira ou
-- falha inteira. Reexecutável (idempotente): `create or replace function`, `drop policy if exists`
-- só nas policies que ESTA migration cria/recria (e nas policies `for all` antigas que ela substitui,
-- exatamente como a 0002 fez em notifications e a 0003 em orientations/goals/...). Não há DROP
-- TABLE/COLUMN, ALTER TYPE, UPDATE/DELETE em dados, GRANT/REVOKE em tabela existente. Nenhum segredo.
-- Nenhuma linha de dado é lida nem alterada.
--
-- POR QUE EXISTE
--   Um teste de RLS com o token do próprio aluno (revisão independente da 0003) confirmou que o aluno
--   ainda conseguia, via REST, com a policy `for all` do 0001 (`private.can_access_client` libera
--   coach E aluno): marcar a própria cobrança como paga e mudar valores; reescrever o próprio plano
--   de treino e criar plano de nutrição; ler planos em RASCUNHO; gravar `photos.storage_path`
--   arbitrário; apagar os próprios `workout_logs`; criar check-in `pending` de qualquer semana (e
--   com isso ganhar permissão de gravar métricas nela); e ler `coach_note` de orientação enviada.
--
-- O QUE FAZ (blocos)
--   A) orientations: remove a policy de leitura do aluno (`orientations_client_read_sent`). O aluno
--      passa a NÃO ler mais nada de `orientations` pela API com o token dele — nem `coach_note`, nem
--      `author_id`. O app lê a orientação pelo client admin (evaluations.ts:831).
--   B) checkin_instances: o INSERT do aluno só vale pra SEMANA CORRENTE dele (mesma conta do app,
--      `computeWeekInfo`, UTC), com o período dessa semana e template da conta dele. Nada de criar
--      check-in de semana futura/passada/forjada. Função nova: private.client_can_open_checkin().
--   C) history_events: policy estreita e TEMPORÁRIA pra o `markMealRealized` do app continuar
--      funcionando (evento type='note' com marcador MEAL_REALIZED). Ver "PONTE TEMPORÁRIA" abaixo.
--   D) payments / subscriptions / payment_events: aluno NUNCA escreve. Coach da conta = acesso total.
--      Aluno só LÊ a própria assinatura e as próprias cobranças (decisão abaixo); payment_events
--      (trilha de auditoria interna) fica só do coach.
--   E) workout_plans / workout_days / workout_exercises / nutrition_plans / meals / meal_items /
--      meal_substitutions: aluno NUNCA escreve e só LÊ planos PUBLICADOS (`is_draft = false`) dele
--      (filhos via plano publicado). Rascunho fica invisível pro aluno. Coach = acesso total.
--   F) photos: coach = acesso total; aluno lê as próprias e só ESCREVE (insert/update/delete) com o
--      caminho canônico `{account_id}/{client_id}/week-{n}/{front|back|side}.jpg` da PRÓPRIA semana
--      e enquanto o check-in dessa semana está `pending`/`late`. Funções novas:
--      private.client_can_write_photo(), private.client_photo_checkin_open().
--   G) workout_logs: aluno lê, INSERE e ATUALIZA os próprios logs; NÃO apaga mais. Coach = total.
--
-- EFEITOS COLATERAIS QUE O HUMANO PRECISA SABER
--   1. O aluno deixa de ler `orientations` pela API. Se algum dia uma tela nova do portal ler
--      orientação com a SESSÃO do aluno (e não com o admin), vai receber 0 linhas — usar o admin
--      selecionando só colunas seguras (como getMyLatestSentOrientation) ou criar uma view.
--   2. O aluno passa a ver só planos de treino/nutrição PUBLICADOS. Um plano em rascunho some da
--      visão dele (é o que o app já assume: getActiveWorkoutForClient/getActiveNutritionPlanForClient
--      filtram is_draft=false).
--   3. Enquanto o app usar `history_events` pra marcar refeição, a policy C fica. QUANDO O APP
--      MIGRAR `markMealRealized` PARA `meal_logs` (tabela da 0003), REMOVER a policy
--      `history_events_client_meal_marker` (`drop policy history_events_client_meal_marker on
--      history_events;`) numa 0005.
--   4. Locks: `drop policy`/`create policy` tomam ACCESS EXCLUSIVE em cada tabela mexida (15, em
--      sequência) e o lock SÓ É SOLTO NO COMMIT (não ao fim de cada statement). O trabalho em si é
--      instantâneo (só metadados, nenhuma linha é lida), mas uma query longa em QUALQUER uma dessas
--      tabelas faz o DDL esperar e, enquanto espera, enfileira as demais requisições daquela tabela.
--      Por isso a migration começa com `lock_timeout = '5s'` e `statement_timeout = '60s'`: se
--      estourar, a transação INTEIRA é revertida (nada muda) e basta rodar de novo. Rodar fora do
--      horário de uso.
--   5. `photos.storage_path` legado que não siga o formato canônico continua lido pelo aluno, mas
--      não pode mais ser reescrito por ele com outro caminho (o app sempre regrava o caminho
--      canônico ao trocar a foto — checkin-photos.ts:253-257).
--
-- PROVA DE COMPATIBILIDADE COM O APP (o que o aluno faz com a SESSÃO DELE = client server com
-- cookies, e o que usa o client admin). Arquivos em web/, linhas na versão do repositório quando a
-- migration foi escrita:
--   orientations      aluno lê só com ADMIN: lib/evaluations.ts:831 (getMyLatestSentOrientation,
--                     colunas seguras). Todas as outras leituras/escritas de orientations
--                     (evaluations.ts:166,427,535,625-667) e app/coach/alunos/[id]/page.tsx:74 são
--                     do COACH. Nenhuma página de app/portal/** lê orientations com a sessão.
--   checkin_instances aluno cria só a semana atual: repository.ts:404-428 (getCurrentCheckin ->
--                     computeWeekInfo:264-280, semana = max(1, floor(dias/7)+1) em UTC, período =
--                     start_date + (semana-1)*7 até +6) e :342-393 (insert status='pending',
--                     template_id da conta, sem outros campos). É a ÚNICA criação pelo aluno.
--   history_events    aluno só INSERE em markMealRealized: repository.ts:1710-1715 (type='note',
--                     title `Refeição realizada: <nome>`, description `MEAL_REALIZED:<uuid>:<semana>
--                     ...`) e LÊ em :1696-1703 e :1735-1740. Ação: app/portal/nutricao/actions.ts:32.
--                     Demais inserts (evaluations.ts:747) são do coach.
--   payments/subscriptions/payment_events
--                     nenhuma página de app/portal/** e nenhuma função chamada por ela toca nessas
--                     tabelas. Todo uso é do coach: repository.ts:1837-1960 (getSubscription,
--                     createSubscription), :2014-2100 (createNextPayment, markPaymentAsPaid),
--                     :2124-2170; app/coach/financeiro/actions.ts:66,87,98; lib/finance/queries.ts:
--                     146-221; app/coach/alunos/[id]/pagamento/actions.ts.
--   workout_*/nutrition_plans/meals/meal_items/meal_substitutions
--                     aluno só LÊ, sempre com filtro is_draft=false: repository.ts:895-935 (plano,
--                     dias, exercícios), :1430-1466 (plano, refeições, itens), :968 e :1500
--                     (getActive*ForClient); exercises/foods do aluno vêm do ADMIN (:863, :1403) e
--                     `meals` é lida em markMealRealized (:1681). Toda ESCRITA nessas tabelas é do
--                     coach: :982-1118 (createWorkoutPlan, addWorkoutDay, addExerciseToDay,
--                     publishWorkoutPlan) e :1511-1660 (createNutritionPlan, addMeal, addMealItem,
--                     publishNutritionPlan), chamadas só de app/coach/**.
--   photos            aluno escreve com a SESSÃO (RLS): lib/storage/checkin-photos.ts:238-244 (select),
--                     :253-257 (update de checkin_id/storage_path/created_at), :259-265 (delete de
--                     duplicatas), :268-277 (insert com checkin_id, week_number, angle e
--                     storage_path = buildPhotoPath, buckets.ts:34-41) — só com check-in pending/late
--                     (:218). O admin é usado só pro Storage (upload/URL assinada, :230-232, :102-118).
--                     Leitura: :131-137 (coach e aluno).
--   workout_logs      aluno só SELECT e INSERT: repository.ts:1167-1192 (logWorkoutExercise) e
--                     :1210 (getWorkoutLogsForWeek). Não existe update/delete de workout_logs em
--                     nenhum lugar do app. UPDATE fica liberado ao aluno (só nos próprios logs) porque
--                     a 0003 desenhou log por série com upsert (unique sessão+exercício+série) — um
--                     upsert em conflito precisa de UPDATE; DELETE é negado.
--   Coach: toda leitura/escrita do coach nessas tabelas usa a sessão dele e continua coberta pela
--   policy `<tabela>_coach_full_access` via private.is_coach_of_client (mesma regra de conta do
--   can_access_client antigo).
--
-- DECISÕES
--   * Aluno mantém SELECT da própria assinatura e das próprias cobranças (o 0001 já dava; o app atual
--     não usa, mas uma tela "Pagamento" do portal vai precisar e um SELECT vazio silencioso seria um
--     bug difícil de achar). Se preferir zero acesso, basta dropar `subscriptions_client_read` e
--     `payments_client_read`.
--   * Não mexi em `notifications`: o INSERT cruzado (aluno -> coach) é desenho do 0002 e o app
--     depende dele (createNotification). Aluno ainda pode inserir notificação com texto livre pro
--     próprio client_id; risco baixo (spam de texto pro próprio coach), fora do escopo desta migration.
--   * `photos`: unique (client_id, week_number, angle) já vem da 0003 (se não havia duplicata).
--
-- Convenções herdadas: snake_case; funções de RLS no schema `private` (security definer, stable,
-- set search_path = public); `(select auth.uid())`/`(select private.fn())` em subquery pra o Postgres
-- avaliar uma vez por statement; enums como CHECK.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ============================================================================
-- FUNÇÕES DE APOIO PRA RLS (schema private)
-- ============================================================================

-- true se o ALUNO autenticado (dono de `p_client`) pode abrir o check-in (week, período, template)
-- que está tentando inserir: exatamente a semana corrente calculada como o app faz em
-- computeWeekInfo (lib/repository.ts:264-280) — dia de HOJE EM UTC menos `clients.start_date`,
-- semana = max(1, floor(dias/7) + 1), período = start_date + (semana-1)*7 até +6 — e template
-- (se houver) da conta do aluno. Se o app trocar o fuso/regra da semana, mude AQUI junto.
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
    where c.id = p_client
      and c.auth_user_id = (select auth.uid())
      and c.start_date is not null
      and p_week = greatest(1, floor(((now() at time zone 'utc')::date - c.start_date)::numeric / 7)::integer + 1)
      and p_period_start = c.start_date + (p_week - 1) * 7
      and p_period_end = c.start_date + (p_week - 1) * 7 + 6
      and (
        p_template is null
        or exists (
          select 1 from checkin_templates t
          where t.id = p_template and t.account_id = c.account_id
        )
      )
  )
$$;

-- true se o ALUNO autenticado é dono de `p_client` e o check-in dele da semana `p_week` ainda está
-- aberto pra receber foto (pending/late) — mesma regra de uploadCheckinPhoto (checkin-photos.ts:218).
create or replace function private.client_photo_checkin_open(p_client uuid, p_week integer)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from clients c
    join checkin_instances ci on ci.client_id = c.id
    where c.id = p_client
      and c.auth_user_id = (select auth.uid())
      and ci.week_number = p_week
      and ci.status in ('pending', 'late')
  )
$$;

-- true se a LINHA de foto que o aluno quer gravar é legítima: dono = ele, check-in da semana aberto,
-- `checkin_id` (se informado) é o check-in dessa mesma semana, e `storage_path` é EXATAMENTE
-- `{account_id}/{client_id}/week-{n}/{angle}.jpg` (buckets.ts buildPhotoPath).
create or replace function private.client_can_write_photo(
  p_client uuid,
  p_week integer,
  p_angle text,
  p_path text,
  p_checkin uuid
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
    join checkin_instances ci on ci.client_id = c.id and ci.week_number = p_week
    where c.id = p_client
      and c.auth_user_id = (select auth.uid())
      and ci.status in ('pending', 'late')
      and (p_checkin is null or ci.id = p_checkin)
      and p_path = c.account_id::text || '/' || c.id::text || '/week-' || p_week::text || '/' || p_angle || '.jpg'
  )
$$;

-- ============================================================================
-- A. orientations — aluno deixa de ler a tabela pela API (fecha coach_note/author_id)
-- ============================================================================
-- A 0003 deixou o aluno ler orientação ENVIADA (limitação conhecida: RLS é por linha, então
-- `select=*` devolvia `coach_note`, a nota PRIVADA do coach, e `author_id`). O app não usa essa
-- policy: o aluno lê a orientação com o client admin e colunas seguras (evaluations.ts:831). Sem a
-- policy, o aluno (com o token dele) lê 0 linhas de orientations. Coach continua com
-- `orientations_coach_full_access` (0003).

drop policy if exists orientations_client_read_sent on orientations;

-- ============================================================================
-- B. checkin_instances — aluno só cria o check-in da semana corrente
-- ============================================================================
-- Recria `checkin_instances_client_insert` (0003) acrescentando a amarra de semana/período/template.
-- Sem isso o aluno criava check-in `pending` de QUALQUER semana e, com ele, ganhava permissão de
-- gravar métricas (private.client_can_write_metric exige check-in aberto na semana). Continua
-- exigindo status 'pending' e sem submitted_at/reviewed_at/review_opened_at.

drop policy if exists checkin_instances_client_insert on checkin_instances;
create policy checkin_instances_client_insert on checkin_instances for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and status = 'pending'
    and submitted_at is null
    and reviewed_at is null
    and review_opened_at is null
    and private.client_can_open_checkin(client_id, week_number, period_start, period_end, template_id)
  );

-- ============================================================================
-- C. history_events — PONTE TEMPORÁRIA pra markMealRealized
-- ============================================================================
-- A 0003 fechou o INSERT do aluno em history_events, mas `markMealRealized` (lib/repository.ts:1710)
-- ainda grava com a sessão do aluno um evento type='note', title 'Refeição realizada: <nome>' e
-- description 'MEAL_REALIZED:<uuid>:<semana> ...'. Sem esta policy a marcação de refeição quebra.
-- Ela é ESTREITA: só o próprio client_id, só esse formato exato (o mesmo que o leitor
-- getRealizedMealIdsForWeek faz parse). Qualquer outro type ('join', 'checkin', ...), outro título ou
-- descrição sem o marcador é negado; UPDATE/DELETE continuam negados. Tetos de tamanho (título até
-- 200 e descrição até 500 caracteres; o app grava ~100 + nome da refeição) e `event_date` recente
-- (o app não manda event_date: vale o default now(); `event_date` é timestamptz, então o fuso da
-- sessão não influencia) impedem usar a ponte pra gravar lixo grande ou eventos com data forjada.
--
-- >>> REMOVER QUANDO O APP MIGRAR markMealRealized PARA `meal_logs` (0003):
-- >>>   drop policy if exists history_events_client_meal_marker on history_events;

drop policy if exists history_events_client_meal_marker on history_events;
create policy history_events_client_meal_marker on history_events for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and type = 'note'
    and starts_with(title, 'Refeição realizada: ')
    and char_length(title) <= 200
    and description ~ '^MEAL_REALIZED:[0-9a-fA-F-]{36}:[0-9]+'
    and char_length(description) <= 500
    and event_date > now() - interval '1 day'
  );

-- ============================================================================
-- D. PAGAMENTOS — aluno nunca escreve
-- ============================================================================
-- Substitui as policies `for all` do 0001 (can_access_client, que liberava o aluno a marcar a
-- própria cobrança como paga, mudar valor/plano, apagar cobrança e forjar evento de auditoria).
-- Coach da conta = acesso total (mesma regra de conta de antes). Aluno = só SELECT da própria
-- assinatura/cobranças; payment_events fica só do coach.

drop policy if exists subscriptions_by_client on subscriptions;
drop policy if exists subscriptions_coach_full_access on subscriptions;
drop policy if exists subscriptions_client_read on subscriptions;
create policy subscriptions_coach_full_access on subscriptions for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy subscriptions_client_read on subscriptions for select to authenticated
  using (client_id = (select private.current_client_id()));

drop policy if exists payments_by_subscription on payments;
drop policy if exists payments_coach_full_access on payments;
drop policy if exists payments_client_read on payments;
create policy payments_coach_full_access on payments for all to authenticated
  using (subscription_id in (select id from subscriptions where private.is_coach_of_client(client_id)))
  with check (subscription_id in (select id from subscriptions where private.is_coach_of_client(client_id)));
create policy payments_client_read on payments for select to authenticated
  using (subscription_id in (select id from subscriptions where client_id = (select private.current_client_id())));

drop policy if exists payment_events_by_payment on payment_events;
drop policy if exists payment_events_coach_full_access on payment_events;
create policy payment_events_coach_full_access on payment_events for all to authenticated
  using (payment_id in (
    select p.id from payments p
    join subscriptions s on s.id = p.subscription_id
    where private.is_coach_of_client(s.client_id)
  ))
  with check (payment_id in (
    select p.id from payments p
    join subscriptions s on s.id = p.subscription_id
    where private.is_coach_of_client(s.client_id)
  ));

-- ============================================================================
-- E. PLANOS DE TREINO E NUTRIÇÃO — aluno só lê o PUBLICADO, nunca escreve
-- ============================================================================
-- Substitui as policies `for all` do 0001. Coach da conta = acesso total (inclui rascunho). Aluno =
-- SELECT só de plano com is_draft = false do próprio client_id; dias/exercícios/refeições/itens/
-- substituições só via plano publicado dele. As policies de TEMPLATE da 0003
-- (`*_template_by_account`, só coach) não são tocadas.

-- ---- treino ----
drop policy if exists workout_plans_by_client on workout_plans;
drop policy if exists workout_plans_coach_full_access on workout_plans;
drop policy if exists workout_plans_client_read on workout_plans;
create policy workout_plans_coach_full_access on workout_plans for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy workout_plans_client_read on workout_plans for select to authenticated
  using (client_id = (select private.current_client_id()) and is_draft = false);

drop policy if exists workout_days_by_plan on workout_days;
drop policy if exists workout_days_coach_full_access on workout_days;
drop policy if exists workout_days_client_read on workout_days;
create policy workout_days_coach_full_access on workout_days for all to authenticated
  using (plan_id in (select id from workout_plans where private.is_coach_of_client(client_id)))
  with check (plan_id in (select id from workout_plans where private.is_coach_of_client(client_id)));
create policy workout_days_client_read on workout_days for select to authenticated
  using (plan_id in (
    select id from workout_plans
    where client_id = (select private.current_client_id()) and is_draft = false
  ));

drop policy if exists workout_exercises_by_day on workout_exercises;
drop policy if exists workout_exercises_coach_full_access on workout_exercises;
drop policy if exists workout_exercises_client_read on workout_exercises;
create policy workout_exercises_coach_full_access on workout_exercises for all to authenticated
  using (day_id in (
    select wd.id from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ))
  with check (day_id in (
    select wd.id from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where private.is_coach_of_client(wp.client_id)
  ));
create policy workout_exercises_client_read on workout_exercises for select to authenticated
  using (day_id in (
    select wd.id from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where wp.client_id = (select private.current_client_id()) and wp.is_draft = false
  ));

-- ---- nutrição ----
drop policy if exists nutrition_plans_by_client on nutrition_plans;
drop policy if exists nutrition_plans_coach_full_access on nutrition_plans;
drop policy if exists nutrition_plans_client_read on nutrition_plans;
create policy nutrition_plans_coach_full_access on nutrition_plans for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy nutrition_plans_client_read on nutrition_plans for select to authenticated
  using (client_id = (select private.current_client_id()) and is_draft = false);

drop policy if exists meals_by_plan on meals;
drop policy if exists meals_coach_full_access on meals;
drop policy if exists meals_client_read on meals;
create policy meals_coach_full_access on meals for all to authenticated
  using (plan_id in (select id from nutrition_plans where private.is_coach_of_client(client_id)))
  with check (plan_id in (select id from nutrition_plans where private.is_coach_of_client(client_id)));
create policy meals_client_read on meals for select to authenticated
  using (plan_id in (
    select id from nutrition_plans
    where client_id = (select private.current_client_id()) and is_draft = false
  ));

drop policy if exists meal_items_by_meal on meal_items;
drop policy if exists meal_items_coach_full_access on meal_items;
drop policy if exists meal_items_client_read on meal_items;
create policy meal_items_coach_full_access on meal_items for all to authenticated
  using (meal_id in (
    select m.id from meals m
    join nutrition_plans np on np.id = m.plan_id
    where private.is_coach_of_client(np.client_id)
  ))
  with check (meal_id in (
    select m.id from meals m
    join nutrition_plans np on np.id = m.plan_id
    where private.is_coach_of_client(np.client_id)
  ));
create policy meal_items_client_read on meal_items for select to authenticated
  using (meal_id in (
    select m.id from meals m
    join nutrition_plans np on np.id = m.plan_id
    where np.client_id = (select private.current_client_id()) and np.is_draft = false
  ));

drop policy if exists meal_substitutions_by_item on meal_substitutions;
drop policy if exists meal_substitutions_coach_full_access on meal_substitutions;
drop policy if exists meal_substitutions_client_read on meal_substitutions;
create policy meal_substitutions_coach_full_access on meal_substitutions for all to authenticated
  using (meal_item_id in (
    select mi.id from meal_items mi
    join meals m on m.id = mi.meal_id
    join nutrition_plans np on np.id = m.plan_id
    where private.is_coach_of_client(np.client_id)
  ))
  with check (meal_item_id in (
    select mi.id from meal_items mi
    join meals m on m.id = mi.meal_id
    join nutrition_plans np on np.id = m.plan_id
    where private.is_coach_of_client(np.client_id)
  ));
create policy meal_substitutions_client_read on meal_substitutions for select to authenticated
  using (meal_item_id in (
    select mi.id from meal_items mi
    join meals m on m.id = mi.meal_id
    join nutrition_plans np on np.id = m.plan_id
    where np.client_id = (select private.current_client_id()) and np.is_draft = false
  ));

-- ============================================================================
-- F. photos — aluno só grava o caminho canônico da própria semana, com check-in aberto
-- ============================================================================
-- Substitui `photos_by_client` (0001, for all). Coach = acesso total (o app só LÊ com o coach, mas
-- mantém a paridade com as demais tabelas). Aluno: SELECT das próprias; INSERT/UPDATE só se
-- private.client_can_write_photo (dono, check-in da semana pending/late, checkin_id coerente e
-- storage_path canônico); UPDATE/DELETE também só sobre linha cuja semana ainda está aberta
-- (private.client_photo_checkin_open) — foto de check-in já enviado/avaliado fica congelada.

drop policy if exists photos_by_client on photos;
drop policy if exists photos_coach_full_access on photos;
drop policy if exists photos_client_read on photos;
drop policy if exists photos_client_insert on photos;
drop policy if exists photos_client_update on photos;
drop policy if exists photos_client_delete on photos;

create policy photos_coach_full_access on photos for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));

create policy photos_client_read on photos for select to authenticated
  using (client_id = (select private.current_client_id()));

create policy photos_client_insert on photos for insert to authenticated
  with check (
    client_id = (select private.current_client_id())
    and private.client_can_write_photo(client_id, week_number, angle, storage_path, checkin_id)
  );

create policy photos_client_update on photos for update to authenticated
  using (
    client_id = (select private.current_client_id())
    and private.client_photo_checkin_open(client_id, week_number)
  )
  with check (
    client_id = (select private.current_client_id())
    and private.client_can_write_photo(client_id, week_number, angle, storage_path, checkin_id)
  );

create policy photos_client_delete on photos for delete to authenticated
  using (
    client_id = (select private.current_client_id())
    and private.client_photo_checkin_open(client_id, week_number)
  );

-- ============================================================================
-- G. workout_logs — aluno lê/insere/atualiza os próprios; não apaga
-- ============================================================================
-- Substitui `workout_logs_by_client` (0001, for all). O app só faz SELECT e INSERT com a sessão do
-- aluno; UPDATE fica pros logs por série da 0003 (upsert). Nenhum DELETE pelo aluno.

drop policy if exists workout_logs_by_client on workout_logs;
drop policy if exists workout_logs_coach_full_access on workout_logs;
drop policy if exists workout_logs_client_read on workout_logs;
drop policy if exists workout_logs_client_insert on workout_logs;
drop policy if exists workout_logs_client_update on workout_logs;

create policy workout_logs_coach_full_access on workout_logs for all to authenticated
  using (private.is_coach_of_client(client_id))
  with check (private.is_coach_of_client(client_id));
create policy workout_logs_client_read on workout_logs for select to authenticated
  using (client_id = (select private.current_client_id()));
create policy workout_logs_client_insert on workout_logs for insert to authenticated
  with check (client_id = (select private.current_client_id()));
create policy workout_logs_client_update on workout_logs for update to authenticated
  using (client_id = (select private.current_client_id()))
  with check (client_id = (select private.current_client_id()));

commit;

-- ============================================================================
-- CONFERÊNCIA PÓS-MIGRATION (rodar à parte, só leitura)
-- ============================================================================
--   -- 1) toda tabela de public com RLS ligado (esperado: nenhuma linha com relrowsecurity = false)
--   select relname, relrowsecurity from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
--   -- 2) nenhuma tabela mexida deve ter policy antiga `for all` com role public
--   select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public'
--     and tablename in ('subscriptions','payments','payment_events','workout_plans','workout_days',
--                       'workout_exercises','nutrition_plans','meals','meal_items','meal_substitutions',
--                       'photos','workout_logs','orientations','checkin_instances','history_events')
--   order by tablename, policyname;
--   -- 3) funções novas com search_path fixo (esperado: proconfig = {search_path=public})
--   select p.proname, p.prosecdef, p.proconfig from pg_proc p
--   where p.pronamespace = 'private'::regnamespace
--     and p.proname in ('client_can_open_checkin','client_photo_checkin_open','client_can_write_photo');
