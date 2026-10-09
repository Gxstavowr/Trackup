"use server";

import { revalidatePath } from "next/cache";
import {
  MAX_COACH_NOTE_CHARS,
  MAX_ORIENTATION_CHARS,
  markReviewOpened,
  saveOrientationDraft,
  sendOrientation,
} from "@/lib/evaluations";
import { actionErrorMessage } from "@/lib/action-errors";
import { requireCoach } from "../../../require-coach";

export type EvaluationActionState = {
  error?: string;
  /** `draft`: rascunho salvo (a tela continua aberta); `sent`: orientação enviada, ciclo concluído. */
  success?: "draft" | "sent";
  /** Hora do salvamento (pt-BR, fuso de São Paulo), pra confirmar o rascunho na tela. */
  savedAt?: string;
  /**
   * A que semana o resultado se refere. Em `success`, a semana que o SERVIDOR gravou (a mesma que a
   * fila tinha no momento); em `error`, a semana que estava na tela. Deixa o formulário mostrar
   * "orientação da semana N enviada" mesmo depois que a tela avançou pra semana seguinte, e não
   * repetir aviso/erro de uma semana em outra.
   */
  week?: number;
} | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server Actions são endpoints POST públicos: TODA autorização acontece aqui/dentro de
 * `lib/evaluations.ts`, nunca confiando no que o formulário mandou. `requireCoach()` valida
 * sessão + role; o vínculo coach -> aluno é garantido pelo RLS (`resolveEvaluationTarget` só
 * acha o aluno se ele for da conta do coach logado — outro coach recebe "Aluno não encontrado").
 */

/** Chamada uma vez quando o coach abre a avaliação: grava `review_opened_at` (idempotente). */
export async function markReviewOpenedAction(clientId: string): Promise<void> {
  await requireCoach();
  if (!UUID_RE.test(clientId)) return;
  try {
    await markReviewOpened(clientId);
  } catch (err) {
    console.error("Não foi possível marcar a avaliação como aberta:", err);
    return;
  }
  // "layout": o badge da navegação e as listas (`/coach`, `/coach/avaliacoes`) refletem o novo estado.
  revalidatePath("/coach", "layout");
}

/** "Salvar rascunho" (`intent=draft`) e "Concluir e enviar orientação" (`intent=send`). */
export async function saveEvaluationAction(
  _prevState: EvaluationActionState,
  formData: FormData
): Promise<EvaluationActionState> {
  await requireCoach();

  const clientId = String(formData.get("clientId") || "");
  const intent = String(formData.get("intent") || "");
  const text = String(formData.get("text") || "").trim();
  const coachNote = String(formData.get("coachNote") || "").trim();

  // Semana que o coach tinha na tela: o servidor recusa gravar se a fila já avançou pra outra.
  const shownWeek = Number(formData.get("weekNumber"));
  const week = Number.isInteger(shownWeek) && shownWeek > 0 ? shownWeek : undefined;

  if (!UUID_RE.test(clientId)) return { error: "Aluno inválido.", week };
  if (intent !== "draft" && intent !== "send") return { error: "Ação inválida.", week };
  if (week === undefined) return { error: "Semana inválida. Recarregue a página.", week };
  if (text.length > MAX_ORIENTATION_CHARS) {
    return { error: `A orientação passou de ${MAX_ORIENTATION_CHARS} caracteres. Encurte o texto.`, week };
  }
  if (coachNote.length > MAX_COACH_NOTE_CHARS) {
    return { error: `A nota do coach passou de ${MAX_COACH_NOTE_CHARS} caracteres. Encurte o texto.`, week };
  }

  if (intent === "draft" && !text && !coachNote) {
    return { error: "Escreva a orientação ou uma nota antes de salvar o rascunho.", week };
  }

  let savedWeek: number;
  try {
    const result =
      intent === "draft"
        ? await saveOrientationDraft(clientId, { text, coachNote, expectedWeek: week })
        : await sendOrientation(clientId, { text, coachNote, expectedWeek: week });
    savedWeek = result.weekNumber;
  } catch (err) {
    return {
      error: actionErrorMessage(err, "Não foi possível salvar a avaliação."),
      week,
    };
  }

  revalidatePath("/coach", "layout");
  return {
    success: intent === "send" ? "sent" : "draft",
    week: savedWeek,
    savedAt: new Date().toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}
