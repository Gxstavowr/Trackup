"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { recordAdminEvent } from "@/lib/admin/audit";
import { insertPlatformPrice } from "@/lib/admin/billing";
import { parseDateOnly, parseReaisToCents } from "../_lib/logic";

export type PriceFormState = { error?: string; success?: string } | null;

/**
 * Cadastra um novo preço da mensalidade do Trackly (`platform_plan_prices`) e registra em
 * `admin_audit_events`. `requireAdmin()` aqui também: uma Server Action é um endpoint POST público
 * e o guard do layout não a protege. Tudo vem do FormData e é revalidado no servidor.
 */
export async function setPlatformPriceAction(_prev: PriceFormState, formData: FormData): Promise<PriceFormState> {
  await requireAdmin();

  const amountCents = parseReaisToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) return { error: "Informe um valor válido em reais (ex.: 149,90)." };

  const effectiveFrom = parseDateOnly(String(formData.get("effective_from") ?? ""));
  if (!effectiveFrom) return { error: "Informe a data de início da vigência." };

  const noteRaw = String(formData.get("note") ?? "").trim();
  if (noteRaw.length > 300) return { error: "A observação pode ter no máximo 300 caracteres." };
  const note = noteRaw || null;

  const result = await insertPlatformPrice({ amountCents, effectiveFrom, note });
  if (!result.ok) {
    return {
      error:
        result.code === "duplicate"
          ? "Já existe um preço com essa data de vigência. Escolha outra data."
          : "Não foi possível salvar o preço agora. Nada foi alterado.",
    };
  }

  const audited = await recordAdminEvent({
    action: "platform_price_set",
    detail: { price_id: result.id, amount_cents: amountCents, effective_from: effectiveFrom },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/preco");
  return {
    success: audited
      ? "Preço registrado."
      : "Preço registrado, mas a trilha de auditoria falhou. Verifique os logs do servidor.",
  };
}
