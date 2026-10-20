"use server";

import { revalidatePath } from "next/cache";
import {
  saveMyQuestionnaireDraft,
  submitMyQuestionnaire,
  type SaveDraftResult,
  type SubmitResult,
} from "@/lib/onboarding/questionnaire";

/**
 * Server Actions do questionário inicial. São endpoints POST públicos: a sessão, o aluno, as seções
 * (pacote vigente), a validação e a separação das respostas sensíveis são todas decididas no
 * servidor (`lib/onboarding/questionnaire.ts`) — nada do navegador é confiado além das respostas.
 */

export async function saveQuestionnaireDraftAction(answers: unknown, currentStep: unknown): Promise<SaveDraftResult> {
  return saveMyQuestionnaireDraft(answers, typeof currentStep === "string" ? currentStep.slice(0, 60) : null);
}

export async function submitQuestionnaireAction(answers: unknown): Promise<SubmitResult> {
  const result = await submitMyQuestionnaire(answers);
  if (result.ok) {
    // O gate do portal e a home mudam de estado com o envio.
    revalidatePath("/portal", "layout");
  }
  return result;
}
