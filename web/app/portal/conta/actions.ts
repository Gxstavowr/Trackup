"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prefsFromCheckboxes, validateProfileInput } from "@/lib/student-profile";
import { requireClient } from "../require-client";

/**
 * Server Actions de /portal/conta (migration 0018). Rodam com o client da SESSÃO do aluno — nunca
 * o admin — e só chamam as RPCs `update_my_profile` / `set_my_notification_preferences`, que
 * derivam o aluno de auth.uid() e só tocam nome/telefone e as preferências dele. Nenhum id vem do
 * formulário. A validação aqui é só para a mensagem; o banco impõe as mesmas regras.
 */

export type ProfileFormState = {
  ok?: boolean;
  error?: string;
  field?: "name" | "phone";
  /** muda a cada envio bem-sucedido — o formulário usa para mostrar o aviso de novo */
  savedAt?: number;
} | null;

const DB_ERROR_MESSAGE: Record<string, { error: string; field?: "name" | "phone" }> = {
  "trackly:invalid_name": { error: "Informe seu nome (de 2 a 80 caracteres).", field: "name" },
  "trackly:invalid_phone": { error: "Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.", field: "phone" },
  "trackly:invalid_preferences": { error: "Escolha inválida. Recarregue a página e tente de novo." },
};

function mapRpcError(message: string, fallback: string): { error: string; field?: "name" | "phone" } {
  return DB_ERROR_MESSAGE[message] ?? { error: fallback };
}

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  await requireClient();

  const parsed = validateProfileInput(formData.get("name"), formData.get("phone"));
  if (!parsed.ok) return { error: parsed.error, field: parsed.field };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_profile", {
    p_name: parsed.value.name,
    p_phone: parsed.value.phone ?? "",
  });
  if (error) {
    console.error("update_my_profile falhou:", error.code, error.message);
    return mapRpcError(error.message, "Não foi possível salvar seu perfil. Tente de novo.");
  }

  revalidatePath("/portal", "layout");
  return { ok: true, savedAt: Date.now() };
}

export type PrefsFormState = { ok?: boolean; error?: string; savedAt?: number } | null;

export async function updateNotificationPrefsAction(_prev: PrefsFormState, formData: FormData): Promise<PrefsFormState> {
  await requireClient();

  const prefs = prefsFromCheckboxes((key) => formData.get(key));
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_notification_preferences", {
    p_orientation_ready: prefs.orientation_ready,
    p_workout_updated: prefs.workout_updated,
    p_nutrition_updated: prefs.nutrition_updated,
  });
  if (error) {
    console.error("set_my_notification_preferences falhou:", error.code, error.message);
    return { error: mapRpcError(error.message, "Não foi possível salvar suas preferências. Tente de novo.").error };
  }

  revalidatePath("/portal/conta");
  return { ok: true, savedAt: Date.now() };
}
