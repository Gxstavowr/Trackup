import { Suspense } from "react";
import { monthOf, parseMonthKey, todayInSaoPaulo } from "@/lib/finance/dates";
import { HISTORY_FILTERS, type HistoryFilter } from "@/lib/finance/queries";
import { requireCoach } from "../require-coach";
import FinanceContent from "./finance-content";
import MonthNav from "./month-nav";
import FinanceSkeleton from "./skeleton";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Financeiro do coach (`/coach/financeiro`) — visão do dinheiro com dados reais do Postgres,
 * deliberadamente sem virar ERP: receita prevista/recebida, a receber, atrasados (com ação),
 * próximas cobranças e histórico. Cobranças são registros MANUAIS (sem gateway/webhook).
 *
 * Estado na URL: `?mes=YYYY-MM` (default: mês atual em São Paulo) e `?status=` (filtro do
 * histórico). Financeiro é uma área separada do acompanhamento: nenhum status de check-in ou
 * avaliação aparece aqui.
 *
 * O layout do coach já traz sidebar/cabeçalho/logout — esta página não duplica nada disso.
 */
export default async function CoachFinancePage({ searchParams }: PageProps<"/coach/financeiro">) {
  await requireCoach();

  const params = await searchParams;
  const currentMonth = monthOf(todayInSaoPaulo());
  const month = parseMonthKey(firstParam(params.mes), currentMonth);
  const rawStatus = firstParam(params.status);
  const status: HistoryFilter = HISTORY_FILTERS.includes(rawStatus as HistoryFilter)
    ? (rawStatus as HistoryFilter)
    : "all";

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            Trackly · Coach
          </span>
          <h1 className="font-display text-hero text-ink">Financeiro</h1>
        </div>
        <MonthNav month={month} currentMonth={currentMonth} status={status} />
      </header>

      <Suspense key={month} fallback={<FinanceSkeleton />}>
        <FinanceContent month={month} historyFilter={status} />
      </Suspense>
    </div>
  );
}
