import Link from "next/link";
import { formatBRL, formatDateOnly } from "@/lib/finance/format";
import { PERIOD_LABEL } from "@/lib/finance/metrics";
import type { FinancePayment } from "@/lib/finance/queries";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { PaymentStatus } from "@/lib/finance/metrics";
import { CARD } from "./ui";

const METHOD_LABEL: Record<string, string> = {
  manual: "Manual",
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};

/** Rótulo curto para a coluna "Situação" da tabela (o cabeçalho já diz que é do pagamento). */
const SHORT: Record<PaymentStatus, [string, BadgeTone]> = {
  paid: ["Em dia", "success"],
  pending: ["Pendente", "warning"],
  overdue: ["Atrasado", "danger"],
  cancelled: ["Cancelado", "neutral"],
  refunded: ["Estornado", "neutral"],
};

function settlement(p: FinancePayment): string {
  if (p.paidDate) {
    const method = p.method ? ` · ${METHOD_LABEL[p.method] ?? p.method}` : "";
    return `Pago em ${formatDateOnly(p.paidDate)}${method}`;
  }
  if (p.status === "overdue") return `${p.daysLate} ${p.daysLate === 1 ? "dia" : "dias"} de atraso`;
  if (p.status === "pending") {
    const n = p.daysUntilDue;
    return n === 0 ? "Vence hoje" : n === 1 ? "Vence amanhã" : `Vence em ${n} dias`;
  }
  return "—";
}

/**
 * Histórico de pagamentos (somente leitura). Desktop (`xl+`): tabela densa de verdade, com
 * colunas Aluno | Plano | Vencimento | Pagamento | Situação | Valor. Celular: lista compacta de
 * duas linhas por cobrança. As ações (cobrar / marcar como pago) ficam nas listas de trabalho
 * (Atrasados / Próximas) — aqui é só consulta, e o nome leva à aba Pagamento do aluno.
 */
export default function HistoryTable({ rows }: { rows: FinancePayment[] }) {
  return (
    <div className={`overflow-hidden ${CARD}`}>
      {/* Desktop */}
      <table className="hidden w-full table-fixed text-sm xl:table">
        <caption className="sr-only">Histórico de pagamentos dos seus alunos</caption>
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[22%]" />
          <col className="w-[11%]" />
          <col className="w-[24%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left">
            {["Aluno", "Plano", "Vencimento", "Pagamento", "Situação"].map((h) => (
              <th key={h} scope="col" className="t-label px-4 py-3 font-semibold text-ink-faint">
                {h}
              </th>
            ))}
            <th scope="col" className="t-label px-4 py-3 text-right font-semibold text-ink-faint">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const late = p.status === "overdue";
            return (
              <tr
                key={p.id}
                className={`border-b border-line last:border-b-0 hover:bg-surface-raised ${late ? "bg-danger-tint/30" : ""}`}
              >
                <td className="px-4 py-2.5">
                  <Link
                    href={`/coach/alunos/${p.client.id}/pagamento`}
                    className="block truncate font-medium text-ink hover:text-brand"
                  >
                    {p.client.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-ink-muted">
                  <span className="block truncate" title={`${p.planName} · ${PERIOD_LABEL[p.period]}`}>
                    {p.planName}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-muted">{formatDateOnly(p.dueDate)}</td>
                <td title={settlement(p)} className={`truncate px-4 py-2.5 ${late ? "font-semibold text-danger-text" : "text-ink-muted"}`}>
                  {settlement(p)}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={SHORT[p.status][1]} dot className="whitespace-nowrap">
                    {SHORT[p.status][0]}
                  </Badge>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right font-display font-bold tabular-nums ${late ? "text-danger-text" : "text-ink"}`}
                >
                  {formatBRL(p.amountCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Celular / tablet */}
      <ul className="flex flex-col xl:hidden">
        {rows.map((p) => {
          const late = p.status === "overdue";
          return (
            <li
              key={p.id}
              className={`flex flex-col gap-1 border-b border-line px-4 py-3 last:border-b-0 ${late ? "border-l-4 border-l-danger bg-danger-tint/30" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href={`/coach/alunos/${p.client.id}/pagamento`}
                  className="min-w-0 truncate py-1 font-medium text-ink hover:text-brand"
                >
                  {p.client.name}
                </Link>
                <span className={`shrink-0 font-display font-bold tabular-nums ${late ? "text-danger-text" : "text-ink"}`}>
                  {formatBRL(p.amountCents)}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className={`text-xs ${late ? "font-semibold text-danger-text" : "text-ink-muted"}`}>
                  Venc. {formatDateOnly(p.dueDate)} · {settlement(p)}
                </span>
                <Badge tone={SHORT[p.status][1]} dot className="whitespace-nowrap">
                  {SHORT[p.status][0]}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
