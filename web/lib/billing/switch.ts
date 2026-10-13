/**
 * "Trocar forma de pagamento" (Pix Automático <-> cartão recorrente) — regras PURAS, sem I/O,
 * testadas em `switch.test.ts`. A casca com I/O fica em `lib/billing/method-switch.ts`.
 *
 * O que a API da SyncPay permite (docs em syncpay.apidog.io):
 *  - "Trocar plano" (`PATCH /subscriptions/{token}/change-plan`) NÃO serve: só entre planos do
 *    mesmo `billing_method` (`cross_billing_method_not_allowed`) e ainda sem Pix Automático
 *    (`pix_automatico_not_supported_yet`).
 *  - "Cadastrar assinante" (enroll) não aceita data da primeira cobrança; no cartão a cobrança é
 *    sempre imediata. `next_charge_at` = `started_at` + `periodicity_days` (do 1º pagamento).
 *  - "Cancelar" (`PATCH /subscriptions/{token}/cancel`): irreversível, "nenhuma nova cobrança é
 *    gerada". Reembolso só da venda INTEIRA (sem valor parcial) e com análise — não serve pra
 *    devolver dias.
 * Ou seja: a forma nova SEMPRE cobra na hora em que o coach a confirma, e o ciclo novo começa
 * ali. Pra que o coach não pague duas vezes pelo mesmo período (nem ganhe dias), a troca de uma
 * assinatura EM DIA só abre numa janela curta antes do vencimento atual, e antes de a SyncPay
 * gerar a cobrança do ciclo seguinte na forma antiga. Os dias que sobrarem do ciclo atual na
 * hora da troca aparecem pro coach ANTES de ele confirmar. Em atraso não há o que alinhar: o
 * ciclo atual não foi pago, a forma nova paga e passa a valer.
 */
import type { BillingStatus, SyncPayStatus } from "./state";

export const PAYMENT_METHODS = ["pix_automatico", "credit_card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix_automatico: "Pix Automático",
  credit_card: "Cartão recorrente",
};

/** Quantos dias antes do vencimento atual a troca (de uma assinatura em dia) é liberada. */
export const SWITCH_WINDOW_DAYS = 7;
/** `billing_advance_days` padrão da SyncPay (cobrança gerada N dias antes do vencimento). */
export const DEFAULT_ADVANCE_DAYS = 3;
/** `periodicity_days` do plano mensal. */
export const DEFAULT_PERIODICITY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `billing_method` da SyncPay -> forma de pagamento do Trackly (`qr_code` não é usado). */
export function normalizeBillingMethod(value: unknown): PaymentMethod | null {
  if (value === "pix_automatico") return "pix_automatico";
  if (value === "credit_card" || value === "card") return "credit_card";
  return null;
}

export function otherMethod(method: PaymentMethod): PaymentMethod {
  return method === "pix_automatico" ? "credit_card" : "pix_automatico";
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);

/**
 * Forma de pagamento da assinatura atual, a partir do log (`coach_billing_events`) daquele token:
 *  1. enroll de Pix Automático feito pelo Trackly (`trackly_pix_enroll`) -> Pix;
 *  2. `billing_method` que a SyncPay mandou (webhook `plan.billing_method`, enroll, consulta);
 *  3. `plan_token` do webhook igual ao plano de Pix configurado -> Pix;
 *  4. senão, com token: cartão (o link hospedado do Trackly é só de cartão).
 * Eventos mais recentes primeiro. `null` = sem assinatura.
 */
export function deriveCurrentMethod(input: {
  token: string | null;
  events: { event: string; payload: unknown }[];
  pixPlanToken: string | null | undefined;
}): PaymentMethod | null {
  if (!input.token) return null;
  if (input.events.some((e) => e.event === "trackly_pix_enroll")) return "pix_automatico";
  for (const e of input.events) {
    const p = asObj(e.payload);
    const found = normalizeBillingMethod(asObj(p?.plan)?.billing_method) ?? normalizeBillingMethod(p?.billing_method);
    if (found) return found;
  }
  const pixPlan = input.pixPlanToken?.trim();
  if (pixPlan) {
    for (const e of input.events) {
      const p = asObj(e.payload);
      const planToken = p?.plan_token ?? asObj(p?.plan)?.token;
      if (planToken === pixPlan) return "pix_automatico";
    }
  }
  return "credit_card";
}

export type SwitchTiming =
  /** Sem assinatura paga pra trocar (usa o fluxo normal de assinar/reativar). */
  | { kind: "unavailable" }
  /** Pode trocar agora. `lostDays`: dias do ciclo atual que sobram (null = data desconhecida). */
  | {
      kind: "now";
      reason: "overdue" | "renewal_window" | "unknown_date";
      currentCycleEndsAt: string | null;
      lostDays: number | null;
      /** Próxima cobrança na forma nova se ela for confirmada agora. */
      nextChargeAfterSwitch: string;
    }
  /** Assinatura em dia, longe do vencimento: troca abre em `opensAt`. */
  | { kind: "too_early"; opensAt: string; closesAt: string; currentCycleEndsAt: string }
  /** A cobrança do próximo ciclo já foi gerada na forma atual: espera ela ser paga. */
  | { kind: "charge_in_progress"; currentCycleEndsAt: string };

/**
 * Quando a troca pode acontecer e o que ela faz com as datas.
 *  - `overdue`: na hora (o ciclo atual não está pago; nada a alinhar).
 *  - `active`: só entre `vencimento - SWITCH_WINDOW_DAYS` e `vencimento - advanceDays` (antes de
 *    a forma antiga gerar a próxima cobrança, senão o coach pagaria duas vezes). Fora disso:
 *    `too_early` ou `charge_in_progress`.
 *  - demais status: `unavailable`.
 */
export function planSwitchTiming(input: {
  status: BillingStatus | null;
  nextChargeAt: string | null;
  now: Date;
  advanceDays?: number | null;
  periodicityDays?: number | null;
  /** A assinatura atual já tem cobrança `pending` (próximo ciclo gerado). */
  pendingChargeExists?: boolean;
  windowDays?: number;
}): SwitchTiming {
  const period = positiveInt(input.periodicityDays) ?? DEFAULT_PERIODICITY_DAYS;
  const nextChargeAfterSwitch = new Date(input.now.getTime() + period * DAY_MS).toISOString();

  if (input.status === "overdue") {
    return { kind: "now", reason: "overdue", currentCycleEndsAt: null, lostDays: 0, nextChargeAfterSwitch };
  }
  if (input.status !== "active") return { kind: "unavailable" };

  const due = input.nextChargeAt ? new Date(input.nextChargeAt) : null;
  if (!due || Number.isNaN(due.getTime())) {
    return { kind: "now", reason: "unknown_date", currentCycleEndsAt: null, lostDays: null, nextChargeAfterSwitch };
  }
  const currentCycleEndsAt = due.toISOString();
  const advance = nonNegativeInt(input.advanceDays) ?? DEFAULT_ADVANCE_DAYS;
  const window = Math.max(advance + 1, positiveInt(input.windowDays) ?? SWITCH_WINDOW_DAYS);
  const closes = due.getTime() - advance * DAY_MS;
  const opens = due.getTime() - window * DAY_MS;
  const now = input.now.getTime();

  if (input.pendingChargeExists || now >= closes) return { kind: "charge_in_progress", currentCycleEndsAt };
  if (now < opens) {
    return {
      kind: "too_early",
      opensAt: new Date(opens).toISOString(),
      closesAt: new Date(closes).toISOString(),
      currentCycleEndsAt,
    };
  }
  return {
    kind: "now",
    reason: "renewal_window",
    currentCycleEndsAt,
    lostDays: Math.max(0, Math.ceil((due.getTime() - now) / DAY_MS)),
    nextChargeAfterSwitch,
  };
}

/**
 * Cancelar a assinatura ANTIGA? Só quando:
 *  - existe pedido de troca do coach saindo exatamente dessa assinatura;
 *  - a assinatura nova é outra e está CONFIRMADA ativa pela API da SyncPay;
 *  - ainda não foi cancelada por nós (idempotência).
 * Nunca deixa o coach sem nenhuma assinatura ativa por ação nossa.
 */
export function shouldCancelOldSubscription(input: {
  switchFromToken: string | null;
  oldToken: string | null;
  newToken: string | null;
  newStatusVerified: SyncPayStatus | null;
  alreadyCancelled: boolean;
}): boolean {
  return (
    !!input.oldToken &&
    !!input.newToken &&
    input.switchFromToken === input.oldToken &&
    input.newToken !== input.oldToken &&
    input.newStatusVerified === "active" &&
    !input.alreadyCancelled
  );
}

export type CancelOutcome = "cancelled" | "not_found" | "rejected" | "error";

/** Resposta de `PATCH /subscriptions/{token}/cancel`. `rejected`/`error` = tentar de novo depois. */
export function parseCancelResponse(httpStatus: number): CancelOutcome {
  if (httpStatus === 200 || httpStatus === 204) return "cancelled";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 422 || httpStatus === 409) return "rejected";
  return "error";
}

/** Cancelamento resolvido (não precisa tentar de novo). */
export function cancelSettled(outcome: CancelOutcome, oldStatusAfter: SyncPayStatus | null): boolean {
  return outcome === "cancelled" || outcome === "not_found" || oldStatusAfter === "cancelled";
}

function positiveInt(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null;
}
function nonNegativeInt(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}
