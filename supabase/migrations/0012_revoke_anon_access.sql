-- Trackly — 0012: a chave PÚBLICA (role `anon`) deixa de ter qualquer acesso às tabelas
--
-- APLICAR DEPOIS da 0011. Numa transação, reexecutável (REVOKE de algo já revogado é no-op).
-- Não altera nem apaga nenhuma linha, tabela ou policy.
--
-- POR QUE EXISTE (auditoria de banco de 2026-10-09)
--   Teste ao vivo: sem login, todas as 35 tabelas devolveram 0 linhas — o RLS segura. Mas as
--   tabelas da 0001/0002 ainda dão a `anon` permissão de SELECT/INSERT/UPDATE/DELETE (padrão do
--   Supabase), então a ÚNICA barreira é o RLS. Se um dia uma tabela nova for criada sem RLS
--   (pelo painel, num teste, numa migration esquecida), ela fica aberta pra qualquer pessoa
--   com a URL do projeto. Defesa em profundidade: `anon` não precisa de tabela nenhuma.
--
-- POR QUE É SEGURO
--   O app nunca lê/escreve tabela sem login: login, cadastro, magic link e reset de senha usam a
--   API de Auth (não as tabelas); a tela de convite usa a service role no servidor. Usuários
--   logados usam a role `authenticated`, que esta migration NÃO toca.

begin;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Tabelas/funções criadas DEPOIS desta migration (pelo role postgres — SQL Editor/migrations)
-- já nascem sem permissão pra `anon`.
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

commit;

-- ============================================================================
-- CONFERÊNCIA (rodar depois, separadamente — só leitura). As 3 devem voltar VAZIAS.
-- Vale rodar de novo sempre que uma tabela nova for criada.
-- ============================================================================

-- 1) Tabela do schema public SEM RLS ligado:
-- select c.relname as tabela_sem_rls
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 2) Qualquer permissão que `anon` ainda tenha numa tabela do public:
-- select table_name, privilege_type
--   from information_schema.role_table_grants
--  where grantee = 'anon' and table_schema = 'public';

-- 3) Função do public que `anon` ainda consegue executar:
-- select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
