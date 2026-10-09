-- Trackly — 0011: aceite do aluno JUNTO com a criação da conta (tela de convite)
--
-- APLICAR DEPOIS da 0010. Aditiva, numa transação, reexecutável.
--
-- POR QUE EXISTE
--   O aluno marca a Política + o consentimento de dados de saúde na própria tela de convite
--   (`/convite`), ANTES de existir login dele em auth.users. O registro nasce com `client_id` e
--   `user_id` nulo (gravado pela service role em `app/convite/actions.ts`, com IP/user agent) e é
--   VINCULADO ao login no callback do magic link (`app/auth/callback/route.ts`), quando o e-mail
--   foi confirmado — só aí `user_id` é preenchido. Sem essa coluna opcional, o aceite teria que
--   ser pedido numa tela separada depois do cadastro.
--
-- Nada muda pra quem grava via RPC `record_consent` (continua sempre com user_id).

begin;

alter table consent_records alter column user_id drop not null;

alter table consent_records drop constraint if exists consent_records_subject_present;
alter table consent_records add constraint consent_records_subject_present
  check (user_id is not null or client_id is not null);

commit;
