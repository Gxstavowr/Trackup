import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_VERSION, REQUIRED_PURPOSES, type ConsentPurpose } from "./documents";

/**
 * Leitura/gravação de consentimento (tabela `consent_records`, migration 0010). Toda escrita
 * passa pela RPC `record_consent`, que deriva o titular de `auth.uid()` — o app nunca informa
 * user_id/account_id/client_id.
 */

type ConsentRow = { purpose: ConsentPurpose; document_version: string; action: "granted" | "revoked" };

/** Finalidades obrigatórias que o usuário AINDA NÃO aceitou na versão atual (vazio = em dia). */
export async function getMissingConsents(
  supabase: SupabaseClient,
  userId: string,
  role: "coach" | "client"
): Promise<ConsentPurpose[]> {
  const required = REQUIRED_PURPOSES[role];
  const { data, error } = await supabase
    .from("consent_records")
    .select("purpose, document_version, action")
    .eq("user_id", userId)
    .in("purpose", required)
    .order("created_at", { ascending: false });

  // Falha de leitura (ex.: migration 0010 ainda não aplicada) NÃO derruba o app inteiro: loga e
  // trata como "em dia". O registro em si continua sendo exigido nas telas de aceite.
  if (error) {
    console.error("Não foi possível ler consent_records:", error.message);
    return [];
  }

  const latest = new Map<ConsentPurpose, ConsentRow>();
  for (const row of (data ?? []) as ConsentRow[]) {
    if (!latest.has(row.purpose)) latest.set(row.purpose, row);
  }

  return required.filter((purpose) => {
    const row = latest.get(purpose);
    return !row || row.action !== "granted" || row.document_version !== LEGAL_VERSION;
  });
}

/** IP + user agent da requisição atual — vão junto do registro como evidência (art. 8º, §2º). */
export async function getRequestEvidence(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip");
  return { ip: ip || null, userAgent: h.get("user-agent") };
}

export async function recordConsent(
  supabase: SupabaseClient,
  purposes: ConsentPurpose[],
  action: "granted" | "revoked"
): Promise<void> {
  const { ip, userAgent } = await getRequestEvidence();
  const { error } = await supabase.rpc("record_consent", {
    p_purposes: purposes,
    p_version: LEGAL_VERSION,
    p_action: action,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) throw new Error(`Não foi possível registrar o consentimento: ${error.message}`);
}
