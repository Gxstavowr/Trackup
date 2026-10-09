import { formatNumber } from "@/lib/week-comparison-format";
import { isGoodMetricDelta, type MetricDirection } from "@/lib/metrics-catalog";

/**
 * EVOLUÇÃO DO ALUNO (item 15 do master TODO) — tipos e cálculo PUROS (sem I/O, sem `server-only`):
 * usados tanto pelo servidor (`lib/evolution.ts`, que monta `EvolutionData`) quanto pelo
 * componente de cliente (`app/coach/alunos/[id]/evolucao/evolution-view.tsx`), que troca o
 * período (4/8/12 semanas ou completo) e recalcula gráfico + cards A PARTIR DOS MESMOS DADOS —
 * nunca duas fontes que possam divergir.
 *
 * Reaproveita `formatNumber` de `lib/week-comparison-format.ts` (mesma formatação pt-BR já usada
 * na comparação entre semanas) e `isGoodMetricDelta` de `lib/metrics-catalog.ts` (mesma regra de
 * "delta bom/ruim depende do objetivo do aluno" do item 17) — nada de regra nova.
 */

export type EvolutionMetricDef = {
  key: string;
  label: string;
  unit: string | null;
  source: "catalog" | "custom";
  goalDirection: MetricDirection | null;
  targetValue: number | null;
};

export type EvolutionWeekPoint = {
  weekNumber: number;
  /** AAAA-MM-DD (`checkin_instances.period_start`); `null` se a semana não tem check-in registrado. */
  periodStart: string | null;
  /** Valores por chave de métrica — só as chaves que têm registro nesta semana. */
  values: Record<string, number>;
};

export type EvolutionData = {
  clientName: string;
  /** Métricas ACOMPANHADAS deste aluno (`getEffectiveClientMetrics`, filtradas por `tracked`), na
   *  ordem de exibição: peso primeiro (se acompanhado), depois o resto do catálogo, depois as
   *  métricas custom — a mesma ordem que `resolveEffectiveMetrics` já devolve. */
  metrics: EvolutionMetricDef[];
  /** Semanas com pelo menos um valor de alguma métrica acompanhada, ascendente. */
  weeks: EvolutionWeekPoint[];
};

export type EvolutionPeriod = 4 | 8 | 12 | "all";

export const PERIOD_OPTIONS: { value: EvolutionPeriod; label: string }[] = [
  { value: 4, label: "4 semanas" },
  { value: 8, label: "8 semanas" },
  { value: 12, label: "12 semanas" },
  { value: "all", label: "Completo" },
];

/** Últimas N semanas COM DADO (não N semanas de calendário) — mesma noção de "semana" que o resto
 *  do app usa (`Semana N`, sequencial por aluno, não necessariamente contígua no calendário). */
export function selectPeriodWeeks(weeks: EvolutionWeekPoint[], period: EvolutionPeriod): EvolutionWeekPoint[] {
  if (period === "all") return weeks;
  return weeks.slice(-period);
}

export type MetricTrendPoint = { weekNumber: number; periodStart: string | null; value: number | null };

export type MetricTrend = {
  points: MetricTrendPoint[];
  /** Valor mais recente com registro dentro do período selecionado (`null` = nenhum). */
  latest: number | null;
  /** Primeiro valor com registro dentro do período selecionado. */
  first: number | null;
  /** `latest - first`, só quando há pelo menos DOIS pontos com valor no período. */
  delta: number | null;
  /** `isGoodMetricDelta` aplicado ao delta — `null` sem meta definida ou sem delta. */
  good: boolean | null;
  /** Há pelo menos dois pontos com valor no período — o mínimo pra falar de "tendência". */
  hasEnoughData: boolean;
  /** Semana (e data de início, se houver check-in) do primeiro/último ponto COM valor no período. */
  firstWeek: number | null;
  firstDate: string | null;
  latestWeek: number | null;
  latestDate: string | null;
  /** Ritmo médio (`delta` / semanas entre o primeiro e o último ponto); `null` sem delta ou com os
   *  dois pontos na mesma semana. */
  perWeek: number | null;
};

/** Gráfico e cards SEMPRE chamam esta função com o MESMO array de semanas (já filtrado pelo
 *  período selecionado) — é o que garante "gráfico e resumo mudam juntos, sem inconsistência". */
export function computeMetricTrend(
  weeks: EvolutionWeekPoint[],
  metricKey: string,
  goalDirection: MetricDirection | null
): MetricTrend {
  const points: MetricTrendPoint[] = weeks.map((w) => ({
    weekNumber: w.weekNumber,
    periodStart: w.periodStart,
    value: w.values[metricKey] ?? null,
  }));
  const withValue = points.filter((p): p is MetricTrendPoint & { value: number } => p.value != null);
  const first = withValue[0]?.value ?? null;
  const latest = withValue[withValue.length - 1]?.value ?? null;
  const hasEnoughData = withValue.length >= 2;
  const delta = hasEnoughData && first != null && latest != null ? Math.round((latest - first) * 100) / 100 : null;
  const good = delta == null ? null : isGoodMetricDelta(goalDirection, delta);
  const firstPoint = withValue[0] ?? null;
  const latestPoint = withValue[withValue.length - 1] ?? null;
  const span = firstPoint && latestPoint ? latestPoint.weekNumber - firstPoint.weekNumber : 0;
  const perWeek = delta != null && span > 0 ? Math.round((delta / span) * 100) / 100 : null;
  return {
    points,
    latest,
    first,
    delta,
    good,
    hasEnoughData,
    firstWeek: firstPoint?.weekNumber ?? null,
    firstDate: firstPoint?.periodStart ?? null,
    latestWeek: latestPoint?.weekNumber ?? null,
    latestDate: latestPoint?.periodStart ?? null,
    perWeek,
  };
}

/** Leitura em palavras da tendência do período ("Em queda", "Em alta", "Estável") + o que isso
 *  significa pro objetivo do aluno, quando há direção de objetivo. `null` sem dois pontos pra
 *  comparar. */
export function describeTrend(trend: MetricTrend): { label: string; hint: string | null } | null {
  if (trend.delta == null) return null;
  if (trend.delta === 0) return { label: "Estável", hint: null };
  const label = trend.delta > 0 ? "Em alta" : "Em queda";
  const hint = trend.good == null ? null : trend.good ? "na direção da meta" : "contra a meta";
  return { label, hint };
}

/** Distância até a meta numérica (`targetValue`) a partir do último valor. `reached` só quando há
 *  direção de objetivo e o valor já chegou/passou da meta. */
export function describeGoalGap(
  latest: number | null,
  targetValue: number | null,
  goalDirection: MetricDirection | null
): { reached: boolean; remaining: number } | null {
  if (latest == null || targetValue == null) return null;
  const diff = Math.round((targetValue - latest) * 100) / 100;
  const reached =
    diff === 0 || (goalDirection === "decrease" && diff > 0) || (goalDirection === "increase" && diff < 0);
  return { reached, remaining: Math.abs(diff) };
}

export function formatMetricValue(unit: string | null, value: number): string {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

/** "▲ +1,2 kg", "▼ −0,5", "Sem variação". Sinal com o menos tipográfico (U+2212) — mesmo padrão
 *  de `formatMetricDelta` (`lib/week-comparison-format.ts`) e do card de peso da Avaliação. */
export function formatTrendDelta(unit: string | null, delta: number): string {
  if (delta === 0) return "Sem variação";
  const abs = Math.abs(delta);
  const suffix = unit ? ` ${unit}` : "";
  return `${delta > 0 ? "▲ +" : "▼ −"}${formatNumber(abs)}${suffix}`;
}
