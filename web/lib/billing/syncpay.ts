import "server-only";
import { isSyncPayStatus, type SyncPayStatus } from "./state";
import { extractMandate, parseEnrollResponse, type EnrollResult, type PixMandate } from "./enroll";
import { normalizeBillingMethod, parseCancelResponse, type CancelOutcome, type PaymentMethod } from "./switch";

/**
 * Cliente mínimo da API de parceiro da SyncPay (só servidor). Usado pelo webhook pra NÃO confiar
 * no corpo recebido: a SyncPay não documenta assinatura de webhook, então com credenciais
 * configuradas o status aplicado é o que a API devolve pra aquele token.
 *
 * Credenciais e token de acesso: só em `process.env` / memória do processo. Nunca logados.
 */

const DEFAULT_BASE_URL = "https://api.syncpayments.com.br";
const TIMEOUT_MS = 3000; // webhook da SyncPay tem timeout de 5s
const USER_TIMEOUT_MS = 10000; // ações do coach na tela (enroll / consulta)

/**
 * Host da API. `SYNCPAY_API_BASE` existe SÓ pra testar contra um mock local; aceita https ou
 * http em localhost/127.0.0.1. Qualquer outro valor cai no host de produção.
 */
export function syncPayBaseUrl(raw: string | undefined = process.env.SYNCPAY_API_BASE): string {
  if (!raw) return DEFAULT_BASE_URL;
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) return url.origin;
  } catch {
    // inválido: usa produção
  }
  return DEFAULT_BASE_URL;
}

const BASE_URL = () => syncPayBaseUrl();

let cachedToken: { value: string; expiresAt: number } | null = null;

export function syncPayCredentialsConfigured(): boolean {
  return !!process.env.SYNCPAY_CLIENT_ID && !!process.env.SYNCPAY_CLIENT_SECRET;
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const { status, body } = await fetchJson(`${BASE_URL()}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.SYNCPAY_CLIENT_ID,
      client_secret: process.env.SYNCPAY_CLIENT_SECRET,
    }),
  });
  const data = body as { access_token?: unknown; expires_in?: unknown } | null;
  if (status !== 200 || typeof data?.access_token !== "string") {
    throw new Error(`SyncPay auth falhou (HTTP ${status})`);
  }
  const ttl = typeof data.expires_in === "number" ? data.expires_in : 3600;
  // Renova 60s antes de expirar.
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000 };
  return cachedToken.value;
}

export type SyncPaySubscription = {
  token: string;
  status: SyncPayStatus;
  subscriberEmail: string | null;
  subscriberDocument: string | null;
  nextChargeAt: string | null;
  overdueSince: string | null;
};

/** Dados do plano/cobranças que só o detalhe traz (usados na troca de forma de pagamento). */
export type SyncPaySubscriptionPlanInfo = {
  billingMethod: PaymentMethod | null;
  advanceDays: number | null;
  periodicityDays: number | null;
  /** Há cobrança `pending` (ciclo seguinte já gerado / em cobrança). */
  pendingChargeExists: boolean;
};

/** Chamada autenticada; um 401 renova o token de acesso e tenta uma vez de novo. */
async function authedJson(path: string, init: RequestInit, timeoutMs = TIMEOUT_MS) {
  const run = async () =>
    fetchJson(
      `${BASE_URL()}${path}`,
      {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${await getAccessToken()}`,
          Accept: "application/json",
        },
      },
      timeoutMs
    );
  let res = await run();
  if (res.status === 401) {
    cachedToken = null;
    res = await run();
  }
  return res;
}

/** `GET /api/partner/v1/subscriptions/{token}`. `null` = 404 (assinatura não existe na SyncPay). */
export async function fetchSyncPaySubscription(
  token: string,
  timeoutMs = TIMEOUT_MS
): Promise<(SyncPaySubscription & SyncPaySubscriptionPlanInfo & { mandate: Partial<PixMandate> | null }) | null> {
  const res = await authedJson(`/api/partner/v1/subscriptions/${encodeURIComponent(token)}`, { method: "GET" }, timeoutMs);
  if (res.status === 404) return null;
  const data = (res.body as { data?: Record<string, unknown> } | null)?.data;
  if (res.status !== 200 || !data || !isSyncPayStatus(data.status)) {
    throw new Error(`SyncPay subscription lookup falhou (HTTP ${res.status})`);
  }
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const plan = data.plan && typeof data.plan === "object" ? (data.plan as Record<string, unknown>) : null;
  const charges = Array.isArray(data.charges) ? (data.charges as unknown[]) : [];
  return {
    token: str(data.token) ?? token,
    status: data.status,
    subscriberEmail: str(data.subscriber_email),
    subscriberDocument: str(data.subscriber_document),
    nextChargeAt: str(data.next_charge_at),
    overdueSince: str(data.overdue_since),
    billingMethod: normalizeBillingMethod(plan?.billing_method),
    advanceDays: int(plan?.billing_advance_days),
    periodicityDays: int(plan?.periodicity_days),
    pendingChargeExists: charges.some(
      (c) => !!c && typeof c === "object" && (c as Record<string, unknown>).status === "pending"
    ),
    mandate: extractMandate(data),
  };
}

/** Plano de Pix Automático + credenciais configurados (senão a opção aparece "Em breve"). */
export function pixAutomaticoConfigured(): boolean {
  return syncPayCredentialsConfigured() && !!process.env.SYNCPAY_PIX_PLAN_TOKEN?.trim();
}

/**
 * `POST /api/partner/v1/subscription-plans/{SYNCPAY_PIX_PLAN_TOKEN}/enroll` (Pix Automático).
 * Dados pessoais vão só no corpo da requisição — nunca em log.
 */
export async function enrollPixAutomatico(subscriber: {
  name: string;
  email: string;
  document: string;
  phone: string | null;
}): Promise<EnrollResult> {
  const plan = process.env.SYNCPAY_PIX_PLAN_TOKEN?.trim();
  if (!plan || !syncPayCredentialsConfigured()) return parseEnrollResponse(0, null);
  const body: Record<string, string> = {
    name: subscriber.name.slice(0, 255),
    email: subscriber.email,
    document: subscriber.document,
  };
  if (subscriber.phone) body.phone = subscriber.phone;
  const res = await authedJson(
    `/api/partner/v1/subscription-plans/${encodeURIComponent(plan)}/enroll`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    USER_TIMEOUT_MS
  );
  return parseEnrollResponse(res.status, res.body);
}

/**
 * `PATCH /api/partner/v1/subscriptions/{token}/cancel` — IRREVERSÍVEL. Só chamado depois que a
 * assinatura nova do coach está confirmada ativa (`lib/billing/method-switch.ts`).
 */
export async function cancelSyncPaySubscription(token: string, reason: string, timeoutMs = USER_TIMEOUT_MS): Promise<CancelOutcome> {
  const res = await authedJson(
    `/api/partner/v1/subscriptions/${encodeURIComponent(token)}/cancel`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.slice(0, 500) }) },
    timeoutMs
  );
  return parseCancelResponse(res.status);
}

export const SYNCPAY_USER_TIMEOUT_MS = USER_TIMEOUT_MS;
