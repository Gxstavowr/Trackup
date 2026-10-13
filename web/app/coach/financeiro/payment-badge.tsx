import type { PaymentStatus } from "@/lib/finance/metrics";
import { Badge, type BadgeTone } from "@/components/ui/badge";

/**
 * Badge de status de UMA cobrança. Vocabulário próprio do Financeiro ("Pagamento em dia /
 * pendente / atrasado") — nunca as palavras de acompanhamento/avaliação (check-in, avaliado…).
 */

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: "Pagamento em dia",
  pending: "Pagamento pendente",
  overdue: "Pagamento atrasado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento estornado",
};

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  paid: "success",
  pending: "warning",
  overdue: "danger",
  cancelled: "neutral",
  refunded: "neutral",
};

export default function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONE[status]} dot className="whitespace-nowrap">
      {PAYMENT_LABEL[status]}
    </Badge>
  );
}
