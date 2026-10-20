import { Suspense, type ReactNode } from "react";
import { formatBRL } from "@/lib/finance/format";
import {
  getPaymentHistory,
  HISTORY_LIMIT,
  UPCOMING_DAYS,
  type FinanceOverview,
  type HistoryFilter,
} from "@/lib/finance/queries";
import type { MonthKey } from "@/lib/finance/dates";
import { Icon, Segmented } from "@/components/ui";
import { financeHref } from "./href";
import HistoryTable from "./history-table";
import PaymentRow from "./payment-row";
import { withTimeout } from "./timeout";
import { CARD } from "./ui";
import { EmptyState } from "@/components/ui/empty-state";
import type { IconName } from "@/components/ui/icon";

function SectionHeader({
  id,
  title,
  summary,
  tone = "default",
}: {
  id: string;
  title: string;
  summary?: string;
  tone?: "default" | "late";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className={`t-subtitle flex items-center gap-2 text-lg md:text-xl ${tone === "late" ? "text-danger-text" : "text-ink"}`}>
        {tone === "late" && <Icon name="alert" size={20} className="shrink-0" />}
        {title}
      </h2>
      {summary && (
        <p className={`text-sm tabular-nums ${tone === "late" ? "text-late-text" : "text-ink-muted"}`}>{summary}</p>
      )}
    </div>
  );
}

function EmptyLine({ title, icon = "wallet", children }: { title: string; icon?: IconName; children?: ReactNode }) {
  return <EmptyState compact icon={icon} title={title} text={children} />;
}

/** Ação principal #1: quem está devendo AGORA (qualquer mês), do mais antigo pro mais recente. */
export function LateSection({ overview }: { overview: FinanceOverview }) {
  const { late, lateTotalCents } = overview;
  return (
    <section aria-labelledby="atrasados" className="flex flex-col gap-3">
      <SectionHeader
        id="atrasados"
        title="Atrasados"
        tone="late"
        summary={
          late.length > 0
            ? `${late.length} ${late.length === 1 ? "pagamento" : "pagamentos"} · ${formatBRL(lateTotalCents)}`
            : undefined
        }
      />
      {late.length === 0 ? (
        <EmptyLine title="Nenhum pagamento atrasado" icon="check-circle">
          Todas as cobranças vencidas estão em dia.
        </EmptyLine>
      ) : (
        <ul className={`overflow-hidden border-danger/60 ${CARD}`}>
          {late.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} variant="late" />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Ação principal #2: cobranças pendentes dos próximos 30 dias, por vencimento. */
export function UpcomingSection({ overview }: { overview: FinanceOverview }) {
  const { upcoming, upcomingTotalCents } = overview;
  return (
    <section aria-labelledby="proximas" className="flex flex-col gap-3">
      <SectionHeader
        id="proximas"
        title="Próximas cobranças pendentes"
        summary={
          upcoming.length > 0
            ? `Próximos ${UPCOMING_DAYS} dias · ${upcoming.length} · ${formatBRL(upcomingTotalCents)}`
            : `Próximos ${UPCOMING_DAYS} dias`
        }
      />
      {upcoming.length === 0 ? (
        <EmptyLine title={`Nenhuma cobrança nos próximos ${UPCOMING_DAYS} dias`} icon="calendar">
          As cobranças aparecem aqui
          depois que você usa &quot;Registrar próxima cobrança&quot; na aba Pagamento de cada aluno.
        </EmptyLine>
      ) : (
        <ul className={`overflow-hidden ${CARD}`}>
          {upcoming.map((payment) => (
            <PaymentRow key={payment.id} payment={payment} variant="upcoming" />
          ))}
        </ul>
      )}
    </section>
  );
}

const FILTER_LABEL: Record<HistoryFilter, string> = {
  all: "Todos",
  paid: "Em dia",
  pending: "Pendentes",
  overdue: "Atrasados",
  cancelled: "Cancelados",
  refunded: "Estornados",
};

const FILTERS: HistoryFilter[] = ["all", "paid", "pending", "overdue", "cancelled", "refunded"];

/** Último bloco: histórico, limitado aos últimos 50 (por vencimento), com filtro por status. */
export function HistorySection({ filter, month }: { filter: HistoryFilter; month: MonthKey }) {
  return (
    <section aria-labelledby="historico" className="flex flex-col gap-3">
      <SectionHeader id="historico" title="Histórico de pagamentos" />

      <Segmented
        label="Filtrar histórico por status"
        size="sm"
        value={filter}
        items={FILTERS.map((value) => ({
          id: value,
          label: FILTER_LABEL[value],
          href: financeHref({ month, status: value }, "historico"),
        }))}
      />

      {/* key no filtro: trocar o chip mostra só o esqueleto da lista, sem piscar o resto da tela. */}
      <Suspense key={filter} fallback={<HistorySkeleton />}>
        <HistoryList filter={filter} />
      </Suspense>
    </section>
  );
}

function HistorySkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Carregando o histórico…</span>
      <div aria-hidden className="h-40 animate-pulse card" />
    </div>
  );
}

async function HistoryList({ filter }: { filter: HistoryFilter }) {
  const { rows, hasMore } = await withTimeout(getPaymentHistory(filter));

  if (rows.length === 0) {
    return (
      <EmptyLine
        title={filter === "all" ? "Nenhum pagamento registrado ainda" : "Nenhum pagamento com esse status"}
      >
        {filter === "all" ? "Os pagamentos aparecem aqui conforme você os registra em cada aluno." : "Troque o filtro para ver outros pagamentos."}
      </EmptyLine>
    );
  }

  return (
    <>
      <HistoryTable rows={rows} />
      {hasMore && (
        <p className="text-xs text-ink-faint">
          Mostrando os {HISTORY_LIMIT} pagamentos mais recentes por vencimento.
        </p>
      )}
    </>
  );
}
