/**
 * Sanitização de mensagem de erro pro texto exibido nas Server Actions (item 25/37 do master
 * TODO). Um id forjado no FormData (`clientId`, `checkinId`, `planId`, ...) pode esbarrar numa
 * policy de RLS ou numa constraint do banco — o Postgres/PostgREST devolve texto técnico cru
 * ("new row violates row-level security policy for table ...", "duplicate key value violates
 * unique constraint ...") que não diz nada de útil pro usuário e ainda expõe nomes de
 * tabela/coluna. Esta função reconhece esse padrão e troca por um `fallback` amigável;
 * qualquer outra mensagem (já escrita à mão em `lib/repository.ts`, ou de negócio) passa
 * direto — nunca esconde um erro real, só filtra o ruído técnico do banco. Não muda nenhum
 * comportamento de segurança, só o texto exibido.
 */
const RAW_DB_ERROR_PATTERN =
  /row-level security|permission denied|violates|duplicate key|syntax error|invalid input syntax|null value in column|foreign key constraint|check constraint|unique constraint|pgrst\d|json object requested/i;

/** Troca `message` pelo `fallback` quando ele parecer texto técnico cru de banco; senão devolve
 * `message` como veio. */
export function sanitizeDbErrorMessage(message: string, fallback: string): string {
  return RAW_DB_ERROR_PATTERN.test(message) ? fallback : message;
}

/** Mesma coisa, a partir do `unknown` capturado num `catch` — o padrão comum das Server
 * Actions do app (antes: `err instanceof Error ? err.message : fallback`, que vazava texto cru
 * de banco quando `err.message` vinha do Postgres). */
export function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? sanitizeDbErrorMessage(err.message, fallback) || fallback : fallback;
}
