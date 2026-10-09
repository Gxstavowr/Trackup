import Link from "next/link";
import type { ReactNode } from "react";
import {
  BUTTON_GHOST,
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  ChargeCheckinButton,
  OrientationReadyButton,
  evaluationHref,
  formatDateOnlyShort,
} from "../../avaliacoes/evaluation-ui";
import ChargeButton from "../../financeiro/charge-button";
import { TrackingIcon, WalletIcon } from "../icons";
import { PaymentStatusBadge, TrackingStatusBadge } from "../status-badges";
import { PRIMARY_ACTION_LABEL, formatAge, formatHeight } from "../student-situation";
import CopyInviteButton from "./copy-invite-button";
import type { StudentContext } from "./student-context";

const PANEL = "flex min-w-0 flex-col gap-2 rounded-md border border-line p-3";
const PANEL_TITLE =
  "flex items-center gap-1.5 font-mono text-label uppercase tracking-widest text-ink-faint";
const FIELD_LABEL = "font-mono text-label uppercase tracking-wide text-ink-faint";

/**
 * Botão principal ("próxima ação") do perfil: sai da MESMA regra e dos MESMOS rótulos da lista de
 * Alunos (`buildStudentEntry` -> `entry.primary`). Diferenças de contexto, já dentro do aluno:
 *  - "Cobrar pagamento" sem detalhe da cobrança leva pra aba Pagamentos (na lista, pro Financeiro);
 *  - "Ver acompanhamento" (ciclo concluído) vira "Ver avaliação" -> aba Avaliação; pausado não tem
 *    ação nenhuma, então não há botão (a explicação aparece no lugar).
 */
function renderPrimaryAction(ctx: StudentContext): ReactNode {
  const { client, entry } = ctx;
  const { primary, tracking, payment } = entry;
  const className = entry.needsAction ? BUTTON_PRIMARY : primary === "view_tracking" ? BUTTON_GHOST : BUTTON_OUTLINE;

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
          Ver avaliação
        </Link>
      ) : null;
  }
}

/**
 * Faixa de contexto do aluno, persistente em todas as abas (`/coach/alunos/[id]/*`):
 *  - quem é: nome + idade + altura, objetivo atual;
 *  - ACOMPANHAMENTO: situação da semana (mesmo rótulo da lista) — área própria;
 *  - FINANCEIRO: situação de pagamento — outra área, nunca misturada com a de acompanhamento;
 *  - UM botão principal "Próxima ação" (retorno rápido à avaliação quando é o caso).
 */
export default function StudentHeader({ ctx }: { ctx: StudentContext }) {
  const { client, entry, evaluation } = ctx;
  const { tracking, payment } = entry;
  const identity = [formatAge(entry.age), formatHeight(entry.heightCm)].filter(Boolean).join(" · ");
  const action = renderPrimaryAction(ctx);

  return (
    <section
      aria-label={`Contexto de ${client.name}`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-[var(--surface-raised-shadow)] sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:grid-rows-[auto_1fr] lg:gap-x-6"
    >
      {/* Quem é */}
      <div className="flex min-w-0 flex-col gap-2 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words font-display text-hero text-ink">{client.name}</h1>
          <p className="text-sm text-ink-muted">{identity || "Idade e altura não informadas"}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={FIELD_LABEL}>Objetivo atual</span>
          <span className="break-words text-sm text-ink">
            {entry.objective ?? <span className="text-ink-faint">Não informado no cadastro</span>}
          </span>
        </div>
      </div>

      {/* Próxima ação: UM botão. No celular vem logo depois de quem é; no desktop, coluna da direita. */}
      <div className="flex flex-col gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-center lg:border-l lg:border-line lg:pl-6">
        <span className={FIELD_LABEL}>Próxima ação</span>
        {action ?? <p className="text-sm text-ink-muted">{tracking.nextAction}</p>}
        {tracking.state === "done" && (
          // Ciclo concluído nesta semana: ponto de apoio pra avisar o aluno pelo WhatsApp que a
          // orientação já está disponível (item 28 do TODO) — nunca automático.
          <OrientationReadyButton
            client={{ id: client.id, name: client.name, phone: client.phone }}
            weekNumber={tracking.weekNumber ?? 1}
            className={BUTTON_GHOST}
          />
        )}
      </div>

      {/* Situação: acompanhamento e financeiro, em áreas separadas. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:col-start-1 lg:row-start-2">
        <section aria-label="Acompanhamento" className={PANEL}>
          <h2 className={PANEL_TITLE}>
            <TrackingIcon />
            Acompanhamento
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TrackingStatusBadge state={tracking.state} late={tracking.late} />
          </div>
          {evaluation && (
            <span className="text-xs text-ink-faint">
              Semana {evaluation.weekNumber} · {formatDateOnlyShort(evaluation.periodStart)} a{" "}
              {formatDateOnlyShort(evaluation.periodEnd)}
            </span>
          )}
        </section>

        <section aria-label="Financeiro" className={PANEL}>
          <h2 className={PANEL_TITLE}>
            <WalletIcon />
            Financeiro
          </h2>
          <div>
            <PaymentStatusBadge status={payment.status} />
          </div>
        </section>
      </div>
    </section>
  );
}
