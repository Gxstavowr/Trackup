import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BILLING_PATH_HEADER } from "./path-header";
import { isBillingExemptRoute } from "./exempt-path";
import { safeCheckoutUrl, type BillingStatus } from "./state";

export type CoachBilling = {
  status: BillingStatus;
  paymentFailedAt: string | null;
  nextChargeAt: string | null;
  confirmationPending: boolean;
};

/**
 * Assinatura do coach logado (RLS: só a linha da própria conta). `null` = sem assinatura
 * registrada — comportamento de sempre, sem aviso nem bloqueio.
 */
export const getCoachBilling = cache(async (): Promise<CoachBilling | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_billing_subscriptions")
    .select("status, payment_failed_at, next_charge_at, confirmation_pending")
    .maybeSingle();
  if (error || !data) return null;
  return {
    status: data.status as BillingStatus,
    paymentFailedAt: data.payment_failed_at as string | null,
    nextChargeAt: data.next_charge_at as string | null,
    confirmationPending: !!data.confirmation_pending,
  };
});

/** Link do checkout hospedado da SyncPay (pagar / trocar forma de pagamento / reativar). */
export function coachCheckoutUrl(): string | null {
  return safeCheckoutUrl(process.env.SYNCPAY_COACH_CHECKOUT_URL);
}

export { SUSPENDED_PATH, PAYMENT_METHOD_PATH } from "./exempt-path";
export const SUBSCRIPTION_PATH = "/coach/configuracoes?secao=assinatura";

/**
 * Rotas do coach que continuam abertas com o plano suspenso (só para RENDERIZAR a página): a tela
 * de suspensão, a assinatura e a escolha da forma de pagamento. Regra pura em `exempt-path.ts`.
 * Requisição de Server Action (header `next-action`) nunca é liberada: nela o caminho repassado é o
 * da página de origem. O `proxy.ts` também só repassa o caminho em GET/HEAD.
 */
export async function isBillingExemptPath(): Promise<boolean> {
  const h = await headers();
  return isBillingExemptRoute({ path: h.get(BILLING_PATH_HEADER), isServerAction: h.has("next-action") });
}
