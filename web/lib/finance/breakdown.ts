import { shiftMonth, type DateOnly, type MonthKey } from "./dates";

/**
 * Agregações puras (sem I/O) dos dados REAIS já lidos pelo Financeiro — alimentam o gráfico de
 * recebimentos, o donut de situação e os cartões "Por plano" / "Meios de pagamento".
 * Nunca inventam linha: dia sem recebimento é 0 de verdade; sem pagamento algum, listas vazias.
 */

export type MonthReceipt = { month: MonthKey; cents: number };

/** Recebimentos (`paid_date`) por mês, dos `count` meses que terminam em `endMonth` (inclusive). Mês sem recebimento = 0 real. */
export function receiptsByMonth(
  paid: { paidDate: DateOnly | null; amountCents: number }[],
  endMonth: MonthKey,
  count: number,
): MonthReceipt[] {
  const totals = new Map<MonthKey, number>();
  for (const p of paid) {
    if (!p.paidDate) continue;
    const m = p.paidDate.slice(0, 7);
    totals.set(m, (totals.get(m) ?? 0) + p.amountCents);
  }
  const out: MonthReceipt[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(endMonth, -i);
    out.push({ month, cents: totals.get(month) ?? 0 });
  }
  return out;
}

export type GroupTotal = { key: string; count: number; cents: number };

/** Agrupa por chave: contagem e soma em centavos, do maior valor para o menor (desempate por nome). */
export function groupTotals<T extends { amountCents: number }>(items: T[], keyOf: (item: T) => string): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const item of items) {
    const key = keyOf(item);
    const cur = map.get(key) ?? { key, count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += item.amountCents;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key, "pt-BR"));
}
