import { monthOf, toSaoPauloDate, type DateOnly, type MonthKey } from "./dates";

/**
 * Regras de cálculo do Financeiro — funções puras (sem I/O), separadas das queries pra que a
 * conta de cada número da tela seja legível e conferível à mão.
 */

export type SubscriptionPeriod = "monthly" | "quarterly" | "semiannual" | "annual";
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled" | "refunded";

/** Quantos meses cada periodicidade cobre — o preço da assinatura é dividido por isso no MRR. */
export const PERIOD_MONTHS: Record<SubscriptionPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const PERIOD_LABEL: Record<SubscriptionPeriod, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export type SubscriptionFact = {
  price_cents: number;
  period: SubscriptionPeriod;
  status: SubscriptionStatus;
  created_at: string;
  /** Quando foi cancelada (migration 0016); nulo se ativa/pausada ou cancelada antes da 0016. */
  cancelled_at: string | null;
};

export type SubscriptionSummary = {
  /** Assinaturas `active` — cada aluno tem no máximo uma (unique em `client_id`). */
  activeCount: number;
  /** Soma mensalizada das assinaturas ativas, arredondada pra centavo inteiro. */
  mrrCents: number;
  /** MRR / assinaturas ativas, arredondado; `null` sem nenhuma ativa (não dá pra dividir). */
  averageTicketCents: number | null;
  /** Assinaturas criadas no mês selecionado (data local de São Paulo). */
  newInMonth: number;
  /** Assinaturas canceladas no mês selecionado (`cancelled_at`, data local de São Paulo). */
  cancelledInMonth: number;
  /** Assinaturas `cancelled` — total acumulado, de qualquer mês. */
  cancelledTotal: number;
  total: number;
};

export function summarizeSubscriptions(
  subscriptions: SubscriptionFact[],
  month: MonthKey
): SubscriptionSummary {
  let active = 0;
  let mrrRaw = 0;
  let created = 0;
  let cancelled = 0;
  let cancelledInMonth = 0;

  for (const s of subscriptions) {
    if (s.status === "active") {
      active += 1;
      mrrRaw += s.price_cents / PERIOD_MONTHS[s.period];
    }
    if (s.status === "cancelled") {
      cancelled += 1;
      if (s.cancelled_at && monthOf(toSaoPauloDate(s.cancelled_at)) === month) cancelledInMonth += 1;
    }
    if (monthOf(toSaoPauloDate(s.created_at)) === month) created += 1;
  }

  const mrrCents = Math.round(mrrRaw);
  return {
    activeCount: active,
    mrrCents,
    averageTicketCents: active > 0 ? Math.round(mrrCents / active) : null,
    newInMonth: created,
    cancelledInMonth,
    cancelledTotal: cancelled,
    total: subscriptions.length,
  };
}

/**
 * Status EXIBIDO de uma cobrança. `pending` com vencimento anterior a hoje é "atrasado" mesmo
 * que a coluna ainda diga `pending` — derivado na leitura, nunca gravado no banco por causa
 * disso. `overdue` na coluna já é atrasado por definição.
 */
export function displayPaymentStatus(
  status: PaymentStatus,
  dueDate: DateOnly,
  today: DateOnly
): PaymentStatus {
  if (status === "overdue") return "overdue";
  if (status === "pending" && dueDate < today) return "overdue";
  return status;
}

export function sumCents(items: { amountCents: number }[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}
