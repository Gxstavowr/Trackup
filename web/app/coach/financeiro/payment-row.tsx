import Link from "next/link";
import { formatBRL, formatDateOnly } from "@/lib/finance/format";
import { PERIOD_LABEL } from "@/lib/finance/metrics";
import type { FinancePayment } from "@/lib/finance/queries";
import ChargeButton from "./charge-button";
import MarkPaidButton from "./mark-paid-button";
import PaymentBadge from "./payment-badge";
import { BUTTON_OUTLINE, BUTTON_PRIMARY } from "./ui";

export type RowVariant = "late" | "upcoming" | "history";

const METHOD_LABEL: Record<string, string> = {
  manual: "Manual",
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dueLabel(payment: FinancePayment): { text: string; late: boolean } {
  if (payment.status === "overdue") {
    return {
      text: `Venceu em ${formatDateOnly(payment.dueDate)} · ${plural(payment.daysLate, "dia", "dias")} de atraso`,
      late: true,
    };
  }
  const n = payment.daysUntilDue;
  const when = n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
  return { text: `Vence em ${formatDateOnly(payment.dueDate)} · ${when}`, late: false };
}

/**
 * Uma cobrança. Mobile: card empilhado (aluno/plano -> valor/data -> ações). Desktop (xl+):
 * três colunas (identificação | valor+data | ações). Não é uma `<table>` de propósito — o
 * mesmo markup vira card no celular sem duplicar conteúdo. Em `md` (tablet) a sidebar do coach
 * deixa só ~530px de conteúdo: as três colunas não cabem (nem em `lg`, ~700px), então o card
 * segue empilhado até `xl`.
 */
export default function PaymentRow({
  payment,
  variant,
}: {
  payment: FinancePayment;
  variant: RowVariant;
}) {
  const open = payment.status === "overdue" || payment.status === "pending";
  // Ações só nas listas de trabalho (Atrasados/Próximas). O histórico é leitura: sem 50 pares de
  // botões; o nome do aluno leva à aba Pagamento dele.
  const showActions = open && variant !== "history";

  let detail: { text: string; late: boolean };
  if (variant === "history" && !open) {
    const parts = [`Vencimento ${formatDateOnly(payment.dueDate)}`];
    if (payment.paidDate) parts.push(`pago em ${formatDateOnly(payment.paidDate)}`);
    if (payment.method) parts.push(METHOD_LABEL[payment.method] ?? payment.method);
    detail = { text: parts.join(" · "), late: false };
  } else {
    detail = dueLabel(payment);
  }

  return (
    <li
      className={`flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0 xl:grid xl:items-center xl:gap-6 ${
        payment.status === "overdue" ? "border-l-4 border-l-danger bg-danger-tint/40" : ""
      } ${
        showActions ? "xl:grid-cols-[minmax(0,1fr)_auto_auto]" : "xl:grid-cols-[minmax(0,1fr)_auto]"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            href={`/coach/alunos/${payment.client.id}/pagamento`}
            className="inline-flex min-h-11 min-w-0 max-w-full items-center break-words font-medium text-ink hover:text-brand"
          >
            {payment.client.name}
          </Link>
          <PaymentBadge status={payment.status} />
        </div>
        <span className="text-sm text-ink-muted">
          {payment.planName} · {PERIOD_LABEL[payment.period]}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 xl:items-end xl:text-right">
        <span className={`whitespace-nowrap font-display text-xl font-bold tabular-nums ${payment.status === "overdue" ? "text-danger-text" : "text-ink"}`}>
          {formatBRL(payment.amountCents)}
        </span>
        <span className={`text-xs ${detail.late ? "font-semibold text-danger-text" : "text-ink-muted"}`}>{detail.text}</span>
      </div>

      {showActions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start xl:shrink-0 xl:justify-end">
          <ChargeButton payment={payment} className={variant === "late" ? BUTTON_PRIMARY : BUTTON_OUTLINE} />
          <MarkPaidButton paymentId={payment.id} clientName={payment.client.name} secondary={variant === "late"} />
        </div>
      ) : null}
    </li>
  );
}
