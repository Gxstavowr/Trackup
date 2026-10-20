import Link from "next/link";
import { Icon, Segmented } from "@/components/ui";
import { shiftMonth, type MonthKey } from "@/lib/finance/dates";
import { formatMonthLabel, formatMonthName } from "@/lib/finance/format";
import type { HistoryFilter } from "@/lib/finance/queries";
import { financeHref } from "./href";

const STEP_LINK =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink md:size-9 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Filtro de período (referência: pílulas à esquerda + seletor de datas à direita). Atalhos
 * "Este mês / Mês anterior / Há 2 meses" em pílula e, à direita, o seletor ‹ mês › para qualquer
 * mês. Estado na URL (`?mes=`), preservando o filtro do histórico.
 */
export default function MonthNav({
  month,
  currentMonth,
  status,
}: {
  month: MonthKey;
  currentMonth: MonthKey;
  status: HistoryFilter;
}) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const shortcuts = [
    { id: currentMonth, label: "Este mês" },
    { id: shiftMonth(currentMonth, -1), label: "Mês anterior" },
    { id: shiftMonth(currentMonth, -2), label: cap(formatMonthName(shiftMonth(currentMonth, -2))) },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        label="Período"
        value={month}
        items={shortcuts.map((s) => ({
          id: s.id,
          label: s.label,
          href: financeHref({ month: s.id === currentMonth ? undefined : s.id, status }),
        }))}
      />
      <nav
        aria-label="Mês do financeiro"
        className="flex items-center gap-1 rounded-full border border-line-strong bg-surface-sunken px-1.5 py-1"
      >
        <Link
          href={financeHref({ month: prev, status })}
          className={STEP_LINK}
          aria-label={`Mês anterior: ${formatMonthLabel(prev)}`}
          title={`Mês anterior (${formatMonthName(prev)})`}
        >
          <Icon name="chevron" size={16} className="rotate-180" />
        </Link>
        <p
          aria-live="polite"
          className="flex min-w-36 items-center justify-center gap-2 text-center text-sm font-semibold text-ink first-letter:uppercase"
        >
          <Icon name="calendar" size={16} className="text-ink-muted" />
          <span className="first-letter:uppercase">{formatMonthLabel(month)}</span>
        </p>
        <Link
          href={financeHref({ month: next, status })}
          className={STEP_LINK}
          aria-label={`Próximo mês: ${formatMonthLabel(next)}`}
          title={`Próximo mês (${formatMonthName(next)})`}
        >
          <Icon name="chevron" size={16} />
        </Link>
      </nav>
    </div>
  );
}
