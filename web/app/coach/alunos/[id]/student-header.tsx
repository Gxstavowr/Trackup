import Link from "next/link";
import type { ReactNode } from "react";
import {
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  ChargeCheckinButton,
  ContactWhatsappButton,
  OrientationReadyButton,
  evaluationHref,
  formatDateOnlyShort,
} from "../../avaliacoes/evaluation-ui";
import ChargeButton from "../../financeiro/charge-button";
import { buttonClass } from "@/components/ui/button";
import { TrackingIcon, WalletIcon } from "../icons";
import { PaymentStatusBadge, TrackingStatusBadge } from "../status-badges";
import { PRIMARY_ACTION_LABEL, formatAge, formatHeight } from "../student-situation";
import CopyInviteButton from "./copy-invite-button";
import type { StudentContext } from "./student-context";

/**
 * Botão principal ("próxima ação") do perfil: sai da MESMA regra e dos MESMOS rótulos da lista de
 * Alunos (`buildStudentEntry` -> `entry.primary`). Diferenças de contexto, já dentro do aluno:
 *  - "Cobrar pagamento" sem detalhe da cobrança leva pra aba Pagamentos (na lista, pro Financeiro);
 *  - "Ver acompanhamento" (ciclo concluído) leva à aba Avaliação (mesmo rótulo da lista); pausado não tem
 *    ação nenhuma, então não há botão (a explicação aparece no lugar).
 */
function renderPrimaryAction(ctx: StudentContext): ReactNode {
  const { client, entry } = ctx;
  const { primary, tracking, payment } = entry;
  const className = entry.needsAction ? BUTTON_PRIMARY : BUTTON_OUTLINE;

  switch (primary) {
    case "open_evaluation":
    case "continue_evaluation":
    case "finish_orientation":
      return (
        <Link href={evaluationHref(client.id)} className={className}>
          {PRIMARY_ACTION_LABEL[primary]}
        </Link>
      );
    case "charge_checkin":
      return (
        <ChargeCheckinButton
          client={{ id: client.id, name: client.name, phone: client.phone }}
          weekNumber={tracking.weekNumber ?? 1}
          late={tracking.late}
          className={className}
        />
      );
    case "charge_payment":
      return payment.latePayment ? (
        <ChargeButton payment={payment.latePayment} className={className} />
      ) : (
        <Link href={`/coach/alunos/${client.id}/pagamento`} className={className}>
          {PRIMARY_ACTION_LABEL.charge_payment}
        </Link>
      );
    case "copy_invite":
      return <CopyInviteButton url={entry.inviteUrl} className={className} />;
    case "view_tracking":
      return tracking.state === "done" ? (
        <Link href={evaluationHref(client.id)} className={className}>
          {PRIMARY_ACTION_LABEL.view_tracking}
        </Link>
      ) : null;
  }
}

/**
 * Faixa de contexto do aluno, compacta e persistente em todas as abas (`/coach/alunos/[id]/*`):
 *  - quem é: nome + idade + altura e objetivo atual;
 *  - situação da semana (acompanhamento) e do pagamento — áreas distintas, em linha;
 *  - UM botão principal de próxima ação (mesmos rótulos da lista de Alunos).
 */
export default function StudentHeader({ ctx }: { ctx: StudentContext }) {
  const { client, entry, evaluation } = ctx;
  const { tracking, payment } = entry;
  const identity = [formatAge(entry.age), formatHeight(entry.heightCm)].filter(Boolean).join(" · ");
  const action = renderPrimaryAction(ctx);

  return (
    <section
      aria-label={`Contexto de ${client.name}`}
      className="flex flex-col gap-3 card p-4 shadow-[var(--surface-raised-shadow)] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h1 className="min-w-0 break-words font-display text-hero text-ink">{client.name}</h1>
          <p className="text-sm text-ink-muted">{identity || "Idade e altura não informadas"}</p>
        </div>
        <p className="break-words text-sm text-ink-muted">
          <span className="t-label text-ink-faint">Objetivo </span>
          {entry.objective ??
            (entry.onboarding?.receivedAt ? (
              // Aluno V5: o objetivo veio no questionário inicial — não pedir de novo ao coach.
              <Link href={`/coach/alunos/${client.id}/questionario`} className="font-medium text-brand hover:underline">
                ver no questionário inicial
              </Link>
            ) : (
              <span className="text-ink-faint">não informado no cadastro</span>
            ))}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <TrackingIcon />
            <TrackingStatusBadge state={tracking.state} late={tracking.late} />
          </span>
          {evaluation && (
            <span className="text-xs text-ink-faint">
              Semana {evaluation.weekNumber} · {formatDateOnlyShort(evaluation.periodStart)} a{" "}
              {formatDateOnlyShort(evaluation.periodEnd)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <WalletIcon />
            <PaymentStatusBadge status={payment.status} />
          </span>
        </div>
      </div>

      {/* Próxima ação: UM botão principal. */}
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        {action ?? <p className="text-sm text-ink-muted sm:max-w-56 sm:text-right">{tracking.nextAction}</p>}
        {tracking.state !== "done" && (
          <ContactWhatsappButton client={{ id: client.id, name: client.name, phone: client.phone }} />
        )}
        {tracking.state === "done" && (
          // Ciclo concluído: apoio pra avisar o aluno pelo WhatsApp que a orientação está
          // disponível (item 28 do TODO) — nunca automático.
          <OrientationReadyButton
            client={{ id: client.id, name: client.name, phone: client.phone }}
            weekNumber={tracking.weekNumber ?? 1}
            className={buttonClass({ variant: "tertiary", width: "mobile" })}
          />
        )}
      </div>
    </section>
  );
}
