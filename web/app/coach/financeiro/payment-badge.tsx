import type { PaymentStatus } from "@/lib/finance/metrics";

/**
 * Badge de status de UMA cobrança. Vocabulário próprio do Financeiro ("Pagamento em dia /
 * pendente / atrasado") — nunca as palavras de acompanhamento/avaliação (check-in, avaliado…).
 */

const BADGE_BASE =
  "inline-flex w-fit items-center whitespace-nowrap rounded-full px-3 py-1 font-mono text-xs uppercase tracking-wide";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: "Pagamento em dia",
  pending: "Pagamento pendente",
  overdue: "Pagamento atrasado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento estornado",
};

const PAYMENT_CLASS: Record<PaymentStatus, string> = {
  paid: "bg-ok-tint text-ok",
  pending: "bg-warn-tint text-warn",
  overdue: "bg-late-tint text-late-text",
  cancelled: "bg-surface-sunken text-ink-muted",
  refunded: "bg-surface-sunken text-ink-muted",
};

export default function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`${BADGE_BASE} ${PAYMENT_CLASS[status]}`}>{PAYMENT_LABEL[status]}</span>;
}
