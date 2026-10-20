import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireClient } from "../require-client";
import Icon from "@/components/ui/icon";
import { isSensitiveKey } from "@/lib/checkin-catalog";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { loadPortalProgress, type ProgressGoal } from "@/lib/portal-progress";
import { LiveEvolutionSummary, LiveEvolutionView, ProgressPeriodProvider } from "./progress-period";
import Journey, { type JourneyWeek } from "./journey";
import WeekCompare from "./week-compare";
import LatestPhotos from "./latest-photos";
import { createClient } from "@/lib/supabase/server";
import { resolveWeekPeriods, type StoredWeekPeriod } from "./week-label";

export const metadata: Metadata = { title: "Progresso · Trackly" };

const GOAL_STATUS: Record<ProgressGoal["resultStatus"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  success: { label: "Atingida", tone: "success" },
  partial: { label: "Parcial", tone: "warning" },
  fail: { label: "Não atingida", tone: "danger" },
  pending: { label: "Em andamento", tone: "neutral" },
};

function SectionHead({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <header className="flex flex-col gap-1">
      <h2 id={`${id}-titulo`} className="t-subtitle text-ink">
        {title}
      </h2>
      {hint && <p className="t-helper">{hint}</p>}
    </header>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Progresso do aluno (V2 tarefas 26/27, reordenado na V3 tarefas 12/13). Ordem:
 *  1. Fotos — comparação entre semanas (2+ semanas com foto), as fotos da única semana com foto,
 *     ou um aviso compacto quando ainda não há foto;
 *  2. Medidas e gráficos — seletor de período, gráfico, cards e, abaixo, a síntese numérica +
 *     resumo automático (por regras) do MESMO período;
 *  3. Histórico semanal — linha do tempo compacta e expansível;
 *  4. Avaliação do coach (cartão que abre a tela única /portal/avaliacao) e, recolhido, metas e marcos.
 * V5 item 32/33: o texto da avaliação e o "o que mudou no plano" moram só em /portal/avaliacao; aqui
 * cada semana do histórico aponta para a avaliação correspondente (semana = `week_number`).
 * Todas as semanas vêm limitadas à semana corrente (`computeWeekInfo`), então "Semana N" é o
 * mesmo número em fotos, gráfico, histórico e Home. Nenhuma resposta de check-in (muito menos as
 * sensíveis) aparece aqui — só medidas numéricas e status. Tudo lido com a sessão do aluno (RLS).
 */
export default async function ProgressPage() {
  const { client } = await requireClient();
  const supabase = await createClient();
  const [loaded, instancesRes] = await Promise.all([
    loadPortalProgress(client),
    // Períodos GRAVADOS de todas as instâncias (qualquer status, inclusive a semana em aberto) —
    // a mesma fonte que a tela de check-in mostra. `getWeekComparisonData` só traz os de
    // check-ins enviados, então sem isto a semana corrente caía no período calculado e divergia.
    supabase.from("checkin_instances").select("week_number, period_start, period_end").eq("client_id", client.id),
  ]);
  if (instancesRes.error) console.error("Progresso: períodos das semanas indisponíveis:", instancesRes.error.message);
  const storedPeriods = (instancesRes.data ?? []) as StoredWeekPeriod[];
  // Defesa extra: nenhuma chave sensível do check-in vira métrica visível nesta página.
  const data = {
    ...loaded,
    // Regra única de período (`resolveWeekPeriods`): fotos, comparação e histórico usam o mesmo rótulo.
    weeks: resolveWeekPeriods(loaded.weeks, storedPeriods),
    evolution: loaded.evolution
      ? { ...loaded.evolution, metrics: loaded.evolution.metrics.filter((m) => !isSensitiveKey(m.key)) }
      : null,
  };
  const goalsByWeek = new Map<number, ProgressGoal[]>();
  for (const g of data.goals) goalsByWeek.set(g.weekNumber, [...(goalsByWeek.get(g.weekNumber) ?? []), g]);

  const checkinByWeek = new Map(data.checkins.map((c) => [c.weekNumber, c]));
  const orientationWeeks = new Set(data.orientations.map((o) => o.weekNumber));
  const orientationSentAt = new Map(data.orientations.map((o) => [o.weekNumber, o.sentAt]));

  const withContent = data.weeks.filter(
    (w) =>
      Object.keys(w.metrics).length > 0 ||
      w.photoAngles.length > 0 ||
      w.hasCheckin ||
      orientationWeeks.has(w.weekNumber)
  );
  const journey: JourneyWeek[] = [...withContent]
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .map((week) => ({
      week,
      checkin: checkinByWeek.get(week.weekNumber) ?? null,
      hasOrientation: orientationWeeks.has(week.weekNumber),
      orientationSentAt: orientationSentAt.get(week.weekNumber) ?? null,
      goals: goalsByWeek.get(week.weekNumber) ?? [],
    }));

  const hasMetrics = !!data.evolution && data.evolution.metrics.length > 0 && data.evolution.weeks.length > 0;
  // Semanas com foto (já limitadas à semana corrente), ascendente — base da comparação do topo.
  const photoWeeks = data.weeks.filter((w) => w.photoAngles.length > 0);
  const hasCompare = photoWeeks.length >= 2;
  const singlePhotoWeek = photoWeeks.length === 1 ? photoWeeks[0] : null;
  const hasOrientations = data.orientations.length > 0;
  const hasGoals = data.goals.length > 0;
  const hasEvents = data.events.length > 0;
  const hasAnything = journey.length > 0 || hasOrientations || hasGoals || hasEvents;

  const chips = [
    photoWeeks.length > 0 && { id: "fotos", label: "Fotos" },
    hasMetrics && { id: "metricas", label: "Medidas e gráficos" },
    journey.length > 0 && { id: "historico", label: "Histórico" },
    hasOrientations && { id: "avaliacao", label: "Avaliação" },
    (hasGoals || hasEvents) && { id: "metas", label: "Metas e marcos" },
  ].filter((c): c is { id: string; label: string } => Boolean(c));

  const [latestOrientation, ...olderOrientations] = data.orientations;

  return (
    <ProgressPeriodProvider>
      <div className="tk-stagger flex flex-col gap-6">
      <PageHeader title="Progresso" eyebrow="Sua jornada" />

      {!hasAnything && (
        <EmptyState
          icon="tracking"
          title="Sua jornada começa no primeiro check-in"
          text="Fotos, medidas, orientações do seu coach e metas aparecem aqui conforme você registra o acompanhamento."
          action={
            <Link href="/portal/checkin" className={buttonClass({ variant: "primary" })}>
              Ir para o check-in
            </Link>
          }
        />
      )}

      {hasCompare && (
        <section id="fotos" aria-labelledby="fotos-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <SectionHead
            id="fotos"
            title="Comparar fotos"
            hint="Sua semana mais recente com fotos ao lado de outra semana, sempre na mesma posição."
          />
          <WeekCompare weeks={photoWeeks} photos={data.photos} />
        </section>
      )}

      {singlePhotoWeek && (
        <section id="fotos" aria-labelledby="fotos-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <SectionHead id="fotos" title="Suas fotos" />
          <LatestPhotos
            weekNumber={singlePhotoWeek.weekNumber}
            periodStart={singlePhotoWeek.periodStart}
            periodEnd={singlePhotoWeek.periodEnd}
            photos={data.photos}
          />
        </section>
      )}

      {hasAnything && photoWeeks.length === 0 && (
        <section id="fotos" aria-label="Fotos" className={`${CARD} flex scroll-mt-20 items-start gap-3 p-4`}>
          <span className="mt-0.5 shrink-0 text-brand">
            <Icon name="camera" size={20} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold text-ink">Nenhuma foto de progresso ainda</p>
            <p className="text-sm text-ink-muted">
              Envie as fotos (frente, laterais e costas) no seu check-in semanal. A partir da segunda semana com fotos,
              você compara lado a lado aqui.
            </p>
            <Link
              href="/portal/checkin"
              className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Ir para o check-in
              <Icon name="chevron" size={16} />
            </Link>
          </div>
        </section>
      )}

      {chips.length > 1 && (
        <nav aria-label="Seções do progresso" className="-mx-4 overflow-x-auto px-4">
          <ul className="flex w-max gap-2">
            {chips.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {hasMetrics && data.evolution && (
        <section id="metricas" aria-labelledby="metricas-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <SectionHead
            id="metricas"
            title="Medidas e gráficos"
            hint="Troque o período: gráfico, indicadores e o resumo abaixo mostram sempre a mesma janela."
          />
          <LiveEvolutionView data={data.evolution} />
          <LiveEvolutionSummary
            evolution={data.evolution}
            checkins={data.checkins}
            goals={data.goals}
            currentWeek={data.currentWeek}
          />
        </section>
      )}

      {journey.length > 0 && (
        <section id="historico" aria-labelledby="historico-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <SectionHead
            id="historico"
            title="Histórico semanal"
            hint="Check-ins, avaliações e metas de cada semana, da mais recente à primeira. Toque numa semana para ver os detalhes."
          />
          <Journey items={journey} currentWeek={data.currentWeek} startDate={client.start_date} />
        </section>
      )}

      {hasOrientations && latestOrientation && (
        <section id="avaliacao" aria-labelledby="avaliacao-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <SectionHead
            id="avaliacao"
            title="Avaliação do seu coach"
            hint="O texto, o que mudou no plano e as semanas anteriores ficam numa tela só."
          />
          <Link
            href={`/portal/avaliacao?semana=${latestOrientation.weekNumber}`}
            className={`${CARD} flex min-h-11 flex-col gap-2 p-5 transition-colors hover:border-line-strong`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Mais recente</Badge>
              <span className="text-xs text-ink-faint">
                Semana {latestOrientation.weekNumber}
                {latestOrientation.sentAt ? ` · enviada em ${fmtDate(latestOrientation.sentAt)}` : ""}
              </span>
            </div>
            {latestOrientation.focus && <p className="text-sm font-semibold text-ink">Foco: {latestOrientation.focus}</p>}
            <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">{latestOrientation.text}</p>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand">
              Abrir avaliação
              {olderOrientations.length > 0
                ? ` · ${olderOrientations.length} anterior${olderOrientations.length === 1 ? "" : "es"}`
                : ""}
              <Icon name="chevron" size={16} />
            </span>
          </Link>
        </section>
      )}

      {(hasGoals || hasEvents) && (
        <section id="metas" aria-labelledby="metas-titulo" className="flex scroll-mt-20 flex-col gap-4">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <h2 id="metas-titulo" className="t-subtitle text-ink">
                Metas e marcos
              </h2>
              <span className="flex items-center gap-2 text-sm font-medium text-brand">
                <span className="group-open:hidden">Mostrar</span>
                <span className="hidden group-open:inline">Ocultar</span>
                <span aria-hidden className="transition-transform group-open:rotate-180">
                  ▾
                </span>
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-5">
              {hasGoals && (
                <div className="flex flex-col gap-2">
                  <p className="t-helper">Metas definidas com seu coach e o resultado de cada semana.</p>
                  <ul className={`${CARD} overflow-hidden`}>
                    {data.goals.map((g) => {
                      const st = GOAL_STATUS[g.resultStatus];
                      return (
                        <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3.5 last:border-b-0">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium text-ink">{g.label}</span>
                            <span className="text-xs text-ink-faint">
                              Semana {g.weekNumber} · meta {fmtNum(g.targetValue)}
                              {g.unit ? ` ${g.unit}` : ""}
                              {g.resultValue != null ? ` · resultado ${fmtNum(g.resultValue)}${g.unit ? ` ${g.unit}` : ""}` : ""}
                            </span>
                          </div>
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {hasEvents && (
                <div className="flex flex-col gap-2">
                  <p className="t-helper">Mudanças relevantes</p>
                  <ul className={`${CARD} overflow-hidden`}>
                    {data.events.map((e) => (
                      <li key={e.id} className="flex flex-col gap-0.5 border-b border-line px-4 py-3.5 last:border-b-0">
                        <span className="text-xs text-ink-faint">{fmtDate(e.date)}</span>
                        <span className="text-sm font-medium text-ink">{e.title}</span>
                        {e.description && <span className="text-sm text-ink-muted">{e.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </section>
      )}
      </div>
    </ProgressPeriodProvider>
  );
}
