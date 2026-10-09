import { formatBRL, formatDateShort, firstName, whatsappDigits } from "@/lib/finance/format";
import type { FinancePayment } from "@/lib/finance/queries";
import { BUTTON_DISABLED, BUTTON_OUTLINE } from "./ui";

/**
 * "Cobrar pagamento": abre o WhatsApp com uma mensagem curta pronta quando o aluno tem
 * telefone (`clients.phone`). Sem telefone (ou inválido) vira botão DESABILITADO com a
 * explicação ao lado — nunca um link que não leva a lugar nenhum. Não grava nada: é só um
 * `wa.me` aberto em nova aba.
 */
export default function ChargeButton({
  payment,
  className = BUTTON_OUTLINE,
}: {
  payment: FinancePayment;
  /** Aparência do botão habilitado (default: contorno). A lista de alunos passa o estilo dela. */
  className?: string;
}) {
  const digits = whatsappDigits(payment.client.phone);

  if (!digits) {
    const reason = payment.client.phone
      ? "Telefone inválido no cadastro."
      : "Aluno sem telefone cadastrado.";
    return (
      <div className="flex flex-col gap-1 sm:items-end">
        <button type="button" disabled aria-describedby={`no-phone-${payment.id}`} className={BUTTON_DISABLED}>
          Cobrar pagamento
        </button>
        <p id={`no-phone-${payment.id}`} className="text-xs text-ink-faint sm:text-right">
          {reason}
        </p>
      </div>
    );
  }

  const when =
    payment.status === "overdue"
      ? `que venceu em ${formatDateShort(payment.dueDate)}`
      : `com vencimento em ${formatDateShort(payment.dueDate)}`;
  const message =
    `Oi, ${firstName(payment.client.name)}! Passando para lembrar do pagamento do plano ` +
    `${payment.planName} (${formatBRL(payment.amountCents)}), ${when}. ` +
    `Se já pagou, é só me avisar. Obrigado!`;

  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      Cobrar pagamento
      <span className="sr-only"> de {payment.client.name} pelo WhatsApp (abre em nova aba)</span>
    </a>
  );
}
