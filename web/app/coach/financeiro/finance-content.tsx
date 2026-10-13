import Link from "next/link";
import type { MonthKey } from "@/lib/finance/dates";
import { getFinanceOverview, type HistoryFilter } from "@/lib/finance/queries";
import { withTimeout } from "./timeout";
import { MetricCards } from "./metric-cards";
import { HistorySection, LateSection, UpcomingSection } from "./sections";
import { BUTTON_PRIMARY } from "./ui";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Corpo do Financeiro. Async Server Component dentro de `<Suspense>` (ver `page.tsx`): o
 * cabeçalho aparece na hora e o esqueleto ocupa o lugar até as consultas voltarem. Erro de
 * consulta lança e cai no `error.tsx` da rota.
 *
 * Ordem (hierarquia pedida): números grandes -> Atrasados -> Próximas cobranças -> histórico.
 */
export default async function FinanceContent({
  month,
  historyFilter,
}: {
  month: MonthKey;
  historyFilter: HistoryFilter;
}) {
  const overview = await withTimeout(getFinanceOverview({ month }));

  if (!overview.hasSubscriptions) {
    return (
      <EmptyState
        icon="wallet"
        title="Nenhuma assinatura ainda"
        text="O Financeiro mostra receita, atrasos e próximas cobranças a partir das assinaturas dos seus alunos. Próximo passo: abra um aluno, vá até a aba Pagamento e crie a assinatura dele."
        action={
          <Link href="/coach/alunos" className={BUTTON_PRIMARY}>
            Ir para Alunos
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <MetricCards overview={overview} />
      <LateSection overview={overview} />
      <UpcomingSection overview={overview} />
      <HistorySection filter={historyFilter} month={month} />
    </div>
  );
}
