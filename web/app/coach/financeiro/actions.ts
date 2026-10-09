"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { requireCoach } from "../require-coach";

export type MarkPaidState = { error?: string; success?: boolean } | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OwnedPayment = {
  id: string;
  status: string;
  subscriptions:
    | { client_id: string; clients: { account_id: string } | { account_id: string }[] }
    | { client_id: string; clients: { account_id: string } | { account_id: string }[] }[];
};

function first<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * "Marcar como pago" a partir do Financeiro (`/coach/financeiro`) — fluxo manual: o coach
 * confirma que recebeu; nada de gateway.
 *
 * Por que uma action própria em vez de reaproveitar `markPaymentAsPaidAction` da aba
 * Pagamento do aluno: aquela grava `paid_date` com `new Date().toISOString()` (data em UTC —
 * depois das 21h em São Paulo cairia no dia seguinte), não confere se a atualização atingiu
 * alguma linha e não devolve feedback. Aqui:
 *   1. sessão + role: `requireCoach()` (sem sessão -> /login; aluno -> /portal);
 *   2. posse: o pagamento é lido pelo client autenticado (RLS) e a conta do cliente dono é
 *      comparada explicitamente com a conta do coach — defesa em profundidade além da RLS;
 *   3. só `pending`/`overdue` viram pagos, e o UPDATE repete esse filtro (duplo clique ou
 *      duas abas não pagam duas vezes) e confere que uma linha foi mesmo atualizada;
 *   4. `paid_date` = hoje em America/Sao_Paulo; `method` = `manual` (mesmo default do repositório);
 *   5. trilha em `payment_events` (best-effort, como no repositório).
 */
export async function markPaymentPaidAction(
  _prev: MarkPaidState,
  formData: FormData
): Promise<MarkPaidState> {
  await requireCoach();

  const paymentId = String(formData.get("paymentId") || "");
  if (!UUID_RE.test(paymentId)) {
    return { error: "Pagamento inválido." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada. Entre novamente." };

  const { data: coach } = await supabase
    .from("coach_users")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach) return { error: "Sem permissão para registrar pagamentos." };

  const { data: found, error: findError } = await supabase
    .from("payments")
    .select("id, status, subscriptions!inner(client_id, clients!inner(account_id))")
    .eq("id", paymentId)
    .maybeSingle();

  if (findError) return { error: "Não foi possível localizar o pagamento. Tente de novo." };
  // RLS devolve null tanto se o id não existe quanto se é de outra conta — mesma resposta.
  if (!found) return { error: "Pagamento não encontrado." };

  const payment = found as unknown as OwnedPayment;
  const subscription = first(payment.subscriptions);
  const owner = first(subscription.clients);
  if (owner.account_id !== (coach as { account_id: string }).account_id) {
    return { error: "Pagamento não encontrado." };
  }

  if (payment.status !== "pending" && payment.status !== "overdue") {
    return { error: "Este pagamento já foi registrado ou não está em aberto." };
  }

  const { data: updated, error: updateError } = await supabase
    .from("payments")
    .update({ status: "paid", paid_date: todayInSaoPaulo(), method: "manual" })
    .eq("id", paymentId)
    .in("status", ["pending", "overdue"])
    .select("id");

  if (updateError) return { error: "Não foi possível registrar o pagamento. Tente de novo." };
  if (!updated || updated.length === 0) {
    return { error: "Este pagamento já foi registrado ou não está em aberto." };
  }

  const { error: eventError } = await supabase.from("payment_events").insert({
    payment_id: paymentId,
    type: "charged",
    detail: "Pagamento registrado manualmente pelo coach (Financeiro).",
  });
  if (eventError) {
    // Só trilha de auditoria: não desfaz nem esconde um pagamento que já foi registrado.
    console.error("Financeiro: pagamento pago, mas o evento de auditoria falhou:", eventError.message);
  }

  revalidatePath("/coach/financeiro");
  revalidatePath("/coach/alunos");
  revalidatePath(`/coach/alunos/${subscription.client_id}/pagamento`);
  return { success: true };
}
