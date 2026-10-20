"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GENDER_FORM_OPTIONS } from "@/lib/checkin-catalog";
import { requireActiveCoach } from "../../require-coach";

export type GenderFormState = { ok?: string; error?: string } | null;

const ALLOWED = new Set(GENDER_FORM_OPTIONS.map((o) => o.value));

/**
 * "Sexo (para perguntas do check-in)" no Resumo do aluno: grava `clients.gender` ("feminino",
 * "masculino" ou `null` = não informado). Só decide a pergunta de ciclo menstrual do check-in
 * (`lib/checkin-catalog.ts#normalizeGender`) — nunca é inferido do nome. Sessão do coach: a RLS
 * `clients_coach_full_access` limita aos alunos da própria conta (aluno de outra conta: 0 linhas).
 */
export async function saveClientGenderAction(
  _prev: GenderFormState,
  formData: FormData
): Promise<GenderFormState> {
  await requireActiveCoach();
  const clientId = String(formData.get("clientId") ?? "");
  const value = String(formData.get("gender") ?? "");
  if (!clientId) return { error: "Aluno inválido." };
  if (!ALLOWED.has(value)) return { error: "Escolha uma das opções." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ gender: value || null })
    .eq("id", clientId)
    .select("id");
  if (error || !data || data.length === 0) {
    if (error) console.error("Falha ao salvar o sexo do aluno:", error.message);
    return { error: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath(`/coach/alunos/${clientId}`);
  return { ok: "Salvo. Vale a partir do próximo check-in aberto." };
}
