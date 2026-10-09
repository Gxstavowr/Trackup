"use server";

import { revalidatePath } from "next/cache";
import {
  createClient as createClientRecord,
  sendInvite as sendInviteRecord,
} from "@/lib/repository";
import { actionErrorMessage } from "@/lib/action-errors";

/** Campo numérico opcional: vazio -> `undefined`; preenchido mas não-inteiro -> `null` (inválido). */
function parseOptionalInt(raw: FormDataEntryValue | null): number | null | undefined {
  const text = String(raw ?? "").trim();
  if (!text) return undefined;
  return /^\d+$/.test(text) ? Number(text) : null;
}

export type CreateClientState = {
  error?: string;
  success?: boolean;
} | null;

/**
 * Server Action do formulário "Adicionar aluno" (item 4 do TODO). Cria o aluno já com
 * `invite_status = 'pending'` (via `lib/repository.ts` — nunca acesso direto ao Supabase
 * aqui) e deixa o envio do convite como um passo separado (botão "Marcar convite como
 * enviado" por aluno) — ver decisão de fluxo no relatório da tarefa.
 */
export async function createClientAction(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const objective = String(formData.get("objective") || "").trim();

  if (!name) {
    return { error: "Informe o nome do aluno." };
  }

  // Idade e altura são opcionais; se vierem preenchidas, têm que ser inteiros plausíveis.
  const age = parseOptionalInt(formData.get("age"));
  const heightCm = parseOptionalInt(formData.get("heightCm"));
  if (age !== undefined && (age === null || age < 1 || age > 120)) {
    return { error: "Informe uma idade entre 1 e 120 anos." };
  }
  if (heightCm !== undefined && (heightCm === null || heightCm < 50 || heightCm > 250)) {
    return { error: "Informe a altura em centímetros (entre 50 e 250)." };
  }

  try {
    await createClientRecord({
      name,
      email: email || undefined,
      phone: phone || undefined,
      age,
      heightCm,
      objective: objective || undefined,
    });
  } catch (err) {
    return {
      error: actionErrorMessage(err, "Não foi possível criar o aluno."),
    };
  }

  revalidatePath("/coach/alunos");
  revalidatePath("/coach");
  return { success: true };
}

/**
 * Marca o convite como enviado (coach confirmando que copiou/mandou o link manualmente —
 * ver `sendInvite` em `lib/repository.ts`). Usada num `<form action={...}>` simples com
 * `clientId` num input escondido, mesmo padrão do `acceptInvite` em `app/convite/actions.ts`.
 */
export async function sendInviteAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  if (!clientId) return;

  await sendInviteRecord(clientId);
  revalidatePath("/coach/alunos");
  revalidatePath("/coach");
}
