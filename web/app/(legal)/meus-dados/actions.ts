"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordConsent } from "@/lib/legal/consent";
import { requireClientSession } from "@/app/portal/require-client";

export type PrivacyRequestState = { error?: string; success?: string } | null;

const STUDENT_REQUEST_TYPES = ["access", "correction", "deletion", "other"] as const;

/**
 * Registra um pedido do titular (art. 18) pra o coach (controlador) responder. A RPC
 * `create_data_subject_request` deriva aluno/conta de `auth.uid()`.
 */
export async function createPrivacyRequestAction(
  _prev: PrivacyRequestState,
  formData: FormData
): Promise<PrivacyRequestState> {
  await requireClientSession();

  const type = String(formData.get("type") || "");
  const details = String(formData.get("details") || "").trim().slice(0, 2000);
  if (!(STUDENT_REQUEST_TYPES as readonly string[]).includes(type)) {
    return { error: "Tipo de pedido inválido." };
  }
  if (type === "correction" && !details) {
    return { error: "Conte o que precisa ser corrigido." };
  }
  if (type === "deletion" && formData.get("confirm") !== "on") {
    return { error: "Confirme que entende que a exclusão encerra seu acompanhamento." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_data_subject_request", {
    p_type: type,
    p_details: details || null,
  });
  if (error) {
    console.error("Falha ao registrar pedido LGPD:", error.message);
    return { error: "Não foi possível registrar o pedido. Tente novamente." };
  }

  revalidatePath("/meus-dados");
  return { success: "Pedido registrado. Seu profissional vai responder por aqui." };
}

/**
 * Revogação do consentimento de dados de saúde (art. 8º, §5º — tão fácil quanto dar). Grava a
 * revogação e abre um pedido pro coach; como o consentimento passa a faltar, o gate de
 * `requireClient` bloqueia o portal a partir daqui — só `/meus-dados` (direitos do titular) e
 * `/consentimento` (pra reautorizar) continuam abertos.
 */
export async function revokeHealthConsentAction(formData: FormData): Promise<void> {
  await requireClientSession();
  if (formData.get("confirm") !== "on") redirect("/meus-dados?erro=confirmar");

  const supabase = await createClient();
  await recordConsent(supabase, ["health_data"], "revoked");
  const { error } = await supabase.rpc("create_data_subject_request", {
    p_type: "consent_revocation",
    p_details: "Consentimento de dados de saúde revogado pelo aluno no portal.",
  });
  if (error) console.error("Revogação gravada, mas o pedido ao coach falhou:", error.message);

  redirect("/meus-dados?revogado=1");
}
