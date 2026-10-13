"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
