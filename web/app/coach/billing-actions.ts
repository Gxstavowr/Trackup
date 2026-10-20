"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCurrentCoachDemo } from "@/lib/demo";

/**
 * "Pagamento confirmado" já foi mostrado: limpa `confirmation_pending` da assinatura da conta do
 * coach logado. A tabela não aceita escrita pelo cliente (0021), então a escrita é pela service
 * role — mas só na conta resolvida a partir da sessão, nunca de um id vindo do navegador.
 */
export async function acknowledgePaymentConfirmation(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: coach } = await supabase.from("coach_users").select("account_id").eq("id", user.id).maybeSingle();
  if (!coach?.account_id) return;

  const { error } = await createAdminClient()
    .from("coach_billing_subscriptions")
    .update({ confirmation_pending: false })
    .eq("account_id", coach.account_id)
    .eq("confirmation_pending", true);
  if (error) console.error("Falha ao limpar confirmação de pagamento:", error.message);
}

/** Mensagem única para qualquer tentativa de cobrança/troca de método numa conta demo. */
export type DemoBillingGuard = { blocked: true; message: string } | { blocked: false };

/**
 * Guarda do laboratório (item 28 do TODO V5): conta demo (`accounts.is_demo`, 0023) NUNCA inicia
 * cobrança real nem troca de forma de pagamento na SyncPay — a resposta é "simulado em demonstração".
 * Lida no servidor a partir da sessão (nunca de um parâmetro do navegador). Sem a coluna (0023 ainda
 * não aplicada) toda conta é tratada como real e nada muda. Quem inicia cobrança chama isto ANTES de
 * falar com a SyncPay (`assinatura/actions.ts`: Pix Automático, troca de método e link do cartão).
 */
export async function demoBillingGuard(): Promise<DemoBillingGuard> {
  if (await isCurrentCoachDemo()) {
    return {
      blocked: true,
      message: "Cobrança simulada em demonstração: nesta conta demo nenhuma cobrança real é iniciada.",
    };
  }
  return { blocked: false };
}
