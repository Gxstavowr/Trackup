import "server-only";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decidePixEnroll, isMandateStatus, mandateStatusFromEvent, mergeMandateStatus, statusAfterEnroll, type MandateStatus, type PixMandate } from "./enroll";
import type { BillingStatus } from "./state";
import { finalizeMethodSwitch, readOpenSwitch, recordSwitchRequest } from "./method-switch";
import type { PaymentMethod } from "./switch";
import {
  enrollPixAutomatico,
  fetchSyncPaySubscription,
  syncPayCredentialsConfigured,
  SYNCPAY_USER_TIMEOUT_MS,
} from "./syncpay";

/**
 * Pix Automático do coach (tela `/coach/assinatura`): inscrição no plano de Pix Automático da
 * SyncPay, QR de autorização e acompanhamento até o mandato/assinatura ficar ativo.
 *
 * A tabela de assinatura (0021) guarda só token/status; o que é do MANDATO (QR de autorização,
 * status CREATED/ACTIVE/CANCELLED) fica no log `coach_billing_events`, junto dos webhooks
 * `mandato_ativado`/`mandato_cancelado`:
 *  - `trackly_pix_enroll`: resposta do enroll feito pelo Trackly (sem CPF/nome/e-mail);
 *  - `trackly_pix_mandate`: mandato visto depois numa consulta à SyncPay (ex.: QR que veio nulo).
 * Esses dois nomes são internos (a SyncPay nunca manda), então não colidem com a idempotência
 * dos webhooks. Tudo pela service role, sempre na conta resolvida pela sessão.
 */

export const PIX_ENROLL_EVENT = "trackly_pix_enroll";
export const PIX_MANDATE_EVENT = "trackly_pix_mandate";
const MANDATE_EVENTS = [PIX_ENROLL_EVENT, PIX_MANDATE_EVENT, "mandato_ativado", "mandato_cancelado"];

export type CoachIdentity = { accountId: string; name: string; email: string };

/** Coach logado (sessão + coach_users). `null` = sem sessão ou não é coach. */
export async function getCoachIdentity(): Promise<CoachIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: coach } = await supabase
    .from("coach_users")
    .select("account_id, name, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!coach?.account_id) return null;
  return {
    accountId: coach.account_id as string,
    name: (coach.name as string | null) ?? "",
    email: (user.email ?? (coach.email as string | null) ?? "").trim().toLowerCase(),
  };
}

export type BillingRow = {
  token: string | null;
  status: BillingStatus;
  document: string | null;
};

export async function readBillingRow(accountId: string): Promise<BillingRow | null> {
  const { data, error } = await createAdminClient()
    .from("coach_billing_subscriptions")
    .select("syncpay_subscription_token, status, subscriber_document")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler assinatura (${error.code})`);
  if (!data) return null;
  return {
    token: (data.syncpay_subscription_token as string | null) ?? null,
    status: data.status as BillingStatus,
    document: (data.subscriber_document as string | null) ?? null,
  };
}

/**
 * Guarda o CPF/CNPJ (só dígitos) na assinatura da conta. Sem linha ainda: cria com status
 * `none` — que não gera aviso nem bloqueio (igual a não ter linha).
 */
export async function saveBillingDocument(identity: CoachIdentity, document: string): Promise<void> {
  const admin = createAdminClient();
  const row = await readBillingRow(identity.accountId);
  const { error } = row
    ? await admin
        .from("coach_billing_subscriptions")
        .update({ subscriber_document: document })
        .eq("account_id", identity.accountId)
    : await admin.from("coach_billing_subscriptions").insert({
        account_id: identity.accountId,
        status: "none",
        subscriber_document: document,
        subscriber_email: identity.email || null,
      });
  if (error) throw new Error(`Falha ao salvar documento (${error.code})`);
}

type PixRecord = { ours: boolean; qrCode: string | null; mandateStatus: MandateStatus | null };

/** Mandato atual a partir do log (enroll do Trackly + webhooks de mandato + consultas). */
async function readPixRecord(token: string): Promise<PixRecord> {
  const { data } = await createAdminClient()
    .from("coach_billing_events")
    .select("event, payload, received_at")
    .eq("subscription_token", token)
    .in("event", MANDATE_EVENTS)
    .order("received_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];
  const record: PixRecord = { ours: rows.some((r) => r.event === PIX_ENROLL_EVENT), qrCode: null, mandateStatus: null };
  for (const r of rows) {
    const payment = (r.payload as { payment?: { qr_code?: unknown; mandate_status?: unknown } } | null)?.payment;
    if (!record.qrCode && typeof payment?.qr_code === "string" && payment.qr_code) record.qrCode = payment.qr_code;
    const seen =
      r.event === PIX_ENROLL_EVENT || r.event === PIX_MANDATE_EVENT
        ? isMandateStatus(payment?.mandate_status)
          ? payment.mandate_status
          : null
        : mandateStatusFromEvent(r.event as string, r.payload);
    record.mandateStatus = mergeMandateStatus(record.mandateStatus, seen);
  }
  return record;
}

async function logMandate(accountId: string, token: string, event: string, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await createAdminClient().from("coach_billing_events").insert({
    event,
    subscription_token: token,
    occurred_at: now,
    payload,
    account_id: accountId,
    verified: true,
    processed_at: now,
  });
  if (error) console.error("[syncpay] falha ao registrar mandato:", error.code, error.message);
}

export type PixView =
  | { kind: "error"; message: string }
  | { kind: "active" }
  | {
      kind: "pending";
      /** `src` de <img> (data: URL gerado aqui a partir do EMV, ou URL https da SyncPay). */
      qrImage: string | null;
      /** Pix copia e cola (quando o QR é um código EMV). */
      copyCode: string | null;
      mandateStatus: MandateStatus | null;
      subscriptionStatus: BillingStatus;
      /** Troca de forma de pagamento: a assinatura antiga é cancelada quando esta ficar ativa. */
      switching?: boolean;
    };

/** QR em imagem: EMV vira PNG local (data URL); URL https da SyncPay é usada direto. */
async function qrToView(qr: string | null): Promise<{ qrImage: string | null; copyCode: string | null }> {
  if (!qr) return { qrImage: null, copyCode: null };
  if (/^https:\/\//i.test(qr) || /^data:image\//i.test(qr)) return { qrImage: qr, copyCode: null };
  try {
    const qrImage = await QRCode.toDataURL(qr, { errorCorrectionLevel: "M", margin: 2, width: 320 });
    return { qrImage, copyCode: qr };
  } catch {
    return { qrImage: null, copyCode: qr };
  }
}

async function buildView(status: BillingStatus, record: PixRecord, switching = false): Promise<PixView> {
  if (status === "active") return { kind: "active" };
  return {
    kind: "pending",
    ...(await qrToView(record.qrCode)),
    mandateStatus: record.mandateStatus,
    subscriptionStatus: status,
    ...(switching ? { switching: true } : {}),
  };
}

/**
 * Token do Pix Automático de uma TROCA em andamento (pedido de troca saindo da assinatura atual
 * pra Pix, com enroll feito e ainda não adotado), ou null.
 */
async function pendingPixSwitchToken(accountId: string, currentToken: string | null): Promise<string | null> {
  const open = await readOpenSwitch(accountId, currentToken);
  return open?.toMethod === "pix_automatico" && open.newToken && open.newToken !== currentToken ? open.newToken : null;
}

/** Estado do Pix Automático já iniciado (pra reabrir a tela no meio do fluxo), ou null. */
export async function currentPixView(accountId: string): Promise<PixView | null> {
  const row = await readBillingRow(accountId);
  if (!row?.token) return null;
  const switchToken = await pendingPixSwitchToken(accountId, row.token);
  if (switchToken) return buildView("pending_first_payment", await readPixRecord(switchToken), true);
  const record = await readPixRecord(row.token);
  if (!record.ours || row.status === "active") return null;
  if (row.status === "suspended" || row.status === "cancelled") return null;
  return buildView(row.status, record);
}

/** Inscreve no Pix Automático — ou reaproveita a inscrição existente (nunca inscreve duas vezes). */
export async function startPixAutomatico(identity: CoachIdentity, phone: string | null): Promise<PixView> {
  const row = await readBillingRow(identity.accountId);
  if (!row?.document) return { kind: "error", message: "Confirme seu CPF antes de continuar." };

  const record = row.token ? await readPixRecord(row.token) : null;
  const decision = decidePixEnroll({
    status: row.status,
    token: row.token,
    tokenIsOurPixEnroll: !!record?.ours,
    mandateStatus: record?.mandateStatus ?? null,
  });
  if (decision === "already_active") return { kind: "active" };
  if (decision === "reuse" && record) return buildView(row.status, record);

  if (!identity.name.trim() || !identity.email) {
    return { kind: "error", message: "Complete seu nome no Perfil profissional antes de assinar." };
  }

  let result;
  try {
    result = await enrollPixAutomatico({ name: identity.name.trim(), email: identity.email, document: row.document, phone });
  } catch (err) {
    console.error("[syncpay] enroll Pix Automático falhou:", (err as Error).message);
    return { kind: "error", message: "Não conseguimos falar com a SyncPay agora. Tente de novo em alguns minutos." };
  }
  if (!result.ok) return { kind: "error", message: result.message };

  const status = statusAfterEnroll(row.status, result.status);
  const { error } = await createAdminClient()
    .from("coach_billing_subscriptions")
    .update({
      syncpay_subscription_token: result.subscriptionToken,
      status,
      subscriber_email: identity.email,
      subscriber_document: row.document,
    })
    .eq("account_id", identity.accountId);
  if (error) {
    // A assinatura existe na SyncPay; o webhook ainda casa pela conta via e-mail/CPF.
    console.error("[syncpay] enroll feito, mas falhou ao salvar o token:", error.code, error.message);
  }
  const payment = {
    mandate_id: result.mandate.mandateId,
    qr_code: result.mandate.qrCode,
    mandate_status: result.mandate.mandateStatus,
  };
  await logMandate(identity.accountId, result.subscriptionToken, PIX_ENROLL_EVENT, {
    billing_method: result.billingMethod,
    status: result.status,
    payment,
  });
  return buildView(status, { ours: true, qrCode: payment.qr_code, mandateStatus: payment.mandate_status });
}

/**
 * Consulta de acompanhamento (a tela chama a cada poucos segundos, com limite): status da
 * assinatura na SyncPay + mandato no log. Assinatura ativa na API = já libera a conta (o webhook
 * confirma depois, idempotente).
 */
export async function pollPixAutomatico(identity: CoachIdentity): Promise<PixView> {
  const row = await readBillingRow(identity.accountId);
  if (!row?.token) return { kind: "error", message: "Nenhuma inscrição de Pix Automático em andamento." };
  // Troca em andamento: acompanha a assinatura NOVA; a atual continua valendo até ela ficar ativa.
  const switchToken = await pendingPixSwitchToken(identity.accountId, row.token);
  if (!switchToken && row.status === "active") return { kind: "active" };

  const target = switchToken ?? row.token;
  const record = await readPixRecord(target);
  let status: BillingStatus = switchToken ? "pending_first_payment" : row.status;

  if (syncPayCredentialsConfigured()) {
    try {
      const remote = await fetchSyncPaySubscription(target, SYNCPAY_USER_TIMEOUT_MS);
      if (remote?.status === "active" && switchToken) {
        // A nova está confirmada ativa pela API: vira a assinatura da conta e só ENTÃO a antiga é
        // cancelada na SyncPay (idempotente; o webhook faz o mesmo se chegar antes).
        const { data: adopted, error } = await createAdminClient()
          .from("coach_billing_subscriptions")
          .update({
            syncpay_subscription_token: switchToken,
            status: "active",
            payment_failed_at: null,
            confirmation_pending: false,
            next_charge_at: remote.nextChargeAt,
          })
          .eq("account_id", identity.accountId)
          .eq("syncpay_subscription_token", row.token)
          .select("account_id");
        if (!error && adopted?.length) {
          status = "active";
          try {
            await finalizeMethodSwitch(identity.accountId, row.token, switchToken, "active");
          } catch (err) {
            console.error("[syncpay] cancelamento da assinatura antiga falhou:", (err as Error).message);
          }
        }
      } else if (remote?.status === "active") {
        const { error } = await createAdminClient()
          .from("coach_billing_subscriptions")
          .update({
            status: "active",
            payment_failed_at: null,
            // A própria tela mostra o sucesso; não precisa do aviso "Pagamento confirmado".
            confirmation_pending: false,
            next_charge_at: remote.nextChargeAt,
          })
          .eq("account_id", identity.accountId)
          .eq("syncpay_subscription_token", row.token);
        if (!error) status = "active";
      }
      const m: Partial<PixMandate> | null = remote?.mandate ?? null;
      const newQr = m?.qrCode && m.qrCode !== record.qrCode ? m.qrCode : null;
      const merged = mergeMandateStatus(record.mandateStatus, m?.mandateStatus ?? null);
      const newStatus = merged !== record.mandateStatus ? merged : null;
      if (newQr || newStatus) {
        if (newQr) record.qrCode = newQr;
        if (newStatus) record.mandateStatus = newStatus;
        await logMandate(identity.accountId, target, PIX_MANDATE_EVENT, {
          payment: { mandate_id: m?.mandateId ?? null, qr_code: record.qrCode, mandate_status: record.mandateStatus },
        });
      }
    } catch (err) {
      // Falha momentânea na consulta: devolve o que já sabemos e a tela tenta de novo.
      console.warn("[syncpay] consulta da assinatura falhou:", (err as Error).message);
    }
  }

  return buildView(status, record, !!switchToken);
}

/**
 * Troca PRA Pix Automático (a assinatura atual continua valendo): inscreve no plano de Pix — ou
 * reaproveita a inscrição da troca já iniciada — sem mexer no token/status da conta. O token novo
 * é adotado quando ficar ativo (consulta da tela ou webhook) e só aí a antiga é cancelada. A
 * janela/datas já foram conferidas pela ação.
 */
export async function startPixSwitch(
  identity: CoachIdentity,
  phone: string | null,
  meta: { fromMethod: PaymentMethod | null; oldNextChargeAt: string | null; lostDays: number | null }
): Promise<PixView> {
  const row = await readBillingRow(identity.accountId);
  if (!row?.token) return { kind: "error", message: "Nenhuma assinatura para trocar." };
  if (!row.document) return { kind: "error", message: "Confirme seu CPF antes de continuar." };

  const existing = await pendingPixSwitchToken(identity.accountId, row.token);
  if (existing) {
    const record = await readPixRecord(existing);
    if (record.mandateStatus !== "CANCELLED") return buildView("pending_first_payment", record, true);
  }

  if (!identity.name.trim() || !identity.email) {
    return { kind: "error", message: "Complete seu nome no Perfil profissional antes de trocar." };
  }
  let result;
  try {
    result = await enrollPixAutomatico({ name: identity.name.trim(), email: identity.email, document: row.document, phone });
  } catch (err) {
    console.error("[syncpay] enroll Pix Automático (troca) falhou:", (err as Error).message);
    return { kind: "error", message: "Não conseguimos falar com a SyncPay agora. Tente de novo em alguns minutos." };
  }
  if (!result.ok) return { kind: "error", message: result.message };

  const payment = {
    mandate_id: result.mandate.mandateId,
    qr_code: result.mandate.qrCode,
    mandate_status: result.mandate.mandateStatus,
  };
  await logMandate(identity.accountId, result.subscriptionToken, PIX_ENROLL_EVENT, {
    billing_method: result.billingMethod,
    status: result.status,
    payment,
  });
  await recordSwitchRequest(identity.accountId, row.token, {
    to_method: "pix_automatico",
    from_method: meta.fromMethod,
    old_next_charge_at: meta.oldNextChargeAt,
    lost_days: meta.lostDays,
    new_token: result.subscriptionToken,
  });
  return buildView("pending_first_payment", { ours: true, qrCode: payment.qr_code, mandateStatus: payment.mandate_status }, true);
}
