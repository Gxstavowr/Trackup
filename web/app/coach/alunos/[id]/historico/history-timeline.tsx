"use client";

import { useState } from "react";
import type { StudentTimeline, TimelineEvent, TimelineGoal, TimelineWeek } from "@/lib/history";
import { formatDateOnlyShort, formatDateTime } from "../../../avaliacoes/evaluation-ui";

/**
 * Timeline do histórico do aluno (item 16 do TODO) — uma linha por semana, mais recente
 * primeiro, com "Início do acompanhamento" no fim. Cada semana é um cartão FECHADO por padrão:
 * o cabeçalho (semana + período + resumo em selos) já responde "o que aconteceu essa semana"
 * sem abrir nada; clicar abre os detalhes (check-in, avaliação, orientação inteira, metas,
 * eventos) — "abrir detalhes sob demanda", não tudo exposto de uma vez.
 *
 * Client Component só por causa do estado de aberto/fechado; todo o dado já vem pronto do
 * servidor (`getStudentTimeline`, `lib/history.ts`).
 */
export default function HistoryTimeline({ timeline }: { timeline: StudentTimeline }) {
  const { weeks, unmatchedEvents, joinedAt } = timeline;
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set());

  function toggle(week: number) {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {unmatchedEvents.length > 0 && (
        <section aria-label="Outros eventos" className="flex flex-col gap-2">
          <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">Outros eventos</h2>
          <ul className="flex flex-col gap-2">
            {unmatchedEvents.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="flex flex-col gap-3">
        {weeks.map((week) => (
          <li key={week.weekNumber}>
            <WeekCard week={week} open={openWeeks.has(week.weekNumber)} onToggle={() => toggle(week.weekNumber)} />
          </li>
        ))}
      </ol>

      {joinedAt && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-line px-4 py-3">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-ink-faint" />
          <p className="text-sm text-ink-muted">
            Início do acompanhamento — {formatDateOnlyShort(joinedAt)}
          </p>
        </div>
      )}
    </div>
  );
}

const BADGE = "rounded-full px-2.5 py-0.5 font-mono text-xs uppercase tracking-wide";

function checkinBadge(week: TimelineWeek) {
  if (!week.checkin) return null;
  switch (week.checkin.status) {
    case "reviewed":
      return <span className={`${BADGE} bg-ok-tint text-ok`}>Avaliação concluída</span>;
    case "submitted":
      return <span className={`${BADGE} bg-brand-tint text-brand`}>Check-in enviado</span>;
    case "late":
      return <span className={`${BADGE} bg-warn-tint text-warn`}>Check-in atrasado</span>;
    case "pending":
      return <span className={`${BADGE} bg-surface-sunken text-ink-muted`}>Check-in pendente</span>;
  }
}

/** Cabeçalho compacto de UM cartão de semana — o que já dá pra saber sem abrir. */
function WeekSummary({ week }: { week: TimelineWeek }) {
  const parts: string[] = [];
  if (week.orientation) parts.push("Orientação enviada");
  if (week.goals.length > 0) parts.push(`${week.goals.length} meta${week.goals.length > 1 ? "s" : ""}`);
  if (week.events.length > 0) parts.push(`${week.events.length} evento${week.events.length > 1 ? "s" : ""}`);
  if (week.nutrition && week.nutrition.mealLogsCount > 0) {
    parts.push(
      `${week.nutrition.mealLogsCount} ${week.nutrition.mealLogsCount === 1 ? "refeição registrada" : "refeições registradas"}`
    );
  }
  if (week.nutrition && week.nutrition.waterLoggedDays > 0) {
    parts.push(
      `água em ${week.nutrition.waterLoggedDays} ${week.nutrition.waterLoggedDays === 1 ? "dia" : "dias"}`
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      {checkinBadge(week)}
      {parts.length > 0 && <span className="text-xs text-ink-muted">{parts.join(" · ")}</span>}
    </div>
  );
}

function WeekCard({ week, open, onToggle }: { week: TimelineWeek; open: boolean; onToggle: () => void }) {
  const panelId = `historico-semana-${week.weekNumber}`;
  const hasPeriod = week.periodStart && week.periodEnd;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-[var(--surface-raised-shadow)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-medium text-ink">Semana {week.weekNumber}</span>
          {hasPeriod && (
            <span className="text-sm text-ink-muted">
              {formatDateOnlyShort(week.periodStart)} a {formatDateOnlyShort(week.periodEnd)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <WeekSummary week={week} />
          <ChevronIcon open={open} />
        </div>
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-line px-4 py-4">
          <WeekDetail week={week} />
        </div>
      )}
    </div>
  );
}

function WeekDetail({ week }: { week: TimelineWeek }) {
  const nothing = !week.checkin && !week.orientation && week.goals.length === 0 && week.events.length === 0;
  if (nothing) {
    return <p className="text-sm text-ink-muted">Sem registros nesta semana.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {week.checkin && (
        <DetailBlock title="Check-in">
          <p className="text-sm text-ink">
            {week.checkin.status === "pending" && "Ainda não enviado pelo aluno."}
            {week.checkin.status === "late" && "Atrasado — o aluno ainda não enviou."}
            {(week.checkin.status === "submitted" || week.checkin.status === "reviewed") &&
              week.checkin.submittedAt &&
              `Enviado em ${formatDateTime(week.checkin.submittedAt)}.`}
          </p>
        </DetailBlock>
      )}

      {week.evaluation && (
        <DetailBlock title="Avaliação">
          <p className="text-sm text-ink">Concluída em {formatDateTime(week.evaluation.reviewedAt)}.</p>
        </DetailBlock>
      )}

      {week.orientation && (
        <DetailBlock title="Orientação enviada">
          <p className="text-xs text-ink-muted">{formatDateTime(week.orientation.sentAt)}</p>
          {week.orientation.focus && (
            <p className="text-sm text-ink">
              <span className="text-ink-muted">Foco: </span>
              {week.orientation.focus}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words text-sm text-ink">{week.orientation.text}</p>
        </DetailBlock>
      )}

      {week.goals.length > 0 && (
        <DetailBlock title="Metas">
          <ul className="flex flex-col gap-2">
            {week.goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} />
            ))}
          </ul>
        </DetailBlock>
      )}

      {week.events.length > 0 && (
        <DetailBlock title="Eventos importantes">
          <ul className="flex flex-col gap-2">
            {week.events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}
    </div>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-mono text-label uppercase tracking-widest text-ink-faint">{title}</h3>
      {children}
    </div>
  );
}

const RESULT_LABEL: Record<TimelineGoal["resultStatus"], { label: string; className: string }> = {
  success: { label: "Atingida", className: "bg-ok-tint text-ok" },
  partial: { label: "Parcial", className: "bg-warn-tint text-warn" },
  fail: { label: "Não atingida", className: "bg-late-tint text-late-text" },
  pending: { label: "Em aberto", className: "bg-surface-sunken text-ink-muted" },
};

function formatGoalValue(value: number, unit: string | null): string {
  return `${value.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
}

function GoalRow({ goal }: { goal: TimelineGoal }) {
  const result = RESULT_LABEL[goal.resultStatus];
  return (
    <li className="flex flex-col gap-1 rounded-md border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink">{goal.label}</span>
        <span className={`${BADGE} ${result.className}`}>{result.label}</span>
      </div>
      <p className="text-xs text-ink-muted">
        Meta: {formatGoalValue(goal.targetValue, goal.unit)}
        {goal.resultValue != null && ` · Resultado: ${formatGoalValue(goal.resultValue, goal.unit)}`}
      </p>
      {goal.change ? (
        <p className="text-xs text-brand">
          Meta alterada — na semana {goal.change.previousWeekNumber} era{" "}
          {formatGoalValue(goal.change.previousTargetValue, goal.unit)}
        </p>
      ) : (
        <p className="text-xs text-ink-faint">Meta definida nesta semana.</p>
      )}
    </li>
  );
}

function EventCard({ event }: { event: TimelineEvent }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-ink">{event.title}</span>
        <span className="text-xs text-ink-faint">{formatDateTime(event.date)}</span>
      </div>
      {event.description && <p className="text-sm text-ink-muted">{event.description}</p>}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`size-4 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7.5 10 12.5 15 7.5" />
    </svg>
  );
}
