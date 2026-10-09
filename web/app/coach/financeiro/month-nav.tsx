import Link from "next/link";
import { shiftMonth, type MonthKey } from "@/lib/finance/dates";
import { formatMonthLabel, formatMonthName } from "@/lib/finance/format";
import type { HistoryFilter } from "@/lib/finance/queries";
import { financeHref } from "./href";
import { BUTTON_OUTLINE } from "./ui";

const STEP_LINK =
  "inline-flex size-11 items-center justify-center rounded-md border border-line text-ink transition-colors hover:border-brand " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Seletor simples de mês: anterior / próximo (+ voltar pro mês atual). Estado na URL. */
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

  return (
    <nav aria-label="Mês do financeiro" className="flex flex-wrap items-center gap-2">
      <Link
        href={financeHref({ month: prev, status })}
        className={STEP_LINK}
        aria-label={`Mês anterior: ${formatMonthLabel(prev)}`}
        title={`Mês anterior (${formatMonthName(prev)})`}
      >
        <span aria-hidden>‹</span>
      </Link>
      <p
        aria-live="polite"
        className="min-w-40 text-center font-display text-lg text-ink first-letter:uppercase"
      >
        {formatMonthLabel(month)}
      </p>
      <Link
        href={financeHref({ month: next, status })}
        className={STEP_LINK}
        aria-label={`Próximo mês: ${formatMonthLabel(next)}`}
        title={`Próximo mês (${formatMonthName(next)})`}
      >
        <span aria-hidden>›</span>
      </Link>
      {month !== currentMonth && (
        <Link href={financeHref({ status })} className={BUTTON_OUTLINE}>
          Mês atual
        </Link>
      )}
    </nav>
  );
}
