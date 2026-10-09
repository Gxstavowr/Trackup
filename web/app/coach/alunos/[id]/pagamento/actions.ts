"use server";

import { revalidatePath } from "next/cache";
import {
  createSubscription as createSubscriptionRecord,
  createNextPayment as createNextPaymentRecord,
  markPaymentAsPaid as markPaymentAsPaidRecord,
  computeNextDueDate,
  getSubscription,
  setSubscriptionCancelled,
  type SubscriptionPeriod,
} from "@/lib/repository";
import { actionErrorMessage } from "@/lib/action-errors";

export type PagamentoActionState = {
  error?: string;
  success?: boolean;
} | null;

function pathFor(clientId: string): string {
  return `/coach/alunos/${clientId}/pagamento`;
}

const VALID_PERIODS: SubscriptionPeriod[] = ["monthly", "quarterly", "semiannual", "annual"];

/**
 * `"150,00"` ou `"150.00"` → 15000 (centavos). Aceita vírgula OU ponto como separador
 * decimal (formato de texto livre, não `type="number"`, pra não forçar o formato americano
 * na UI de um app em português) — se tiver vírgula, trata pontos como separador de milhar e
 * a vírgula como decimal; senão, parseia direto. `null` se não der pra interpretar como um
 * valor positivo.
 */
function parseReaisToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Server Action do formulário "Criar assinatura". A UI pede o valor em REAIS — a conversão
 * pra `price_cents` acontece só aqui (nunca no client), pra não duplicar a lógica de
 * parse/arredondamento em dois lugares.
 */
export async function createSubscriptionAction(
  _prevState: PagamentoActionState,
  formData: FormData
): Promise<PagamentoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planName = String(formData.get("plan_name") || "").trim();
  const priceRaw = String(formData.get("price_reais") || "");
  const period = String(formData.get("period") || "");

  if (!clientId) {
    return { error: "Aluno inválido." };
  }
  if (!planName) {
    return { error: "Informe o nome do plano." };
  }
  if (!VALID_PERIODS.includes(period as SubscriptionPeriod)) {
    return { error: "Selecione a periodicidade do plano." };
  }

  const priceCents = parseReaisToCents(priceRaw);
  if (priceCents == null) {
    return { error: "Informe um valor válido para o plano (ex.: 249,00)." };
  }

  try {
    await createSubscriptionRecord(clientId, {
      plan_name: planName,
      price_cents: priceCents,
      period: period as SubscriptionPeriod,
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar a assinatura.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

/**
 * "Registrar próxima cobrança" — sem input de data na UI (decisão de UX, ver
 * `computeNextDueDate` em `lib/repository.ts`): calcula o vencimento automaticamente a
 * partir da periodicidade da assinatura + a `due_date` da cobrança mais recente (ou hoje, se
 * ainda não existe nenhuma). Form simples sem `useActionState`, mesmo padrão de
 * `publishWorkoutPlanAction`/`publishNutritionPlanAction` — não precisa de feedback de erro
 * dedicado na UI pra essa ação.
 */
export async function registerNextPaymentAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  if (!clientId) return;

  const subscription = await getSubscription(clientId);
  if (!subscription) return;

  const baseDate = subscription.payments[0]?.due_date;
  const dueDate = computeNextDueDate(subscription.period, baseDate);

  await createNextPaymentRecord(subscription.id, dueDate);
  revalidatePath(pathFor(clientId));
}

/**
 * "Marcar como pago". Form simples sem `useActionState`, mesmo padrão acima. O método é
 * opcional na UI (select) — vazio vira `'manual'`, o default de `markPaymentAsPaid`.
 */
export async function markPaymentAsPaidAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const paymentId = String(formData.get("paymentId") || "");
  const method = String(formData.get("method") || "").trim();
  if (!paymentId) return;

  await markPaymentAsPaidRecord(paymentId, { method: method || undefined });
  if (clientId) revalidatePath(pathFor(clientId));
}

/**
 * "Cancelar assinatura" / "Reativar assinatura" (`intent` = cancel | reactivate). A confirmação
 * acontece na tela (`SubscriptionStatusControl`); aqui só grava.
 */
export async function setSubscriptionStatusAction(
  _prevState: PagamentoActionState,
  formData: FormData
): Promise<PagamentoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const intent = String(formData.get("intent") || "");
  if (!clientId || (intent !== "cancel" && intent !== "reactivate")) {
    return { error: "Ação inválida." };
  }

  try {
    await setSubscriptionCancelled(clientId, intent === "cancel");
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível alterar a assinatura.") };
  }

  revalidatePath(pathFor(clientId));
  revalidatePath("/coach/financeiro");
  return { success: true };
}
