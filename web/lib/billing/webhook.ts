import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  appliesToCurrentSubscription,
  applyBillingEvent,
  normalizeDocument,
  normalizeEmail,
  resolveAccount,
  type BillingStatus,
  type SyncPayStatus,
} from "./state";
import { fetchSyncPaySubscription, syncPayCredentialsConfigured, type SyncPaySubscription } from "./syncpay";
import { readOpenSwitch, retryPendingSwitchCancellation } from "./method-switch";

/**
 * Processa um webhook da SyncPay (assinatura do COACH com o Trackly). Chamado pela rota
 * `app/api/webhooks/syncpay/[secret]/route.ts` depois de validar o segredo do path.
 *
 *  1. Registra o evento cru em `coach_billing_events` (idempotente: event + token + occurred_at).
 *     Entrega duplicada já processada = 200 sem reaplicar.
 *  2. Com SYNCPAY_CLIENT_ID/SECRET: busca a assinatura na API e confia NAQUELE status, não no corpo.
 *     Sem credenciais (dev): aplica o corpo e loga que não foi verificado.
 *  3. Casa com a conta: token já conhecido -> e-mail do coach -> CPF/CNPJ guardado. Sem conta = só
 *     registrado, não aplicado.
 *  4. Aplica a máquina de estados (`lib/billing/state.ts`) na linha de `coach_billing_subscriptions`.
 *  5. Troca de forma de pagamento: com a conta ativa, devolve `followUp` (a rota roda depois da
 *     resposta, via `after`) que cancela na SyncPay a assinatura antiga, se houver pedido de troca
 *     e a nova estiver confirmada ativa (`lib/billing/method-switch.ts`).
 */

export type WebhookResult = { status: number; body: Record<string, unknown>; followUp?: () => Promise<void> };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
function isoOrNull(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Escapa curingas do ILIKE pra comparação exata, sem diferenciar maiúsculas. */
function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function processSyncPayWebhook(payload: unknown): Promise<WebhookResult> {
  const body = asObj(payload);
  const event = str(body?.event);
  if (!body || !event || event.length > 64) return { status: 400, body: { error: "invalid_payload" } };

  const subscription = asObj(body.subscription);
  const subscriber = asObj(body.subscriber);
  const token = str(body.subscription_token) ?? str(subscription?.token);
  const occurredAt = isoOrNull(body.occurred_at);

  const admin = createAdminClient();

  // 1) Log + idempotência.
  const { data: inserted, error: insertError } = await admin
    .from("coach_billing_events")
    .upsert(
      { event, subscription_token: token, occurred_at: occurredAt, payload: body },
      { onConflict: "event,subscription_token,occurred_at", ignoreDuplicates: true }
    )
    .select("id");
  if (insertError) {
    console.error("[syncpay] falha ao registrar evento:", insertError.code, insertError.message);
    return { status: 500, body: { error: "store_failed" } };
  }

  let eventId = inserted?.[0]?.id as string | undefined;
  if (!eventId) {
    let q = admin.from("coach_billing_events").select("id, processed_at").eq("event", event);
    q = token ? q.eq("subscription_token", token) : q.is("subscription_token", null);
    q = occurredAt ? q.eq("occurred_at", occurredAt) : q.is("occurred_at", null);
    const { data: existing } = await q.maybeSingle();
    if (existing?.processed_at) return { status: 200, body: { ok: true, duplicate: true } };
    if (!existing) return { status: 500, body: { error: "store_failed" } };
    eventId = existing.id as string; // entrega anterior não terminou: reprocessa
  }

  // 2) Verificação pela API (quando há credenciais).
  let remote: SyncPaySubscription | null = null;
  const verified = syncPayCredentialsConfigured() && !!token;
  if (verified) {
    try {
      remote = await fetchSyncPaySubscription(token!);
    } catch (err) {
      console.error("[syncpay] não foi possível verificar a assinatura na API:", (err as Error).message);
      return { status: 503, body: { error: "verify_failed" } }; // SyncPay reenvia
    }
    if (!remote) {
      await admin.from("coach_billing_events").update({ verified: false }).eq("id", eventId);
      console.warn(`[syncpay] evento ${event} com token desconhecido na API — registrado, não aplicado.`);
      return { status: 200, body: { ok: true, applied: false } };
    }
  } else {
    console.warn(`[syncpay] webhook ${event} NÃO verificado (sem SYNCPAY_CLIENT_ID/SECRET): usando o corpo.`);
  }

  // 3) Casamento com a conta do coach.
  const email = normalizeEmail(remote?.subscriberEmail ?? body.subscriber_email ?? subscriber?.email);
  const document = normalizeDocument(remote?.subscriberDocument ?? subscriber?.document);

  let byToken: string | null = null;
  if (token) {
    const { data } = await admin
      .from("coach_billing_subscriptions")
      .select("account_id")
      .eq("syncpay_subscription_token", token)
      .maybeSingle();
    byToken = (data?.account_id as string | undefined) ?? null;
  }
  let byEmail: string[] = [];
  if (!byToken && email) {
    const { data } = await admin.from("coach_users").select("account_id").ilike("email", ilikeExact(email));
    byEmail = (data ?? []).map((r) => r.account_id as string);
  }
  let byDocument: string[] = [];
  if (!byToken && byEmail.length === 0 && document) {
    const { data } = await admin
      .from("coach_billing_subscriptions")
      .select("account_id")
      .eq("subscriber_document", document);
    byDocument = (data ?? []).map((r) => r.account_id as string);
  }
  const accountId = resolveAccount({ byToken, byEmail, byDocument });

  await admin.from("coach_billing_events").update({ account_id: accountId, verified }).eq("id", eventId);
  if (!accountId) {
    console.warn(`[syncpay] evento ${event} sem conta correspondente — registrado, não aplicado.`);
    return { status: 200, body: { ok: true, matched: false, applied: false } };
  }

  // 4) Máquina de estados.
  const { data: prevRow, error: prevError } = await admin
    .from("coach_billing_subscriptions")
    .select("status, payment_failed_at, confirmation_pending, next_charge_at, subscriber_email, subscriber_document, syncpay_subscription_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (prevError) {
    console.error("[syncpay] falha ao ler assinatura:", prevError.code, prevError.message);
    return { status: 500, body: { error: "read_failed" } };
  }

  const verifiedStatus: SyncPayStatus | null = remote?.status ?? null;
  const at = new Date(remote?.overdueSince ?? occurredAt ?? Date.now());
  const computed = applyBillingEvent(
    prevRow
      ? {
          status: prevRow.status as BillingStatus,
          paymentFailedAt: prevRow.payment_failed_at as string | null,
          confirmationPending: !!prevRow.confirmation_pending,
        }
      : null,
    event,
    Number.isNaN(at.getTime()) ? new Date() : at,
    verifiedStatus
  );
  const currentToken = (prevRow?.syncpay_subscription_token as string | null | undefined) ?? null;
  // Assinatura da qual o coach já trocou: nunca volta a ser a atual.
  const replaced =
    !!computed && !!token && !!currentToken && token !== currentToken && !!(await readOpenSwitch(accountId, token));
  const next =
    computed && appliesToCurrentSubscription(currentToken, token, computed.status, replaced) ? computed : null;
  if (computed && !next) {
    console.warn(`[syncpay] evento ${event} de uma assinatura que não é a atual da conta — registrado, não aplicado.`);
  }

  if (next) {
    const { error: upsertError } = await admin.from("coach_billing_subscriptions").upsert(
      {
        account_id: accountId,
        syncpay_subscription_token: token ?? prevRow?.syncpay_subscription_token ?? null,
        status: next.status,
        payment_failed_at: next.paymentFailedAt,
        confirmation_pending: next.confirmationPending,
        next_charge_at: isoOrNull(remote?.nextChargeAt ?? body.next_charge_at) ?? prevRow?.next_charge_at ?? null,
        subscriber_email: email ?? prevRow?.subscriber_email ?? null,
        subscriber_document: document ?? prevRow?.subscriber_document ?? null,
      },
      { onConflict: "account_id" }
    );
    if (upsertError) {
      console.error("[syncpay] falha ao aplicar estado:", upsertError.code, upsertError.message);
      return { status: 500, body: { error: "apply_failed" } };
    }
  }

  await admin.from("coach_billing_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId);
  const finalStatus = next?.status ?? prevRow?.status ?? null;
  return {
    status: 200,
    body: { ok: true, matched: true, applied: !!next, status: finalStatus },
    followUp:
      verified && finalStatus === "active" ? () => retryPendingSwitchCancellation(accountId) : undefined,
  };
}
