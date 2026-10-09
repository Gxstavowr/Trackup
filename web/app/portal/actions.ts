"use server";

import { revalidatePath } from "next/cache";
import { CheckinFieldError, saveCheckinDraft, submitCheckin } from "@/lib/repository";
import {
  listPhotosForCheckin,
  uploadCheckinPhoto,
  type CheckinPhoto,
} from "@/lib/storage/checkin-photos";
import { actionErrorMessage } from "@/lib/action-errors";

export type SubmitCheckinState = {
  error?: string;
  /** `key` da pergunta com problema (validação no servidor) — o formulário leva o aluno até ela. */
  field?: string;
  success?: boolean;
} | null;

/**
 * Server Action de envio do check-in do aluno. Recebe o id do check-in e as respostas como
 * mapa `question_key -> valor` (o formulário guiado `checkin-form.tsx` mantém o estado dos 4
 * passos e envia tudo de uma vez). Server Actions são endpoints POST públicos: TODA regra é
 * imposta em `submitCheckin` — janela sex–dom (America/Sao_Paulo), check-in do próprio aluno
 * (RLS), só chaves do template, obrigatórias e tipos — nunca confiando na interface.
 */
export async function submitCheckinAction(
  checkinId: string,
  answers: Record<string, string>
): Promise<SubmitCheckinState> {
  if (!checkinId || typeof checkinId !== "string") {
    return { error: "Check-in inválido." };
  }
  const clean: Record<string, string> = {};
  if (answers && typeof answers === "object") {
    for (const [key, value] of Object.entries(answers)) {
      if (typeof value === "string") clean[key] = value;
    }
  }

  try {
    await submitCheckin(checkinId, clean);
  } catch (err) {
    if (err instanceof CheckinFieldError) {
      return { error: err.message, field: err.field };
    }
    return {
      error: actionErrorMessage(err, "Não foi possível enviar o check-in."),
    };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/checkin");
  return { success: true };
}

export type SaveCheckinDraftResult = { ok: true } | { ok: false; error: string };

/**
 * Autosave do check-in (rascunho): grava as respostas já preenchidas SEM enviar. Só vale com o
 * check-in aberto (pending/late) e dentro da janela; não notifica o coach nem grava métricas.
 * Não revalida rotas de propósito (não pode sobrescrever o que o aluno está digitando).
 */
export async function saveCheckinDraftAction(
  checkinId: string,
  answers: Record<string, string>
): Promise<SaveCheckinDraftResult> {
  if (!checkinId || typeof checkinId !== "string") {
    return { ok: false, error: "Check-in inválido." };
  }
  const clean: Record<string, string> = {};
  if (answers && typeof answers === "object") {
    for (const [key, value] of Object.entries(answers)) {
      if (typeof value === "string") clean[key] = value;
    }
  }
  try {
    await saveCheckinDraft(checkinId, clean);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: actionErrorMessage(err, "Não foi possível salvar o rascunho."),
    };
  }
}

export type UploadCheckinPhotoResult = { photo: CheckinPhoto } | { error: string };

/**
 * Server Action de upload de UMA foto do check-in (uma chamada por posição: front/back/side).
 * O cliente já mandou o JPEG comprimido (`lib/storage/compress-image.ts`, ~1600px, q0.82,
 * sempre abaixo do teto de 1MB de corpo das Server Actions do Next). Uma action por foto —
 * em vez de mandar as 3 junto no submit final — mantém cada request pequeno, dá feedback
 * por foto e não perde as outras se uma falhar.
 *
 * Server Actions são endpoints POST públicos: TODA autorização (sessão + o check-in ser do
 * próprio aluno + status ainda editável) acontece dentro de `uploadCheckinPhoto`, nunca
 * confiando no que o form mandou. O path no Storage é montado no servidor.
 */
export async function uploadCheckinPhotoAction(
  formData: FormData
): Promise<UploadCheckinPhotoResult> {
  const file = formData.get("file");
  try {
    const { photo } = await uploadCheckinPhoto({
      checkinId: String(formData.get("checkinId") || ""),
      angle: formData.get("angle"),
      file: file instanceof File ? file : null,
    });
    return { photo };
  } catch (err) {
    return {
      error: actionErrorMessage(err, "Não foi possível enviar a foto."),
    };
  }
}

/**
 * Fotos já enviadas na semana deste check-in (com URLs assinadas de curta duração), pra o
 * formulário mostrar miniaturas ao recarregar a página. Lista vazia se o check-in não é do
 * usuário logado — `listPhotosForCheckin` faz a checagem de acesso.
 */
export async function getCheckinPhotosAction(checkinId: string): Promise<CheckinPhoto[]> {
  return (await listPhotosForCheckin(checkinId)) ?? [];
}
