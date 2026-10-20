import type { ReactNode } from "react";
import { AreaChart, KpiRow, StatCard, StatusDonut, UpdatedAtStrip } from "@/components/viz";
import { formatBRL, formatMonthLabel, formatMonthName } from "@/lib/finance/format";
import type { FinanceOverview } from "@/lib/finance/queries";
import { CARD, EYEBROW } from "./ui";

const METHOD_LABEL: Record<string, string> = {
  manual: "Manual",
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linha de indicadores (referência: 4 cartões de número grande). Só valores derivados de dados reais. */
export function FinanceKpis({ overview }: { overview: FinanceOverview }) {
  const { monthTotals, subscriptions, month, late, lateTotalCents } = overview;
  return (
    <KpiRow>
      <StatCard
        icon="wallet"
        label="Recebido"
        value={formatBRL(monthTotals.receivedCents)}
        hint={`Previsto: ${formatBRL(monthTotals.forecastCents)} em ${formatMonthName(month)}`}
      />
      <StatCard
        icon="clock"
        label="A receber"
        value={formatBRL(monthTotals.toReceiveCents)}
        hint={`Pendentes no prazo com vencimento em ${formatMonthName(month)}`}
      />
      <StatCard
        icon="alert"
        label="Em atraso"
        value={formatBRL(lateTotalCents)}
        tone={late.length > 0 ? "danger" : undefined}
        hint={
          late.length > 0
            ? `${plural(late.length, "pagamento vencido", "pagamentos vencidos")}, de qualquer mês`
            : "Nenhum pagamento em atraso hoje"
        }
      />
      <StatCard
        icon="users"
        label="Ticket médio"
        value={subscriptions.averageTicketCents == null ? null : formatBRL(subscriptions.averageTicketCents)}
        emptyHint="Sem assinaturas ativas"
        hint={`${plural(subscriptions.activeCount, "aluno pagante", "alunos pagantes")} · MRR ${formatBRL(subscriptions.mrrCents)}`}
      />
    </KpiRow>
  );
}

/** Faixa "Detalhes · última atualização" + gráfico de recebimentos por dia + donut por situação. */
export function FinanceCharts({ overview }: { overview: FinanceOverview }) {
  const { month, receiptsByMonth, statusBreakdown, monthTotals } = overview;
  const series = receiptsByMonth.map((m) => ({
    label: formatMonthName(m.month).slice(0, 3),
    value: m.cents,
    detail: formatMonthLabel(m.month),
  }));
  // "Dados reais suficientes": uma curva só diz algo com pelo menos 2 meses com recebimento.
  // Com 0 ou 1 mês, o gráfico dá lugar a uma mensagem honesta (nunca a pontos inventados).
  const monthsWithReceipts = receiptsByMonth.filter((m) => m.cents > 0).length;
  const hasReceipts = monthsWithReceipts >= 2;

  const { paid, pending, overdue } = statusBreakdown;
  const totalCharges = paid.count + pending.count + overdue.count;

  return (
    <>
      <UpdatedAtStrip at={overview.readAt} title="Detalhes" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="chart-receipts" className={`${CARD} tk-enter min-w-0 p-4 md:p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="chart-receipts" className="text-sm font-semibold text-ink">Recebimentos por mês</h2>
              <p className="t-stat mt-2 text-3xl text-ink">{formatBRL(monthTotals.receivedCents)}</p>
              <p className="mt-1 text-xs text-ink-faint">recebido em {formatMonthName(month)}</p>
            </div>
            <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-ink-muted first-letter:uppercase">
              Últimos {receiptsByMonth.length} meses
            </span>
          </div>
          <AreaChart
            className="mt-14"
            data={hasReceipts ? series : []}
            label={`Recebimentos mensais até ${formatMonthLabel(month)}`}
            valueFormat="brl-cents"
            height={220}
            defaultIndex={hasReceipts ? series.length - 1 : undefined}
            emptyLabel={
              monthsWithReceipts === 0
                ? `Nenhum recebimento registrado nos últimos ${receiptsByMonth.length} meses.`
                : "Só um mês com recebimentos no período — o gráfico aparece quando houver pelo menos dois."
            }
          />
        </section>

        <section aria-labelledby="chart-status" className={`${CARD} tk-enter min-w-0 p-4 md:p-5`}>
          <h2 id="chart-status" className="text-sm font-semibold text-ink">Cobranças por situação</h2>
          <p className="mt-1 text-xs text-ink-faint">Vencimento em {formatMonthLabel(month)}</p>
          <StatusDonut
            className="mt-4"
            label="Cobranças por situação"
            emptyLabel="Sem cobranças com vencimento neste mês"
            segments={[
              { label: "Em dia", value: paid.count, tone: "success" },
              { label: "Pendente", value: pending.count, tone: "warning" },
              { label: "Atrasado", value: overdue.count, tone: "danger" },
            ]}
          />
          {totalCharges > 0 && (
            <p className="mt-4 text-xs text-ink-faint">
              {formatBRL(paid.cents)} em dia · {formatBRL(pending.cents)} pendente · {formatBRL(overdue.cents)} atrasado
            </p>
          )}
        </section>
      </div>
    </>
  );
}

function ListCard({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <section className={`${CARD} tk-enter min-w-0 p-4 md:p-5`}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {children.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}

function Line({ label, sub, value }: { label: string; sub: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        <span className="block text-xs text-ink-faint">{sub}</span>
      </span>
      <span className="shrink-0 font-display text-sm font-bold tabular-nums text-ink">{value}</span>
    </li>
  );
}

/** Fileira de cartões menores (referência: meios de pagamento / dispositivos / mais vendidos). */
export function FinanceBreakdowns({ overview }: { overview: FinanceOverview }) {
  const { byPlan, byMethod, subscriptions, month } = overview;
  const base: [string, string, string][] = [
    ["MRR", formatBRL(subscriptions.mrrCents), "situação de hoje"],
    ["Clientes ativos", String(subscriptions.activeCount), "situação de hoje"],
    ["Novos clientes", String(subscriptions.newInMonth), `em ${formatMonthName(month)}`],
    ["Cancelamentos", String(subscriptions.cancelledInMonth), `${subscriptions.cancelledTotal} no total`],
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <ListCard title="Por plano · cobranças do mês" empty="Sem cobranças com vencimento neste mês.">
        {byPlan.map((g) => (
          <Line key={g.key} label={g.key} sub={plural(g.count, "cobrança", "cobranças")} value={formatBRL(g.cents)} />
        ))}
      </ListCard>
      <ListCard title="Meios de pagamento · recebido" empty={`Nenhum recebimento em ${formatMonthName(month)}.`}>
        {byMethod.map((g) => (
          <Line
            key={g.key}
            label={METHOD_LABEL[g.key] ?? g.key}
            sub={plural(g.count, "pagamento", "pagamentos")}
            value={formatBRL(g.cents)}
          />
        ))}
      </ListCard>
      <section className={`${CARD} tk-enter min-w-0 p-4 md:col-span-2 md:p-5 xl:col-span-1`}>
        <h2 className="text-sm font-semibold text-ink">Base de assinaturas</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {base.map(([k, v, s]) => (
            <div key={k}>
              <dt className={EYEBROW}>{k}</dt>
              <dd className="font-display text-lg font-bold tabular-nums text-ink">{v}</dd>
              <dd className="text-xs text-ink-faint">{s}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
