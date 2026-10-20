import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { StepStrip } from "@/components/viz";
import { requireClient } from "../require-client";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { loadPortalProgress, type ProgressGoal } from "@/lib/portal-progress";
import { formatMetricDelta, formatMetricValue, metricDefs, metricDelta, type MetricKey } from "@/lib/week-comparison-format";
import {
  activeVersionAt,
  changesForWindow,
  evaluationWindows,
  hasAnyChange,
  type EvaluationChanges,
} from "@/lib/evolution-plan-changes";
import {
  adjacentWeeks,
  CYCLE_STAGE_TEXT,
  cycleStage,
  evaluationWeekNumbers,
  isCheckinSent,
  pickEvaluationWeek,
} from "@/lib/history-evaluation";
import { createClient } from "@/lib/supabase/server";
import { resolveWeekPeriods, weekPeriodLabel, type StoredWeekPeriod } from "../progresso/week-label";
import { loadPlanVersions } from "./plan-versions";
import ChangesCard from "./changes-card";
import ExpandableText from "../expandable-text";

export const metadata: Metadata = { title: "Avaliação semanal · Trackly" };

const GOAL_STATUS: Record<ProgressGoal["resultStatus"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  success: { label: "Atingida", tone: "success" },
  partial: { label: "Parcial", tone: "warning" },
  fail: { label: "Não atingida", tone: "danger" },
  pending: { label: "Em andamento", tone: "neutral" },
};

const SHOWN_METRICS: MetricKey[] = ["weight_kg", "waist_cm", "hip_cm", "adherence", "workouts_count"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Avaliação semanal do aluno (V5 item 33): o ÚNICO lugar para reler o retorno do coach de uma
 * semana: ciclo (check-in -> avaliação), texto e foco do coach, o que mudou no treino, na
 * nutrição e no cardio (diferença entre planos PUBLICADOS no período da avaliação), medidas e
 * metas da semana, e navegação entre semanas. Nunca lê nem mostra a nota privada do coach
 * (`orientations.coach_note` não é selecionada em lugar nenhum) nem rascunhos.
 *
 * Rota: /portal/avaliacao?semana=N (sem parâmetro abre a avaliação mais recente recebida).
 */
export default async function EvaluationPage({ searchParams }: { searchParams: Promise<{ semana?: string | string[] }> }) {
  const { client } = await requireClient();
  const { semana } = await searchParams;
  const supabase = await createClient();

  const [progress, versions, instancesRes] = await Promise.all([
    loadPortalProgress(client),
    loadPlanVersions(client.id),
    supabase.from("checkin_instances").select("week_number, period_start, period_end").eq("client_id", client.id),
  ]);
  const weeks = resolveWeekPeriods(progress.weeks, (instancesRes.data ?? []) as StoredWeekPeriod[]);

  const available = evaluationWeekNumbers(progress.checkins, progress.orientations);
  const received = progress.orientations.map((o) => o.weekNumber);
  const selected = pickEvaluationWeek(Array.isArray(semana) ? semana[0] : semana, available, received);

  if (selected == null) {
    return (
      <div className="tk-stagger flex flex-col gap-6">
        <PageHeader title="Avaliação semanal" eyebrow="Retorno do seu coach" />
        <EmptyState
          icon="checkin"
          title="Sua primeira avaliação começa no check-in"
          text="Depois que você enviar o check-in, seu coach avalia a semana e a resposta dele aparece aqui, junto do que mudou no seu plano."
          action={
            <Link href="/portal/checkin" className={buttonClass({ variant: "primary" })}>
              Ir para o check-in
            </Link>
          }
        />
      </div>
    );
  }

  const week = weeks.find((w) => w.weekNumber === selected) ?? null;
  const checkin = progress.checkins.find((c) => c.weekNumber === selected) ?? null;
  const orientation = progress.orientations.find((o) => o.weekNumber === selected) ?? null;
  const stage = cycleStage(checkin?.status, orientation != null);
  const { older, newer } = adjacentWeeks(selected, available);
  const isLatest = newer == null;
  const goals = progress.goals.filter((g) => g.weekNumber === selected);

  // Mudanças de plano: janela desta avaliação (do envio da anterior até o envio desta).
  const { windows, pending } = evaluationWindows(progress.orientations);
  const window = windows.find((w) => w.weekNumber === selected) ?? null;
  const changes: EvaluationChanges | null = window
    ? changesForWindow({ workout: versions.workout, nutrition: versions.nutrition, window })
    : null;
  const afterwards: EvaluationChanges | null =
    isLatest && pending && orientation
      ? changesForWindow({ workout: versions.workout, nutrition: versions.nutrition, window: pending })
      : null;
  const inForce = window
    ? {
        training: activeVersionAt(versions.workout, window.to),
        nutrition: activeVersionAt(versions.nutrition, window.to),
      }
    : null;

  // Medidas da semana com a diferença para o último registro anterior da mesma medida.
  const defs = metricDefs(true).filter((d) => SHOWN_METRICS.includes(d.key) && week?.metrics[d.key] != null);
  const metricRows = defs.map((d) => {
    const value = week!.metrics[d.key]!;
    const prev = [...weeks]
      .filter((w) => w.weekNumber < selected && w.metrics[d.key] != null)
      .sort((a, b) => b.weekNumber - a.weekNumber)[0];
    return {
      key: d.key,
      label: d.key === "workouts_count" ? "Treinos" : d.label,
      value: formatMetricValue(d, value),
      delta: prev ? `${formatMetricDelta(d, metricDelta(prev.metrics[d.key]!, value))} desde a semana ${prev.weekNumber}` : null,
    };
  });

  const showChanges = !!changes && (versions.access.training || versions.access.nutrition);
  const anyChange = changes ? hasAnyChange(changes) : false;
  const anyAfterwards = afterwards ? hasAnyChange(afterwards) : false;
  const periodLabel = week ? weekPeriodLabel(week) : `Semana ${selected}`;

  const steps = [
    {
      key: "checkin",
      label: "Check-in",
      state: isCheckinSent(checkin?.status) ? ("done" as const) : ("current" as const),
      hint: checkin?.submittedAt ? fmtDay(checkin.submittedAt) : isCheckinSent(checkin?.status) ? "Enviado" : "Não enviado",
    },
    {
      key: "avaliacao",
      label: "Avaliação",
      state: orientation ? ("done" as const) : isCheckinSent(checkin?.status) ? ("current" as const) : ("upcoming" as const),
      hint: orientation?.sentAt ? fmtDay(orientation.sentAt) : "Aguardando",
    },
  ];

  return (
    <div className="tk-stagger flex flex-col gap-6">
      <PageHeader title="Avaliação semanal" eyebrow="Retorno do seu coach" />

      {available.length > 1 && (
        <nav aria-label="Semanas com avaliação" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {available.map((w) => {
              const on = w === selected;
              return (
                <li key={w}>
                  <Link
                    href={`/portal/avaliacao?semana=${w}`}
                    aria-current={on ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
                      on ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    Semana {w}
                    {!received.includes(w) && <span className="sr-only"> (aguardando avaliação)</span>}
                    {!received.includes(w) && <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <section aria-labelledby="ciclo-titulo" className={`${CARD} flex flex-col gap-4 p-5`}>
        <div className="flex flex-col gap-1">
          <h2 id="ciclo-titulo" className="t-subtitle text-ink">
            {periodLabel}
          </h2>
          <p className="t-helper">{CYCLE_STAGE_TEXT[stage]}</p>
        </div>
        <StepStrip steps={steps} label="Ciclo da semana" />
        {stage === "checkin_open" && selected === progress.currentWeek && (
          <Link href="/portal/checkin" className={buttonClass({ variant: "primary", width: "full" })}>
            Fazer o check-in
          </Link>
        )}
      </section>

      {orientation ? (
        <section aria-labelledby="coach-titulo" className={`${CARD} flex flex-col gap-3 p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="coach-titulo" className="t-subtitle text-ink">
              O que seu coach escreveu
            </h2>
            {isLatest && <Badge tone="accent">Mais recente</Badge>}
          </div>
          {orientation.sentAt && <p className="text-xs text-ink-faint">Enviada em {fmtDate(orientation.sentAt)}</p>}
          {orientation.focus && <p className="text-sm font-semibold text-ink">Foco: {orientation.focus}</p>}
          <ExpandableText text={orientation.text} threshold={600} />
        </section>
      ) : (
        stage === "awaiting_evaluation" && (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-ink-muted">
            Seu coach ainda está avaliando esta semana. Quando ele enviar, o texto e as mudanças no plano aparecem aqui e você recebe um aviso.
          </p>
        )
      )}

      {showChanges && changes && (
        <section id="mudancas" aria-labelledby="mudancas-titulo" className={`${CARD} flex scroll-mt-20 flex-col gap-4 p-5`}>
          <header className="flex flex-col gap-1">
            <h2 id="mudancas-titulo" className="t-subtitle text-ink">
              O que mudou no seu plano
            </h2>
            <p className="t-helper">
              Diferença entre os planos que seu coach publicou
              {window?.from ? ` depois da avaliação anterior` : " desde o início"} e até esta avaliação.
            </p>
          </header>
          {anyChange ? (
            <div className="flex flex-col gap-4">
              {versions.access.training && <ChangesCard changes={changes.training} />}
              {versions.access.nutrition && <ChangesCard changes={changes.nutrition} />}
              {versions.access.training && <ChangesCard changes={changes.cardio} />}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              {inForce && !inForce.training && !inForce.nutrition
                ? "Ainda não havia plano publicado neste período."
                : "Nenhuma alteração de treino, nutrição ou cardio foi publicada neste período. Seu plano continua o mesmo."}
            </p>
          )}
          {inForce && (inForce.training || inForce.nutrition) && (
            <p className="border-t border-line pt-3 text-xs text-ink-faint">
              Planos em vigor nesta avaliação:
              {inForce.training && ` treino “${inForce.training.name}” (publicado em ${fmtDay(inForce.training.publishedAt)})`}
              {inForce.training && inForce.nutrition && " · "}
              {inForce.nutrition && ` nutrição “${inForce.nutrition.name}” (publicada em ${fmtDay(inForce.nutrition.publishedAt)})`}
            </p>
          )}
        </section>
      )}

      {showChanges && anyAfterwards && afterwards && (
        <section aria-labelledby="depois-titulo" className={`${CARD} flex flex-col gap-4 p-5`}>
          <header className="flex flex-col gap-1">
            <h2 id="depois-titulo" className="t-subtitle text-ink">
              Publicado depois desta avaliação
            </h2>
            <p className="t-helper">Alterações mais novas no seu plano, ainda sem uma avaliação própria.</p>
          </header>
          {versions.access.training && <ChangesCard changes={afterwards.training} />}
          {versions.access.nutrition && <ChangesCard changes={afterwards.nutrition} />}
          {versions.access.training && <ChangesCard changes={afterwards.cardio} />}
        </section>
      )}

      {(metricRows.length > 0 || goals.length > 0) && (
        <section aria-labelledby="semana-titulo" className={`${CARD} flex flex-col gap-3 p-5`}>
          <h2 id="semana-titulo" className="t-subtitle text-ink">
            Seus números nesta semana
          </h2>
          {metricRows.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm min-[420px]:grid-cols-2">
              {metricRows.map((m) => (
                <div key={m.key} className="flex min-w-0 flex-col">
                  <dt className="text-ink-faint">{m.label}</dt>
                  <dd className="tabular-nums text-ink">
                    <span className="font-semibold">{m.value}</span>
                    {m.delta && <span className="block text-xs text-ink-muted">{m.delta}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {goals.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {goals.map((g) => {
                const st = GOAL_STATUS[g.resultStatus];
                return (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <span className="min-w-0 text-sm text-ink">
                      {g.label}{" "}
                      <span className="text-xs text-ink-faint">
                        meta {fmtNum(g.targetValue)}
                        {g.unit ? ` ${g.unit}` : ""}
                        {g.resultValue != null ? ` · resultado ${fmtNum(g.resultValue)}${g.unit ? ` ${g.unit}` : ""}` : ""}
                      </span>
                    </span>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <nav aria-label="Navegar entre semanas e ver o progresso" className="flex flex-col gap-3">
        {(older != null || newer != null) && (
          <div className="grid grid-cols-2 gap-3">
            {older != null ? (
              <Link href={`/portal/avaliacao?semana=${older}`} className={buttonClass({ variant: "secondary", width: "full" })}>
                <Icon name="chevron" size={16} className="rotate-180" />
                Semana {older}
              </Link>
            ) : (
              <span />
            )}
            {newer != null ? (
              <Link href={`/portal/avaliacao?semana=${newer}`} className={buttonClass({ variant: "secondary", width: "full" })}>
                Semana {newer}
                <Icon name="chevron" size={16} />
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-x-5">
          <Link href="/portal/progresso#fotos" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
            Fotos e gráficos do progresso
            <Icon name="chevron" size={16} />
          </Link>
          <Link href="/portal/progresso#historico" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
            Histórico semanal
            <Icon name="chevron" size={16} />
          </Link>
        </div>
      </nav>
    </div>
  );
}
