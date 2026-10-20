import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { ProtocolDueBadge, TrackingStatusBadge } from "./status-badges";
import {
  BUCKET_LABEL,
  firstMissingModuleSegment,
  formatInstantDay,
  type StudentEntry,
} from "./student-situation";

/**
 * Linha compacta da fila "Novos cadastros". Mostra só o que a fila precisa (estágio, pacote,
 * recebimento, prazo) e as duas ações do onboarding — não repete a linha completa de Alunos.
 * Nunca recebe respostas do questionário.
 */
export default function QueueRow({ entry }: { entry: StudentEntry }) {
  const onb = entry.onboarding;
  if (!onb || !onb.bucket) return null;
  const profile = `/coach/alunos/${entry.id}`;
  const received = formatInstantDay(onb.receivedAt);
  const due = formatInstantDay(onb.dueAt);
  const awaitingProtocol = onb.bucket === "awaiting_protocol";
  const moduleSegment = firstMissingModuleSegment(onb);
  // Questionário recém-recebido: abrir é a ação principal; depois, preparar o protocolo.
  const openIsPrimary = onb.stage === "questionnaire_submitted";

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border border-l-4 border-line bg-surface px-4 py-3.5 transition-colors hover:border-line-strong sm:flex-row sm:items-center sm:justify-between ${
        awaitingProtocol ? (onb.overdue ? "border-l-late" : "border-l-brand") : "border-l-transparent"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            href={profile}
            className="break-words text-base font-semibold leading-snug text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            {entry.name}
          </Link>
          <TrackingStatusBadge state={entry.tracking.state} late={entry.tracking.late} />
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5 text-[0.8125rem] leading-snug text-ink-muted">
          <div className="flex gap-1">
            <dt className="text-ink-faint">Pacote:</dt>
            <dd>{onb.packageLabel ?? "Sem pacote"}</dd>
          </div>
          {awaitingProtocol && received && (
            <div className="flex gap-1">
              <dt className="text-ink-faint">Questionário recebido em:</dt>
              <dd>{received}</dd>
            </div>
          )}
          {!awaitingProtocol && (
            <div className="flex gap-1">
              <dt className="text-ink-faint">Fila:</dt>
              <dd>{BUCKET_LABEL[onb.bucket]}</dd>
            </div>
          )}
        </dl>
        {awaitingProtocol && due && <ProtocolDueBadge overdue={onb.overdue} dueLabel={due} />}
        {!awaitingProtocol && (
          <p className="text-[0.8125rem] leading-snug text-ink-muted">{entry.tracking.nextAction}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {awaitingProtocol ? (
          <>
            <Link
              href={`${profile}/questionario`}
              className={buttonClass({ variant: openIsPrimary ? "primary" : "secondary", size: "sm" })}
            >
              Abrir questionário
              <span className="sr-only"> — {entry.name}</span>
            </Link>
            <Link
              href={moduleSegment ? `${profile}/${moduleSegment}` : profile}
              className={buttonClass({ variant: openIsPrimary ? "secondary" : "primary", size: "sm" })}
            >
              Preparar protocolo
              <span className="sr-only"> — {entry.name}</span>
            </Link>
          </>
        ) : (
          <Link href={profile} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Abrir perfil
            <span className="sr-only"> — {entry.name}</span>
          </Link>
        )}
      </div>
    </li>
  );
}
