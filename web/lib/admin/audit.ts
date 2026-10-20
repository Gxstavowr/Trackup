import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./auth";

/** Ações aceitas pelo CHECK de `admin_audit_events.action` (0023). */
export type AdminAuditAction =
  | "admin_login"
  | "lab_switch"
  | "lab_return"
  | "lab_reset_account"
  | "lab_reset_student"
  | "platform_price_set";

export type AdminAuditInput = {
  action: AdminAuditAction;
  targetUserId?: string | null;
  targetAccountId?: string | null;
  labProfile?: string | null;
  /** Só dados não sensíveis (ex.: valor do preço, vigência). Limite de 4 KB no banco. */
  detail?: Record<string, string | number | boolean | null>;
};

/**
 * Grava um evento na trilha do proprietário (`admin_audit_events`, só service role). O ator é
 * SEMPRE o usuário da sessão validada por `requireAdmin()` — nunca um id vindo do formulário.
 * Devolve `false` se a gravação falhar (quem chama decide se isso bloqueia a ação).
 */
export async function recordAdminEvent(input: AdminAuditInput): Promise<boolean> {
  const { user } = await requireAdmin();
  const { error } = await createAdminClient()
    .from("admin_audit_events")
    .insert({
      actor_user_id: user.id,
      action: input.action,
      target_user_id: input.targetUserId ?? null,
      target_account_id: input.targetAccountId ?? null,
      lab_profile: input.labProfile ?? null,
      detail: input.detail ?? {},
    });
  if (error) {
    console.error("[admin] falha ao gravar auditoria:", error.code, error.message);
    return false;
  }
  return true;
}

export type AdminAuditRow = {
  id: string;
  action: AdminAuditAction;
  createdAt: string;
  detail: Record<string, unknown>;
};

/** Últimos eventos da trilha (para "Atividades recentes" e o histórico de preço). */
export async function listRecentAdminEvents(limit = 10, action?: AdminAuditAction): Promise<AdminAuditRow[]> {
  await requireAdmin();
  let query = createAdminClient()
    .from("admin_audit_events")
    .select("id, action, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (action) query = query.eq("action", action);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    action: r.action as AdminAuditAction,
    createdAt: r.created_at as string,
    detail: (r.detail ?? {}) as Record<string, unknown>,
  }));
}
