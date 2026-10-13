import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingStatus, SyncPayStatus } from "./state";
import {
  cancelSettled,
  deriveCurrentMethod,
  planSwitchTiming,
  shouldCancelOldSubscription,
  type CancelOutcome,
  type PaymentMethod,
  type SwitchTiming,
} from "./switch";
import {
  cancelSyncPaySubscription,
  fetchSyncPaySubscription,
  syncPayCredentialsConfigured,
  SYNCPAY_USER_TIMEOUT_MS,
} from "./syncpay";

/**
 * "Trocar forma de pagamento" — casca com I/O (regras em `lib/billing/switch.ts`).
 *
 * Nada de coluna nova: o pedido de troca e o cancelamento da assinatura antiga ficam no log
 * `coach_billing_events` (mesmo padrão do enroll de Pix), com nomes internos que a SyncPay nunca
 * manda:
 *  - `trackly_switch_request` (token = assinatura ANTIGA): o coach confirmou a troca. Payload:
 *    `to_method`, `from_method`, `old_next_charge_at`, `lost_days`, `new_token` (Pix: o token do
 *    enroll novo; cartão: null — o token chega pelo webhook, casado por e-mail/CPF).
 *  - `trackly_switch_cancel` (token = assinatura ANTIGA, `occurred_at` nulo => no máximo UMA linha
 *    por assinatura, pela chave de idempotência da tabela): trava + resultado do cancelamento.
 *    `processed_at` preenchido = resolvido; nulo = em andamento (ou travado, refeito depois de 2 min).
 *
 * A assinatura antiga só é cancelada DEPOIS que a nova está confirmada ativa pela API da SyncPay
 * (nunca deixa o coach sem assinatura ativa por ação nossa). O `assinatura_cancelada` que a
 * SyncPay manda pra assinatura antiga não mexe na conta (`appliesToCurrentSubscription`).
 */

export const SWITCH_REQUEST_EVENT = "trackly_switch_request";
export const SWITCH_CANCEL_EVENT = "trackly_switch_cancel";
const STALE_CLAIM_MS = 2 * 60 * 1000;

export type SwitchRequest = {
  fromToken: string;
  toMethod: PaymentMethod;
  newToken: string | null;
  requestedAt: string;
};

export type SwitchRow = {
  token: string | null;
  status: BillingStatus;
  nextChargeAt: string | null;
};

async function readSwitchRow(accountId: string): Promise<SwitchRow | null> {
  const { data, error } = await createAdminClient()
    .from("coach_billing_subscriptions")
    .select("syncpay_subscription_token, status, next_charge_at")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler assinatura (${error.code})`);
  if (!data) return null;
  return {
    token: (data.syncpay_subscription_token as string | null) ?? null,
    status: data.status as BillingStatus,
    nextChargeAt: (data.next_charge_at as string | null) ?? null,
  };
}

/** Forma de pagamento da assinatura atual (derivada do log daquele token). */
export async function readCurrentMethod(token: string | null): Promise<PaymentMethod | null> {
  if (!token) return null;
  const { data } = await createAdminClient()
    .from("coach_billing_events")
    .select("event, payload")
    .eq("subscription_token", token)
    .order("received_at", { ascending: false })
    .limit(50);
  return deriveCurrentMethod({
    token,
    events: (data ?? []).map((r) => ({ event: r.event as string, payload: r.payload })),
    pixPlanToken: process.env.SYNCPAY_PIX_PLAN_TOKEN,
  });
}

function toRequest(row: { subscription_token: unknown; payload: unknown; received_at: unknown }): SwitchRequest | null {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  const to = p.to_method === "pix_automatico" || p.to_method === "credit_card" ? p.to_method : null;
  if (!to || typeof row.subscription_token !== "string") return null;
  return {
    fromToken: row.subscription_token,
    toMethod: to,
    newToken: typeof p.new_token === "string" && p.new_token ? p.new_token : null,
    requestedAt: String(row.received_at),
  };
}

/** Pedido de troca mais recente saindo da assinatura `fromToken`, ou null. */
export async function readOpenSwitch(accountId: string, fromToken: string | null): Promise<SwitchRequest | null> {
  if (!fromToken) return null;
  const { data } = await createAdminClient()
    .from("coach_billing_events")
    .select("subscription_token, payload, received_at")
    .eq("event", SWITCH_REQUEST_EVENT)
    .eq("account_id", accountId)
    .eq("subscription_token", fromToken)
    .order("received_at", { ascending: false })
    .limit(1);
  return data?.[0] ? toRequest(data[0]) : null;
}

export async function recordSwitchRequest(
  accountId: string,
  fromToken: string,
  payload: {
    to_method: PaymentMethod;
    from_method: PaymentMethod | null;
    old_next_charge_at: string | null;
    lost_days: number | null;
    new_token: string | null;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("coach_billing_events").insert({
    event: SWITCH_REQUEST_EVENT,
    subscription_token: fromToken,
    occurred_at: now,
    payload,
    account_id: accountId,
    verified: true,
    processed_at: now,
  });
  if (error) throw new Error(`Falha ao registrar a troca (${error.code})`);
}

export type SwitchContext = {
  row: SwitchRow | null;
  currentMethod: PaymentMethod | null;
  openSwitch: SwitchRequest | null;
};

export async function readSwitchContext(accountId: string): Promise<SwitchContext> {
  const row = await readSwitchRow(accountId);
  const [currentMethod, openSwitch] = await Promise.all([
    readCurrentMethod(row?.token ?? null),
    readOpenSwitch(accountId, row?.token ?? null),
  ]);
  return { row, currentMethod, openSwitch };
}

/**
 * Janela/datas da troca. Com credenciais, usa o que a SyncPay diz da assinatura atual (status,
 * vencimento, `billing_advance_days`, cobrança pendente); sem, só a linha local.
 */
export async function computeSwitchTiming(row: SwitchRow, now = new Date(), useApi = true): Promise<SwitchTiming> {
  let status: BillingStatus = row.status;
  let nextChargeAt = row.nextChargeAt;
  let advanceDays: number | null = null;
  let periodicityDays: number | null = null;
  let pendingChargeExists = false;
  if (useApi && row.token && syncPayCredentialsConfigured()) {
    const remote = await fetchSyncPaySubscription(row.token, SYNCPAY_USER_TIMEOUT_MS);
    if (remote) {
      // Só "active"/"overdue" importam aqui; o resto cai em `unavailable`.
      status = remote.status;
      nextChargeAt = remote.nextChargeAt ?? nextChargeAt;
      advanceDays = remote.advanceDays;
      periodicityDays = remote.periodicityDays;
      pendingChargeExists = remote.status === "active" && remote.pendingChargeExists;
    }
  }
  return planSwitchTiming({ status, nextChargeAt, now, advanceDays, periodicityDays, pendingChargeExists });
}

type CancelClaim = { id: string } | null;

/** Trava o cancelamento da assinatura antiga (uma linha por token). `null` = outro já cuida/cuidou. */
async function claimCancel(accountId: string, oldToken: string, newToken: string): Promise<CancelClaim> {
  const admin = createAdminClient();
  const { data: inserted, error } = await admin
    .from("coach_billing_events")
    .upsert(
      {
        event: SWITCH_CANCEL_EVENT,
        subscription_token: oldToken,
        occurred_at: null,
        payload: { new_token: newToken, outcome: "pending" },
        account_id: accountId,
        verified: true,
      },
      { onConflict: "event,subscription_token,occurred_at", ignoreDuplicates: true }
    )
    .select("id");
  if (error) throw new Error(`Falha ao travar o cancelamento (${error.code})`);
  if (inserted?.[0]?.id) return { id: inserted[0].id as string };

  const { data: existing } = await admin
    .from("coach_billing_events")
    .select("id, processed_at, received_at")
    .eq("event", SWITCH_CANCEL_EVENT)
    .eq("subscription_token", oldToken)
    .is("occurred_at", null)
    .maybeSingle();
  if (!existing || existing.processed_at) return null;
  // Trava antiga sem resultado (processo morreu no meio): assume de novo.
  if (Date.now() - new Date(existing.received_at as string).getTime() < STALE_CLAIM_MS) return null;
  const { data: retaken } = await admin
    .from("coach_billing_events")
    .update({ received_at: new Date().toISOString() })
    .eq("id", existing.id)
    .eq("received_at", existing.received_at)
    .is("processed_at", null)
    .select("id");
  return retaken?.[0]?.id ? { id: retaken[0].id as string } : null;
}

async function alreadyCancelled(oldToken: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("coach_billing_events")
    .select("processed_at")
    .eq("event", SWITCH_CANCEL_EVENT)
    .eq("subscription_token", oldToken)
    .is("occurred_at", null)
    .maybeSingle();
  return !!data?.processed_at;
}

export type FinalizeResult = "no_switch" | "not_confirmed" | "already_done" | "busy" | "cancelled" | "retry_later";

/**
 * Cancela na SyncPay a assinatura ANTIGA (`oldToken`) de uma troca, se a nova (`newToken`) está
 * confirmada ativa. Idempotente e seguro de chamar várias vezes (webhook, tela, retentativa).
 */
export async function finalizeMethodSwitch(
  accountId: string,
  oldToken: string,
  newToken: string,
  newStatusVerified?: SyncPayStatus | null
): Promise<FinalizeResult> {
  if (!syncPayCredentialsConfigured()) return "not_confirmed";
  // Nunca cancela a assinatura que a conta usa agora: a nova precisa já ter sido adotada.
  const row = await readSwitchRow(accountId);
  if (!row?.token || row.token === oldToken || row.token !== newToken) return "not_confirmed";
  const request = await readOpenSwitch(accountId, oldToken);
  if (!request) return "no_switch";
  if (await alreadyCancelled(oldToken)) return "already_done";

  let verified = newStatusVerified ?? null;
  if (verified !== "active") {
    const remote = await fetchSyncPaySubscription(newToken, SYNCPAY_USER_TIMEOUT_MS);
    verified = remote?.status ?? null;
  }
  if (
    !shouldCancelOldSubscription({
      switchFromToken: request.fromToken,
      oldToken,
      newToken,
      newStatusVerified: verified,
      alreadyCancelled: false,
    })
  ) {
    return "not_confirmed";
  }

  const claim = await claimCancel(accountId, oldToken, newToken);
  if (!claim) return (await alreadyCancelled(oldToken)) ? "already_done" : "busy";

  const admin = createAdminClient();
  let outcome: CancelOutcome = "error";
  let oldStatusAfter: SyncPayStatus | null = null;
  try {
    outcome = await cancelSyncPaySubscription(
      oldToken,
      "Coach trocou a forma de pagamento no Trackly; a nova assinatura já está ativa."
    );
    if (outcome === "rejected" || outcome === "error") {
      oldStatusAfter = (await fetchSyncPaySubscription(oldToken, SYNCPAY_USER_TIMEOUT_MS))?.status ?? null;
    }
  } catch (err) {
    console.error("[syncpay] cancelamento da assinatura antiga falhou:", (err as Error).message);
  }

  if (cancelSettled(outcome, oldStatusAfter)) {
    await admin
      .from("coach_billing_events")
      .update({
        payload: { new_token: newToken, outcome: oldStatusAfter === "cancelled" ? "already_cancelled" : outcome },
        processed_at: new Date().toISOString(),
      })
      .eq("id", claim.id);
    return "cancelled";
  }
  // Solta a trava pra próxima tentativa (webhook seguinte, tela da assinatura).
  await admin.from("coach_billing_events").delete().eq("id", claim.id).is("processed_at", null);
  console.warn(`[syncpay] assinatura antiga não cancelada agora (${outcome}); nova tentativa depois.`);
  return "retry_later";
}

/**
 * Retentativa: para cada pedido de troca da conta saindo de uma assinatura que NÃO é mais a
 * atual, cancela a antiga se ainda não foi (a atual precisa estar ativa na API).
 */
export async function retryPendingSwitchCancellation(accountId: string): Promise<void> {
  if (!syncPayCredentialsConfigured()) return;
  const row = await readSwitchRow(accountId);
  if (!row?.token || row.status !== "active") return;
  const { data } = await createAdminClient()
    .from("coach_billing_events")
    .select("subscription_token")
    .eq("event", SWITCH_REQUEST_EVENT)
    .eq("account_id", accountId)
    .neq("subscription_token", row.token)
    .order("received_at", { ascending: false })
    .limit(10);
  const olds = [...new Set((data ?? []).map((r) => r.subscription_token as string).filter(Boolean))];
  for (const oldToken of olds) {
    try {
      await finalizeMethodSwitch(accountId, oldToken, row.token);
    } catch (err) {
      console.error("[syncpay] retentativa de cancelamento falhou:", (err as Error).message);
    }
  }
}

/**
 * O coach desistiu de uma troca pra Pix que ainda não foi paga (e escolheu outra coisa): cancela
 * a inscrição NOVA pendente na SyncPay pra ela não começar a cobrar depois. Só se ainda estiver
 * `pending_first_payment` — nunca uma assinatura ativa.
 */
export async function abandonPendingSwitch(newToken: string): Promise<void> {
  if (!syncPayCredentialsConfigured()) return;
  try {
    const remote = await fetchSyncPaySubscription(newToken, SYNCPAY_USER_TIMEOUT_MS);
    if (remote?.status !== "pending_first_payment") return;
    await cancelSyncPaySubscription(newToken, "Coach escolheu outra forma de pagamento no Trackly antes de concluir esta.");
  } catch (err) {
    console.warn("[syncpay] não foi possível cancelar a inscrição pendente:", (err as Error).message);
  }
}
