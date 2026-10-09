import type { ClientPaymentStatus } from "@/lib/repository";
import type { PaymentStatus } from "@/lib/finance/metrics";
import { BADGE_BASE, StateBadge } from "../avaliacoes/evaluation-ui";
import PaymentBadge from "../financeiro/payment-badge";
import { TRACKING_LABEL, type TrackingState } from "./student-situation";

/**
 * Badges de status compartilhados entre a lista de alunos (`client-row.tsx`) e o perfil do aluno
 * (`[id]/student-header.tsx` e `[id]/page.tsx`) — mesmos rótulos/cores nos dois lugares, uma única
 * fonte. Os dois lugares recebem o estado de `buildStudentEntry` (`student-situation.ts`), então
 * nunca divergem.
 *
 * Regra de UX (itens 9 e 11 do TODO master): NUNCA misturar status de acompanhamento com status
 * financeiro num mesmo grupo visual — quem usa estes badges é quem separa em áreas distintas.
 *
 *  - Acompanhamento: `TrackingStatusBadge` (ciclo de avaliação + convite + pausa). O vocabulário
 *    do ciclo vem de `avaliacoes/evaluation-ui` (mesmo de `/coach/avaliacoes`).
 *  - Financeiro: `PaymentStatusBadge` delega ao badge do Financeiro ("Pagamento em dia / pendente
 *    / atrasado") — mesma linguagem nas duas telas.
 */

/** ClientPaymentStatus (lib/repository) -> PaymentStatus (Financeiro). `sem_assinatura` não tem equivalente. */
const PAYMENT_TO_FINANCE: Record<Exclude<ClientPaymentStatus, "sem_assinatura">, PaymentStatus> = {
  em_dia: "paid",
  pendente: "pending",
  atrasado: "overdue",
};

/** Financeiro. `sem_assinatura` é neutro: não é dívida, só ausência de cobrança. */
export function PaymentStatusBadge({ status }: { status: ClientPaymentStatus }) {
  if (status === "sem_assinatura") {
    return (
      <span className={`${BADGE_BASE} inline-flex w-fit whitespace-nowrap bg-surface-sunken text-ink-muted`}>
        Sem assinatura
      </span>
    );
  }
  return <PaymentBadge status={PAYMENT_TO_FINANCE[status]} />;
}

/**
 * Situação do ACOMPANHAMENTO (lista de alunos e perfil do aluno). Os cinco estados do ciclo usam o mesmo badge
 * de `/coach/avaliacoes`; convite e pausa (fora do ciclo) têm badge próprio. Check-in atrasado
 * mantém o rótulo "Aguardando check-in" mas ganha a cor de atraso.
 */
export function TrackingStatusBadge({ state, late = false }: { state: TrackingState; late?: boolean }) {
  switch (state) {
    case "pending":
    case "in_progress":
    case "draft":
    case "done":
      return <StateBadge state={state} />;
    case "awaiting_checkin":
      return late ? (
        <span className={`${BADGE_BASE} whitespace-nowrap bg-late-tint text-late-text`}>{TRACKING_LABEL[state]}</span>
      ) : (
        <StateBadge state={state} />
      );
    case "invite_pending":
      return <span className={`${BADGE_BASE} whitespace-nowrap bg-surface-sunken text-ink-muted`}>{TRACKING_LABEL[state]}</span>;
    case "invite_sent":
      return <span className={`${BADGE_BASE} whitespace-nowrap bg-warn-tint text-warn`}>{TRACKING_LABEL[state]}</span>;
    case "paused":
      return <span className={`${BADGE_BASE} whitespace-nowrap bg-surface-sunken text-ink-muted`}>{TRACKING_LABEL[state]}</span>;
  }
}
