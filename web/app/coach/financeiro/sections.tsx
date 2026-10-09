import Link from "next/link";
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
import { financeHref } from "./href";
import PaymentRow from "./payment-row";
import { CARD } from "./ui";

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
      <h2 id={id} className="font-display text-xl text-ink md:text-2xl">
        {title}
      </h2>
      {summary && (
        <p className={`text-sm tabular-nums ${tone === "late" ? "text-late-text" : "text-ink-muted"}`}>{summary}</p>
      )}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
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
        <EmptyLine>Nenhum pagamento atrasado. Todas as cobranças vencidas estão em dia.</EmptyLine>
      ) : (
        <ul className={`overflow-hidden border-late/40 ${CARD}`}>
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
        title="Próximas cobranças"
        summary={
          upcoming.length > 0
            ? `Próximos ${UPCOMING_DAYS} dias · ${upcoming.length} · ${formatBRL(upcomingTotalCents)}`
            : `Próximos ${UPCOMING_DAYS} dias`
        }
      />
      {upcoming.length === 0 ? (
        <EmptyLine>
          Nenhuma cobrança registrada para os próximos {UPCOMING_DAYS} dias. As cobranças aparecem aqui
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

      <nav aria-label="Filtrar histórico por status" className="flex flex-wrap gap-2">
        {FILTERS.map((value) => {
          const active = value === filter;
          return (
            <Link
              key={value}
              href={financeHref({ month, status: value }, "historico")}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition-colors ${
                active
                  ? "border-brand bg-brand-tint text-ink"
                  : "border-line text-ink-muted hover:border-brand hover:text-ink"
              }`}
            >
              {FILTER_LABEL[value]}
            </Link>
          );
        })}
      </nav>

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
      <div aria-hidden className="h-40 animate-pulse rounded-lg border border-line bg-surface" />
    </div>
  );
}

async function HistoryList({ filter }: { filter: HistoryFilter }) {
  const { rows, hasMore } = await getPaymentHistory(filter);

  if (rows.length === 0) {
    return (
      <EmptyLine>
        {filter === "all" ? "Nenhum pagamento registrado ainda." : "Nenhum pagamento com esse status."}
      </EmptyLine>
    );
  }

  return (
    <>
      <ul className={`overflow-hidden ${CARD}`}>
        {rows.map((payment) => (
          <PaymentRow key={payment.id} payment={payment} variant="history" />
        ))}
      </ul>
      {hasMore && (
        <p className="text-xs text-ink-faint">
          Mostrando os {HISTORY_LIMIT} pagamentos mais recentes por vencimento.
        </p>
      )}
    </>
  );
}
