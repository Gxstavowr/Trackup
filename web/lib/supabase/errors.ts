/**
 * Supabase Auth tem um limite de e-mails/hora bem baixo no provedor de e-mail padrão do
 * projeto (visto na prática durante os testes deste item: poucas tentativas seguidas de
 * cadastro/magic link já disparam `over_email_send_rate_limit`, status 429). Isso é uma
 * limitação real do projeto Supabase atual (sem SMTP customizado configurado), não um bug
 * — mas merece uma mensagem própria em vez do erro genérico, porque é o tipo de coisa que
 * vai acontecer de novo em teste manual/demonstração.
 */
export function isEmailRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; status?: number };
  return err.code === "over_email_send_rate_limit" || err.status === 429;
}

export const EMAIL_RATE_LIMIT_MESSAGE =
  "Muitos e-mails enviados em pouco tempo (limite do provedor de e-mail do projeto). Aguarde alguns minutos e tente novamente.";
