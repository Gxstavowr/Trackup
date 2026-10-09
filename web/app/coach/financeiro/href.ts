import type { HistoryFilter } from "@/lib/finance/queries";
import type { MonthKey } from "@/lib/finance/dates";

/** URL do Financeiro com mês e filtro do histórico. O estado mora na URL (compartilhável, sem client state). */
export function financeHref(params: { month?: MonthKey; status?: HistoryFilter }, hash?: string): string {
  const qs = new URLSearchParams();
  if (params.month) qs.set("mes", params.month);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();
  return `/coach/financeiro${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
