/**
 * Classifica um erro do Supabase/PostgREST: "objeto inexistente" (migração 0022 ainda não aplicada,
 * ou seja, comportamento legado) × qualquer outro erro (indisponibilidade real). Função pura.
 */
export type DbError = { code?: string; message?: string } | null | undefined;

const MISSING_CODES = ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"];

export function isMissingSchemaError(err: DbError): boolean {
  if (!err) return false;
  return (
    MISSING_CODES.includes(err.code ?? "") ||
    /does not exist|schema cache|could not find the (table|function|column)/i.test(err.message ?? "")
  );
}
