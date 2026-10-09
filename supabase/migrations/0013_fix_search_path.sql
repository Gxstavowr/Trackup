-- Trackly — 0013: fixa o search_path de private.raise_cross_account
--
-- APLICAR DEPOIS da 0012. Reexecutável. Não altera nem apaga nenhuma linha.
--
-- POR QUE EXISTE (Security Advisor de 2026-10-09: "Function Search Path Mutable")
--   Sem search_path fixo, a função resolve nomes pelo search_path de quem a chama — em tese
--   alguém poderia criar um objeto com o mesmo nome num schema anterior e desviar a chamada.
--   A função só faz RAISE (não referencia tabela nenhuma), então '' é seguro.
--
-- Os outros avisos do Advisor são esperados e ficam como estão:
--   * "Signed-In Users Can Execute SECURITY DEFINER Function" em record_consent,
--     create_data_subject_request e resolve_data_subject_request: são RPCs feitas pra serem
--     chamadas por usuário logado; cada uma deriva o titular de auth.uid() e valida
--     permissão por dentro (0010), e `anon` não executa nenhuma (0012).
--   * "Leaked Password Protection Disabled": só existe no plano Pro.

alter function private.raise_cross_account(text) set search_path = '';

-- CONFERÊNCIA (só leitura) — deve voltar {search_path=""}:
-- select proconfig from pg_proc where oid = 'private.raise_cross_account(text)'::regprocedure;
