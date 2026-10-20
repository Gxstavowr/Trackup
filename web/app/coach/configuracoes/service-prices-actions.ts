"use server";

import { revalidatePath } from "next/cache";
import { requireActiveCoach } from "../require-coach";
import { isPackageId } from "@/lib/onboarding/packages";
import { isBillingPeriod, parsePriceToCents, upsertCoachServicePrice } from "@/lib/onboarding/prices";

export type ServicePriceState = { ok?: string; error?: string } | null;

/** Salva o preço padrão de UM pacote. Não toca em contratos de alunos já criados. */
export async function saveServicePriceAction(
  _prev: ServicePriceState,
  formData: FormData
): Promise<ServicePriceState> {
  await requireActiveCoach();
  const pkg = String(formData.get("package") ?? "");
  const period = String(formData.get("period") ?? "");
  const cents = parsePriceToCents(String(formData.get("price") ?? ""));
  if (!isPackageId(pkg)) return { error: "Pacote inválido." };
  if (!isBillingPeriod(period)) return { error: "Escolha o período de cobrança." };
  if (cents === null) return { error: "Informe um valor válido, como 250,00." };

  const res = await upsertCoachServicePrice({ package: pkg, priceCents: cents, billingPeriod: period });
  if (!res.ok) return { error: res.error };
  revalidatePath("/coach/configuracoes");
  return { ok: "Preço padrão salvo. Alunos já contratados não mudam." };
}
