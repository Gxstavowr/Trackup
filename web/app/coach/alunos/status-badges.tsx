import type { ClientPaymentStatus } from "@/lib/repository";
import type { PaymentStatus } from "@/lib/finance/metrics";
import { Badge } from "@/components/ui/badge";
import { SITUATION_META } from "@/lib/evaluation-situation";
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
      <Badge tone="neutral" className="whitespace-nowrap">Sem assinatura</Badge>
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
    case "done": {
      const key = { pending: "review_pending", in_progress: "review_in_progress", draft: "awaiting_orientation", done: "done" } as const;
      const meta = SITUATION_META[key[state]];
      return <Badge tone={meta.tone} dot className="whitespace-nowrap">{meta.label}</Badge>;
    }
    case "awaiting_checkin": {
      // Mesmo nome e tom do /coach e /coach/avaliacoes (SITUATION_META).
      const meta = SITUATION_META[late ? "checkin_late" : "checkin_waiting"];
      return <Badge tone={meta.tone} dot className="whitespace-nowrap">{meta.label}</Badge>;
    }
    case "invite_pending":
      return <Badge tone="neutral" className="whitespace-nowrap">{TRACKING_LABEL[state]}</Badge>;
    case "invite_sent":
      return <Badge tone="warning" className="whitespace-nowrap">{TRACKING_LABEL[state]}</Badge>;
    case "paused":
      return <Badge tone="neutral" className="whitespace-nowrap">{TRACKING_LABEL[state]}</Badge>;
    // Cadastro novo (V5): cada estágio tem rótulo próprio. Convite (sem conta) e questionário (com
    // conta) usam tons diferentes; "recebido" (a montar) nunca se parece com "pronto" (verde).
    case "invite_failed":
      return <Badge tone="danger" dot className="whitespace-nowrap">{TRACKING_LABEL[state]}</Badge>;
    case "invite_accepted":
    case "account_created":
    case "questionnaire_pending":
      return <Badge tone="info" dot className="whitespace-nowrap">{TRACKING_LABEL[state]}</Badge>;
    case "questionnaire_submitted":
    case "protocol_preparing":
    case "protocol_partial":
      return (
        <Badge tone={late ? "danger" : "warning"} dot className="whitespace-nowrap">
          {TRACKING_LABEL[state]}
          {late && " · atrasado"}
        </Badge>
      );
  }
}

/** Selo de prazo do protocolo (fila "Novos cadastros"). */
export function ProtocolDueBadge({ overdue, dueLabel }: { overdue: boolean; dueLabel: string }) {
  return (
    <Badge tone={overdue ? "danger" : "neutral"} className="whitespace-nowrap">
      {overdue ? `Atrasado desde ${dueLabel}` : `Prazo ${dueLabel}`}
    </Badge>
  );
}
