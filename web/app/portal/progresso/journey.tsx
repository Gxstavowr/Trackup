import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatMetricValue, metricDefs, type ComparisonWeek, type MetricKey } from "@/lib/week-comparison-format";
import type { ProgressCheckin, ProgressGoal } from "@/lib/portal-progress";
import { weekRange } from "./week-label";

const DEFS = metricDefs(true);
/** Registros mostrados por extenso ao abrir a semana (só se houver valor). */
const DETAIL_KEYS: MetricKey[] = ["weight_kg", "waist_cm", "hip_cm", "adherence", "workouts_count"];
const COLLAPSED_AFTER = 6;

const GOAL_LABEL: Record<ProgressGoal["resultStatus"], string> = {
  success: "atingida",
  partial: "parcial",
  fail: "não atingida",
  pending: "em andamento",
};

/** AAAA-MM-DD -> dd/mm/aaaa (sem passar por Date, pra não deslocar o dia por fuso). */
function dateFull(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function dateTimeShort(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

export type JourneyWeek = {
  week: ComparisonWeek;
  checkin: ProgressCheckin | null;
  hasOrientation: boolean;
  /** Quando a avaliação desta semana foi enviada (ISO), se foi. */
  orientationSentAt?: string | null;
  goals: Pick<ProgressGoal, "id" | "label" | "resultStatus">[];
};

/**
 * Histórico semanal (V2 tarefa 26 / V3 tarefa 13): linha do tempo do mais recente ao início do
 * acompanhamento, compacta — cada semana é uma linha com selos (check-in enviado, avaliação
 * concluída, orientação recebida, metas, fotos) que abre para os detalhes. Semanas sem nenhum
 * registro não aparecem. Mostra só registros numéricos e status: NUNCA respostas do check-in
 * (inclusive as sensíveis — ciclo menstrual, hormônios/substâncias).
 */
export default function Journey({
  items,
  currentWeek,
  startDate,
}: {
  items: JourneyWeek[];
  currentWeek: number | null;
  startDate: string | null;
}) {
  const recent = items.slice(0, COLLAPSED_AFTER);
  const older = items.slice(COLLAPSED_AFTER);

  return (
    <ol className="relative flex flex-col before:absolute before:bottom-3 before:left-[0.8rem] before:top-3 before:w-px before:bg-line-strong before:content-['']">
      {recent.map((it, i) => (
        <Node key={it.week.weekNumber} item={it} currentWeek={currentWeek} defaultOpen={i === 0} />
      ))}
      {older.length > 0 && (
        <li className="pl-8">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-brand [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Mostrar {older.length} semanas anteriores</span>
              <span className="hidden group-open:inline">Ocultar semanas anteriores</span>
            </summary>
            <ol className="relative -ml-8 flex flex-col">
              {older.map((it) => (
                <Node key={it.week.weekNumber} item={it} currentWeek={currentWeek} defaultOpen={false} />
              ))}
            </ol>
          </details>
        </li>
      )}
      {startDate && (
        <li className="relative flex min-h-11 flex-col justify-center pl-8">
          <span aria-hidden className="absolute left-[0.4rem] top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-line-strong bg-surface-sunken" />
          <p className="text-sm font-medium text-ink">
            Início do acompanhamento <span className="font-normal text-ink-faint">· {dateFull(startDate)}</span>
          </p>
        </li>
      )}
    </ol>
  );
}

function Node({ item, currentWeek, defaultOpen }: { item: JourneyWeek; currentWeek: number | null; defaultOpen: boolean }) {
  const { week, checkin, hasOrientation, orientationSentAt, goals } = item;
  const isCurrent = week.weekNumber === currentWeek;
  const sent = checkin?.status === "submitted" || checkin?.status === "reviewed";
  const reviewed = checkin?.status === "reviewed";
  const photoCount = week.photoAngles.length;
  const details = DEFS.filter((d) => DETAIL_KEYS.includes(d.key) && week.metrics[d.key] != null);
  const otherMetrics = DEFS.filter((d) => !DETAIL_KEYS.includes(d.key) && week.metrics[d.key] != null).length;

  return (
    <li className="relative pl-8">
      <span
        aria-hidden
        className={`absolute left-[0.4rem] top-[1.05rem] size-3 rounded-full ${
          isCurrent ? "bg-brand ring-4 ring-[var(--brand-tint-strong)]" : sent ? "bg-brand" : "border-2 border-line-strong bg-surface-sunken"
        }`}
      />
      <details className="group border-b border-line" open={defaultOpen}>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1.5 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="font-display text-base font-bold text-ink">Semana {week.weekNumber}</span>
          <span className="text-xs text-ink-faint">{weekRange(week)}</span>
          {isCurrent && <Badge tone="accent">Atual</Badge>}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {sent ? (
              <Badge tone="success" dot>
                Check-in
              </Badge>
            ) : (
              <Badge tone="neutral">{isCurrent ? "Check-in em aberto" : "Sem check-in"}</Badge>
            )}
            {reviewed && <Badge tone="success">Avaliado</Badge>}
            {hasOrientation && <Badge tone="info">Avaliação recebida</Badge>}
            {goals.length > 0 && <Badge tone="neutral">{goals.length === 1 ? "1 meta" : `${goals.length} metas`}</Badge>}
            {photoCount > 0 && <Badge tone="neutral">{photoCount === 1 ? "1 foto" : `${photoCount} fotos`}</Badge>}
            <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-180">
              ▾
            </span>
          </span>
        </summary>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 pb-4 text-sm sm:grid-cols-2">
          <Row label="Check-in">
            {sent
              ? `Enviado${checkin?.submittedAt ? ` em ${dateTimeShort(checkin.submittedAt)}` : ""}`
              : isCurrent
                ? "Em aberto nesta semana"
                : "Não enviado"}
          </Row>
          {(hasOrientation || sent) && (
            <Row label="Avaliação do coach">
              <Link href={`/portal/avaliacao?semana=${week.weekNumber}`} className="font-medium text-brand hover:underline">
                {hasOrientation
                  ? `Recebida${orientationSentAt ? ` em ${dateTimeShort(orientationSentAt)}` : ""} — ver e comparar com o plano`
                  : "Aguardando — ver andamento"}
              </Link>
            </Row>
          )}
          {goals.length > 0 && (
            <Row label="Metas">
              {goals.map((g) => `${g.label} (${GOAL_LABEL[g.resultStatus]})`).join(" · ")}
            </Row>
          )}
          {details.map((d) => (
            <Row key={d.key} label={d.key === "workouts_count" ? "Treinos" : d.label}>
              <span className="tabular-nums">{formatMetricValue(d, week.metrics[d.key]!)}</span>
            </Row>
          ))}
          {otherMetrics > 0 && (
            <Row label="Outras medidas">
              <a href="#metricas" className="font-medium text-brand hover:underline">
                {otherMetrics === 1 ? "1 registro" : `${otherMetrics} registros`} — ver gráficos
              </a>
            </Row>
          )}
          {photoCount > 0 && (
            <Row label="Fotos">
              <a href="#fotos" className="font-medium text-brand hover:underline">
                {photoCount === 1 ? "1 posição" : `${photoCount} posições`} — comparar
              </a>
            </Row>
          )}
        </dl>
      </details>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 sm:justify-start">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-right text-ink sm:text-left">{children}</dd>
    </div>
  );
}
