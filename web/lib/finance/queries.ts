import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween, monthRange, todayInSaoPaulo, type DateOnly, type MonthKey } from "./dates";
import {
  displayPaymentStatus,
  sumCents,
  summarizeSubscriptions,
  type PaymentStatus,
  type SubscriptionFact,
  type SubscriptionPeriod,
  type SubscriptionStatus,
  type SubscriptionSummary,
} from "./metrics";

/**
 * Consultas do Financeiro do coach (`/coach/financeiro`).
 *
 * Isolamento: TUDO passa pelo client autenticado (cookies + anon key), nunca pelo admin — a
 * RLS existente (`subscriptions_by_client`, `payments_by_subscription` via
 * `private.can_access_client`) é quem garante que o coach só enxerga a própria conta. As
 * consultas embutem `payments -> subscriptions -> clients` numa só chamada (embed do
 * PostgREST); a RLS de cada tabela embutida continua valendo. Nenhuma consulta aqui filtra
 * por `account_id` na mão — se filtrasse, esconderia um furo de RLS em vez de expô-lo.
 *
 * Só leitura. Não grava nada (o "atrasado" é derivado na leitura, ver `displayPaymentStatus`).
 * Sem gateway: `gateway_reference` existe na tabela como ponto de extensão e nem é lido aqui.
 *
 * Limite conhecido: o PostgREST devolve no máximo 1000 linhas por consulta (default do
 * Supabase). Os recortes usados aqui (um mês, os atrasados, 30 dias, 51 do histórico) ficam
 * muito abaixo disso pro tamanho de carteira do MVP.
 */

export type HistoryFilter = "all" | "paid" | "pending" | "overdue" | "cancelled" | "refunded";
export const HISTORY_FILTERS: HistoryFilter[] = ["all", "paid", "pending", "overdue", "cancelled", "refunded"];

export const HISTORY_LIMIT = 50;
export const UPCOMING_DAYS = 30;

export type FinancePayment = {
  id: string;
  dueDate: DateOnly;
  paidDate: DateOnly | null;
  amountCents: number;
  /** Valor cru da coluna `status`. */
  rawStatus: PaymentStatus;
  /** Status exibido: `pending` vencido vira `overdue` (derivado, não gravado). */
  status: PaymentStatus;
  method: string | null;
  planName: string;
  period: SubscriptionPeriod;
  subscriptionStatus: SubscriptionStatus;
  client: { id: string; name: string; phone: string | null };
  /** Dias de atraso (>0) quando `status === "overdue"`; senão 0. */
  daysLate: number;
  /** Dias até o vencimento (>=0) quando ainda não venceu; senão 0. */
  daysUntilDue: number;
};

export type FinanceOverview = {
  today: DateOnly;
  month: MonthKey;
  /** Existe pelo menos uma assinatura na conta? Sem isso a tela mostra o estado vazio. */
  hasSubscriptions: boolean;
  subscriptions: SubscriptionSummary;
  /** Números do mês selecionado. */
  monthTotals: {
    /** Cobranças com vencimento no mês (paid + pending + overdue), sem assinaturas canceladas. */
    forecastCents: number;
    /** `paid` com `paid_date` no mês. */
    receivedCents: number;
    /** `pending` com vencimento no mês e ainda no prazo (vencimento >= hoje). */
    toReceiveCents: number;
  };
  /** Todos os pagamentos atrasados HOJE (qualquer mês), do mais antigo pro mais recente. */
  late: FinancePayment[];
  lateTotalCents: number;
  /** `pending` com vencimento entre hoje e hoje+30 dias, por vencimento. */
  upcoming: FinancePayment[];
  upcomingTotalCents: number;
};

export type PaymentHistory = {
  /** Últimos `HISTORY_LIMIT` (por vencimento desc), já filtrados. */
  rows: FinancePayment[];
  hasMore: boolean;
};

const PAYMENT_SELECT =
  "id, due_date, paid_date, amount_cents, status, method, " +
  "subscriptions!inner(plan_name, period, status, clients!inner(id, name, phone))";

type RawPayment = {
  id: string;
  due_date: string;
  paid_date: string | null;
  amount_cents: number;
  status: PaymentStatus;
  method: string | null;
  subscriptions: RawSubscription | RawSubscription[];
};
type RawSubscription = {
  plan_name: string;
  period: SubscriptionPeriod;
  status: SubscriptionStatus;
  clients: RawClient | RawClient[];
};
type RawClient = { id: string; name: string; phone: string | null };

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function normalize(raw: RawPayment, today: DateOnly): FinancePayment {
  const sub = one(raw.subscriptions);
  const client = one(sub.clients);
  const status = displayPaymentStatus(raw.status, raw.due_date, today);
  return {
    id: raw.id,
    dueDate: raw.due_date,
    paidDate: raw.paid_date,
    amountCents: raw.amount_cents,
    rawStatus: raw.status,
    status,
    method: raw.method,
    planName: sub.plan_name,
    period: sub.period,
    subscriptionStatus: sub.status,
    client: { id: client.id, name: client.name, phone: client.phone },
    daysLate: status === "overdue" ? Math.max(daysBetween(raw.due_date, today), 0) : 0,
    daysUntilDue: raw.due_date >= today ? daysBetween(today, raw.due_date) : 0,
  };
}

function fail(what: string, message: string): never {
  throw new Error(`Não foi possível carregar ${what}: ${message}`);
}

export async function getFinanceOverview(input: { month: MonthKey }): Promise<FinanceOverview> {
  const { month } = input;
  const supabase = await createClient();
  const today = todayInSaoPaulo();
  const { start, end } = monthRange(month);
  const upcomingEnd = addDays(today, UPCOMING_DAYS);

  const [subsRes, dueRes, paidRes, lateRes, upcomingRes] = await Promise.all([
    supabase.from("subscriptions").select("price_cents, period, status, created_at, cancelled_at"),
    supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .gte("due_date", start)
      .lte("due_date", end)
      .in("status", ["paid", "pending", "overdue"]),
    supabase
      .from("payments")
      .select("amount_cents")
      .eq("status", "paid")
      .gte("paid_date", start)
      .lte("paid_date", end),
    supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("status", "pending")
      .gte("due_date", today)
      .lte("due_date", upcomingEnd)
      .order("due_date", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (subsRes.error) fail("as assinaturas", subsRes.error.message);
  if (dueRes.error) fail("as cobranças do mês", dueRes.error.message);
  if (paidRes.error) fail("os recebimentos do mês", paidRes.error.message);
  if (lateRes.error) fail("os pagamentos atrasados", lateRes.error.message);
  if (upcomingRes.error) fail("as próximas cobranças", upcomingRes.error.message);

  const subscriptionFacts = (subsRes.data ?? []) as SubscriptionFact[];
  const dueInMonth = ((dueRes.data ?? []) as unknown as RawPayment[]).map((r) => normalize(r, today));
  const paidRows = (paidRes.data ?? []) as { amount_cents: number }[];
  const late = ((lateRes.data ?? []) as unknown as RawPayment[]).map((r) => normalize(r, today));
  // Cobrança de assinatura cancelada não é mais esperada: fica de fora do que é "previsto",
  // "a receber" e "próximas cobranças". Continua nos atrasados (é dívida) e no histórico.
  const upcoming = ((upcomingRes.data ?? []) as unknown as RawPayment[])
    .map((r) => normalize(r, today))
    .filter((p) => p.subscriptionStatus !== "cancelled");

  const expectedThisMonth = dueInMonth.filter((p) => p.subscriptionStatus !== "cancelled");

  return {
    today,
    month,
    hasSubscriptions: subscriptionFacts.length > 0,
    subscriptions: summarizeSubscriptions(subscriptionFacts, month),
    monthTotals: {
      forecastCents: sumCents(expectedThisMonth),
      receivedCents: paidRows.reduce((total, p) => total + p.amount_cents, 0),
      toReceiveCents: sumCents(expectedThisMonth.filter((p) => p.status === "pending")),
    },
    late,
    lateTotalCents: sumCents(late),
    upcoming,
    upcomingTotalCents: sumCents(upcoming),
  };
}

/**
 * Histórico de pagamentos (mais recentes por vencimento, no máximo `HISTORY_LIMIT`), com filtro
 * por status. Consulta separada da visão geral pra o filtro poder recarregar só esta seção.
 * "Atrasado" e "pendente" dependem de `hoje` porque a coluna `status` pode dizer `pending` pra
 * uma cobrança já vencida (derivado na leitura, não gravado).
 */
export async function getPaymentHistory(filter: HistoryFilter): Promise<PaymentHistory> {
  const supabase = await createClient();
  const today = todayInSaoPaulo();

  let query = supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .order("due_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT + 1); // +1 só pra saber se há mais do que o limite
  if (filter === "paid" || filter === "cancelled" || filter === "refunded") {
    query = query.eq("status", filter);
  } else if (filter === "pending") {
    query = query.eq("status", "pending").gte("due_date", today);
  } else if (filter === "overdue") {
    query = query.or(`status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`);
  }

  const { data, error } = await query;
  if (error) fail("o histórico de pagamentos", error.message);

  const all = ((data ?? []) as unknown as RawPayment[]).map((r) => normalize(r, today));
  return { rows: all.slice(0, HISTORY_LIMIT), hasMore: all.length > HISTORY_LIMIT };
}
