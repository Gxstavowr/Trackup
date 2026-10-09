import Link from "next/link";
import type { MonthKey } from "@/lib/finance/dates";
import { getFinanceOverview, type HistoryFilter } from "@/lib/finance/queries";
import { MetricCards } from "./metric-cards";
import { HistorySection, LateSection, UpcomingSection } from "./sections";
import { BUTTON_PRIMARY } from "./ui";

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
  const overview = await getFinanceOverview({ month });

  if (!overview.hasSubscriptions) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
        <p className="font-display text-hero text-ink">Nenhuma assinatura ainda</p>
        <p className="max-w-md text-sm text-ink-muted">
          O Financeiro mostra receita, atrasos e próximas cobranças a partir das assinaturas dos seus
          alunos. Próximo passo: abra um aluno, vá até a aba Pagamento e crie a assinatura dele.
        </p>
        <Link href="/coach/alunos" className={`${BUTTON_PRIMARY} mt-2`}>
          Ir para Alunos
        </Link>
      </div>
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
