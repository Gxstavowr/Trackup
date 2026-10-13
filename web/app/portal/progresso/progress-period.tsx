"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import EvolutionView from "@/app/coach/alunos/[id]/evolucao/evolution-view";
import {
  computeMetricTrend,
  formatMetricValue,
  formatTrendDelta,
  selectPeriodWeeks,
  type EvolutionData,
  type EvolutionPeriod,
} from "@/lib/evolution-format";
import { buildProgressSummary, type SummaryCheckin, type SummaryGoal } from "@/lib/progress-summary";
import EvolutionSummary, { type SynthesisTile } from "./evolution-summary";

/**
 * Período da evolução COMPARTILHADO entre o seletor/gráfico de "Medidas e gráficos" e o resumo
 * automático logo abaixo: trocar 4/8/12/completo atualiza gráfico, cards, síntese e resumo juntos,
 * sempre sobre o MESMO recorte (`selectPeriodWeeks`) — nunca duas janelas diferentes.
 */
const PeriodContext = createContext<{ period: EvolutionPeriod; setPeriod: (p: EvolutionPeriod) => void } | null>(null);

const MAX_TILES = 4;

export function ProgressPeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<EvolutionPeriod>(12);
  return <PeriodContext.Provider value={{ period, setPeriod }}>{children}</PeriodContext.Provider>;
}

function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("ProgressPeriodProvider ausente");
  return ctx;
}

/** Variações observadas (primeiro → último registro do período), peso primeiro; só métricas com
 *  pelo menos dois registros no período. Mesma conta (`computeMetricTrend`) do gráfico e dos cards. */
function buildTiles(evolution: EvolutionData | null, period: EvolutionPeriod): SynthesisTile[] {
  if (!evolution) return [];
  const weeks = selectPeriodWeeks(evolution.weeks, period);
  if (weeks.length < 2) return [];
  const ordered = [...evolution.metrics].sort((a, b) => (a.key === "weight_kg" ? -1 : b.key === "weight_kg" ? 1 : 0));
  const tiles: SynthesisTile[] = [];
  for (const m of ordered) {
    if (tiles.length >= MAX_TILES) break;
    const t = computeMetricTrend(weeks, m.key, m.goalDirection);
    if (t.delta == null || t.first == null || t.latest == null || t.delta === 0) continue;
    tiles.push({
      key: m.key,
      label: m.label,
      range: `${formatMetricValue(m.unit, t.first)} → ${formatMetricValue(m.unit, t.latest)}`,
      delta: formatTrendDelta(m.unit, t.delta),
      weeks: `Semana ${t.firstWeek} → ${t.latestWeek}`,
    });
  }
  return tiles;
}

export function LiveEvolutionSummary({
  evolution,
  checkins,
  goals,
  currentWeek,
}: {
  evolution: EvolutionData | null;
  checkins: SummaryCheckin[];
  goals: SummaryGoal[];
  currentWeek: number | null;
}) {
  const { period } = usePeriod();
  const summary = buildProgressSummary({ evolution, checkins, goals, currentWeek, period });
  return <EvolutionSummary summary={summary} tiles={buildTiles(evolution, period)} period={period} />;
}

export function LiveEvolutionView({ data }: { data: EvolutionData }) {
  const { period, setPeriod } = usePeriod();
  return <EvolutionView data={data} hideEmptyMetrics period={period} onPeriodChange={setPeriod} />;
}
