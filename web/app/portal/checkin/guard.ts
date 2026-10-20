import "server-only";
import { accessForModule, getMyOnboardingStatus } from "@/lib/onboarding/status";
import type { ModuleId } from "@/lib/onboarding/packages";

/**
 * Guardas de servidor do aluno (V5). Aluno legado (sem pacote) nunca é bloqueado.
 * Não é um arquivo "use server": só é importado por páginas e Server Actions.
 */

export const STATUS_UNAVAILABLE_MESSAGE = "Não foi possível confirmar seu plano agora. Tente de novo em instantes.";

export const CHECKIN_LOCKED_MESSAGE = "O check-in semanal abre depois que seu protocolo for publicado.";

/** Aluno novo (onboarding obrigatório) sem nenhum módulo publicado: check-in ainda não liberado. */
export async function isCheckinLocked(): Promise<boolean> {
  const status = await getMyOnboardingStatus();
  if (status.legacy || !status.onboardingRequired) return false;
  return !status.published.training && !status.published.nutrition;
}

/** Mensagem de recusa para o envio do check-in, ou `null` se liberado. */
export async function checkinBlockMessage(): Promise<string | null> {
  // Falha ao ler o status (não é "legado"): recusa a gravação em vez de liberar às cegas.
  if ((await getMyOnboardingStatus()).error) return STATUS_UNAVAILABLE_MESSAGE;
  return (await isCheckinLocked()) ? CHECKIN_LOCKED_MESSAGE : null;
}

/** Mensagem de recusa para ações que gravam em um módulo, ou `null` se liberado/legado. */
export async function moduleWriteBlockMessage(module: ModuleId): Promise<string | null> {
  const status = await getMyOnboardingStatus();
  if (status.error) return STATUS_UNAVAILABLE_MESSAGE;
  const access = accessForModule(status, module);
  if (!access || access.state === "available") return null;
  if (access.state === "not_contracted") {
    return module === "training"
      ? "O treino não faz parte do seu pacote atual. Fale com seu coach se quiser incluí-lo."
      : "A nutrição não faz parte do seu pacote atual. Fale com seu coach se quiser incluí-la.";
  }
  return module === "training"
    ? "Seu treino ainda não está liberado. Assim que seu coach publicar o protocolo, você poderá registrar seus treinos."
    : "Sua nutrição ainda não está liberada. Assim que seu coach publicar o protocolo, você poderá registrar suas refeições.";
}
