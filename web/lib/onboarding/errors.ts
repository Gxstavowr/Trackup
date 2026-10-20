/**
 * Tradução dos códigos `trackly:*` do V5 (0022) em mensagens amigáveis. As funções do banco
 * fazem `raise exception 'trackly:<codigo>'`; o PostgREST devolve o código dentro de `message`.
 * Complementa `lib/action-errors.ts` sem alterá-lo: mensagens sem código conhecido passam por
 * `actionErrorMessage` (que filtra texto técnico cru de banco).
 */
import { actionErrorMessage } from "../action-errors";

export const ONBOARDING_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  forbidden: "Você não tem permissão para fazer isso.",
  invalid_name: "Informe o nome do aluno.",
  invalid_email: "Informe um e-mail válido.",
  invalid_phone: "Informe um telefone válido.",
  invalid_package: "Escolha um pacote válido: Treino, Nutrição ou Híbrido.",
  invalid_period: "Escolha um período de cobrança válido.",
  invalid_price: "Informe um valor válido para o pacote.",
  client_email_exists: "Já existe um aluno com esse e-mail. Retome ou reenvie o convite dele.",
  contract_exists: "Este aluno já tem um pacote definido. Use a mudança de pacote.",
  no_contract: "Este aluno ainda não tem um pacote definido.",
  no_change: "O novo pacote e o valor são iguais aos atuais.",
  retroactive_change: "A mudança de pacote não pode começar numa data passada.",
  same_day_change: "Não dá para mudar no mesmo dia em que o pacote atual começou. Agende a partir de amanhã.",
  change_already_scheduled: "Já existe uma mudança de pacote agendada. Anule-a antes de criar outra.",
  not_voidable: "Essa mudança já está em vigor ou foi anulada e não pode ser anulada.",
  not_pending: "Essa solicitação não está mais pendente.",
  reason_too_long: "O motivo está longo demais. Resuma o texto.",
  invalid_sections: "As seções do questionário são inválidas. Recarregue a página e tente de novo.",
  questionnaire_already_submitted: "O questionário já foi enviado e não pode mais ser alterado.",
  invalid_height: "A altura informada é inválida.",
  invalid_birth_date: "A data de nascimento informada é inválida.",
  invalid_gender: "O gênero informado é inválido.",
};

const CODE_PATTERN = /trackly:([a-z_]+)/;

/** Extrai o código (sem o prefixo) de uma mensagem do banco; `null` se não houver. */
export function onboardingErrorCode(message: string): string | null {
  return CODE_PATTERN.exec(message)?.[1] ?? null;
}

/** Mensagem amigável para o texto de erro; `null` se não for um código `trackly:*` conhecido. */
export function translateOnboardingError(message: string): string | null {
  const code = onboardingErrorCode(message);
  return code && code in ONBOARDING_ERROR_MESSAGES ? ONBOARDING_ERROR_MESSAGES[code] : null;
}

/** Para o `catch` das Server Actions do onboarding: traduz o código conhecido; senão cai no
 * padrão de `actionErrorMessage` (esconde texto técnico cru e usa o `fallback`). */
export function onboardingActionError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const translated = translateOnboardingError(err.message);
    if (translated) return translated;
  }
  return actionErrorMessage(err, fallback);
}
