-- Corrige uma lacuna real de RLS encontrada e confirmada em teste: a policy original
-- `notifications_by_client` (0001_init.sql) só verificava `can_access_client(client_id)`,
-- sem olhar a coluna `recipient`. Como uma linha de `clients` é acessível tanto pelo coach
-- (via account_id) quanto pelo próprio aluno (via auth_user_id), qualquer um dos dois
-- conseguia ler (e em teoria também UPDATE) as notificações do OUTRO lado da mesma linha
-- — confirmado com um teste direto contra a API REST usando o token de sessão de um aluno
-- de teste, que conseguiu ler uma notificação com `recipient = 'coach'` da própria conta.
--
-- O isolamento por `recipient` era garantido só na aplicação (`.eq("recipient", ...)` em
-- toda leitura do lib/repository.ts), nunca no banco — ou seja, alguém com o token de
-- sessão de um aluno (visível no próprio navegador, é assim que a Web funciona) podia
-- ler notificações privadas do coach direto contra a API REST do Supabase, sem passar
-- pelo app Next.js nem pelas checagens dele.
--
-- INSERT continua liberado pra qualquer um dos dois lados da relação (coach OU aluno),
-- porque o fluxo real precisa disso: o aluno cria uma notificação com recipient='coach'
-- ao enviar um check-in, e o coach cria uma com recipient='client' ao publicar um
-- treino/plano de nutrição. Só SELECT e UPDATE (leitura e "marcar como lida") ficam
-- restritos ao dono de fato do `recipient`.

drop policy if exists notifications_by_client on notifications;

create policy notifications_insert on notifications for insert
  with check (private.can_access_client(client_id));

create policy notifications_coach_read on notifications for select
  using (
    recipient = 'coach'
    and client_id in (select id from clients where account_id = private.current_account_id())
  );

create policy notifications_coach_update on notifications for update
  using (
    recipient = 'coach'
    and client_id in (select id from clients where account_id = private.current_account_id())
  )
  with check (
    recipient = 'coach'
    and client_id in (select id from clients where account_id = private.current_account_id())
  );

create policy notifications_client_read on notifications for select
  using (
    recipient = 'client'
    and client_id in (select id from clients where auth_user_id = (select auth.uid()))
  );

create policy notifications_client_update on notifications for update
  using (
    recipient = 'client'
    and client_id in (select id from clients where auth_user_id = (select auth.uid()))
  )
  with check (
    recipient = 'client'
    and client_id in (select id from clients where auth_user_id = (select auth.uid()))
  );
