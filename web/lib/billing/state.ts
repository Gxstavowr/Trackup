/**
 * Assinatura do coach (Trackly cobra o coach via SyncPay) — regras PURAS, sem I/O, testadas em
 * `state.test.ts`. O webhook (`lib/billing/webhook.ts`) e a casca do coach usam só daqui.
 *
 * A SyncPay faz retentativas e suspende sozinha depois de `grace_period_days`; o Trackly só
 * espelha o estado pra avisar (estilo Netflix) e bloquear a área do coach.
 */

export const BILLING_STATUSES = [
  "none",
  "pending_first_payment",
  "active",
  "overdue",
  "suspended",
  "cancelled",
] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

/** Status que a API/webhook da SyncPay pode mandar (`SubscriptionStatus`). */
export type SyncPayStatus = Exclude<BillingStatus, "none">;

/** Dias de carência da SyncPay entre a primeira falha e a suspensão (`grace_period_days`). */
export const GRACE_PERIOD_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSyncPayStatus(value: unknown): value is SyncPayStatus {
  return typeof value === "string" && value !== "none" && (BILLING_STATUSES as readonly string[]).includes(value);
}

export type BillingSnapshot = {
  status: BillingStatus;
  paymentFailedAt: string | null;
  confirmationPending: boolean;
};

const FAILURE_EVENTS = new Set(["cobranca_falhou", "assinatura_em_atraso", "cobranca_retentativa"]);
const PAID_EVENTS = new Set([
  "cobranca_paga",
  "assinatura_ativada",
  "assinatura_reativada",
  "assinatura_renovada",
]);

/**
 * Eventos que mexem no status. Os demais (criada, gerada, mandato_*, plano_alterado) só são
 * registrados. `mandato_ativado` = o coach autorizou o débito do Pix Automático no banco — NÃO é
 * pagamento (o status só vira ativo com a cobrança paga); a tela "Forma de pagamento" lê esses
 * eventos do log pra mostrar o andamento da autorização (`lib/billing/pix.ts`).
 */
export function isStateEvent(event: string): boolean {
  return FAILURE_EVENTS.has(event) || PAID_EVENTS.has(event) || event === "assinatura_suspensa" || event === "assinatura_cancelada";
}

/** Status-alvo derivado SÓ do nome do evento (modo sem credenciais, corpo não verificado). */
export function statusFromEvent(event: string, prev: BillingStatus): BillingStatus | null {
  if (FAILURE_EVENTS.has(event)) {
    // Falha/retentativa nunca "desbloqueia": suspenso ou cancelado continuam como estão.
    return prev === "suspended" || prev === "cancelled" ? prev : "overdue";
  }
  if (PAID_EVENTS.has(event)) return "active";
  if (event === "assinatura_suspensa") return "suspended";
  if (event === "assinatura_cancelada") return "cancelled";
  return null;
}

const CONFIRMABLE_FROM = new Set<BillingStatus>(["overdue", "suspended", "pending_first_payment"]);

/**
 * Próximo estado da assinatura. `verifiedStatus` (vindo da API da SyncPay) manda sobre o nome do
 * evento quando existe. Devolve `null` se o evento não muda estado (só fica no log).
 */
export function applyBillingEvent(
  prev: BillingSnapshot | null,
  event: string,
  at: Date,
  verifiedStatus?: SyncPayStatus | null
): BillingSnapshot | null {
  if (!isStateEvent(event)) return null;
  const before: BillingSnapshot = prev ?? { status: "none", paymentFailedAt: null, confirmationPending: false };
  const target = verifiedStatus ?? statusFromEvent(event, before.status);
  if (!target) return null;

  let paymentFailedAt = before.paymentFailedAt;
  if (target === "active") paymentFailedAt = null;
  else if ((target === "overdue" || target === "suspended") && !paymentFailedAt) paymentFailedAt = at.toISOString();

  let confirmationPending = before.confirmationPending;
  if (target === "active") {
    if (CONFIRMABLE_FROM.has(before.status)) confirmationPending = true;
  } else {
    // Voltou a ter problema antes do coach ver o aviso: "Pagamento confirmado" não vale mais.
    confirmationPending = false;
  }

  return { status: target, paymentFailedAt, confirmationPending };
}

/**
 * Evento de OUTRA assinatura da mesma conta (token diferente do guardado — ex.: o coach trocou do
 * cartão pro Pix Automático e a assinatura antiga ainda manda falha/suspensão): só vale se deixar
 * a conta ativa (aí o token novo é adotado). Falha, suspensão e cancelamento de uma assinatura que
 * não é a atual ficam só no log — senão derrubariam o plano que está sendo pago pela nova.
 *
 * `eventTokenReplaced`: o coach JÁ trocou a forma de pagamento saindo dessa assinatura (pedido de
 * troca registrado). Ela nunca volta a ser a atual — nem com um "pago" atrasado/renovação que
 * chegue antes de o cancelamento dela terminar na SyncPay.
 */
export function appliesToCurrentSubscription(
  currentToken: string | null | undefined,
  eventToken: string | null | undefined,
  nextStatus: BillingStatus,
  eventTokenReplaced = false
): boolean {
  if (!currentToken || !eventToken || currentToken === eventToken) return true;
  if (eventTokenReplaced) return false;
  return nextStatus === "active";
}

/** Bloqueia a área do coach (tela "Plano suspenso"). Sem assinatura = nunca bloqueia. */
export function isBillingBlocked(status: BillingStatus | null | undefined): boolean {
  return status === "suspended" || status === "cancelled";
}

/** Dias inteiros até a suspensão (primeira falha + carência). 0 = suspende hoje / a qualquer momento. */
export function daysUntilSuspension(paymentFailedAt: string | null, now: Date): number | null {
  if (!paymentFailedAt) return null;
  const failed = new Date(paymentFailedAt).getTime();
  if (Number.isNaN(failed)) return null;
  const left = Math.ceil((failed + GRACE_PERIOD_DAYS * DAY_MS - now.getTime()) / DAY_MS);
  return Math.max(0, left);
}

export const BILLING_STATUS_LABEL: Record<BillingStatus, string> = {
  none: "Sem assinatura",
  pending_first_payment: "Aguardando primeiro pagamento",
  active: "Ativa",
  overdue: "Pagamento pendente",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

/** CPF/CNPJ só com dígitos (11 ou 14); qualquer outra coisa vira null. */
export function normalizeDocument(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14 ? digits : null;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export type MatchCandidates = {
  /** Conta que já tem esse subscription_token. */
  byToken: string | null;
  /** Contas cujo coach tem esse e-mail de login. */
  byEmail: string[];
  /** Contas cuja assinatura guardada tem esse CPF/CNPJ. */
  byDocument: string[];
};

/**
 * Webhook -> conta: token já conhecido; senão e-mail do coach (sem ambiguidade); senão documento.
 * Ambíguo (mais de uma conta) = não casa.
 */
export function resolveAccount(c: MatchCandidates): string | null {
  if (c.byToken) return c.byToken;
  const emails = [...new Set(c.byEmail)];
  if (emails.length === 1) return emails[0];
  if (emails.length > 1) return null;
  const docs = [...new Set(c.byDocument)];
  return docs.length === 1 ? docs[0] : null;
}

/** Link de checkout só se for https (vem de env do servidor). */
export function safeCheckoutUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
