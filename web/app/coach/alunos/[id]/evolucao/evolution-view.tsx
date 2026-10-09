"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateShort, formatNumber } from "@/lib/week-comparison-format";
import {
  PERIOD_OPTIONS,
  computeMetricTrend,
  describeGoalGap,
  describeTrend,
  formatMetricValue,
  formatTrendDelta,
  selectPeriodWeeks,
  type EvolutionData,
  type EvolutionMetricDef,
  type EvolutionPeriod,
  type EvolutionWeekPoint,
  type MetricTrend,
} from "@/lib/evolution-format";

const EYEBROW = "font-mono text-label uppercase tracking-widest text-ink-faint";

/** Texto de delta: bom = accent (`text-ok`), ruim = coral legível (`text-late-text`), sem meta = neutro. */
function deltaTone(good: boolean | null): string {
  if (good == null) return "text-ink-muted";
  return good ? "text-ok" : "text-late-text";
}

/**
 * Evolução (item 15): peso ganha o gráfico principal (só se acompanhado); as demais métricas
 * acompanhadas (cintura, quadril, energia, custom...) viram cards compactos com tendência — nunca
 * outro gráfico grande, "sem excesso de gráficos" por decisão de produto (ver TODO do item).
 *
 * Todo o dado já vem pronto do servidor (`getStudentEvolution` — já filtrado pela configuração de
 * métricas do aluno, item 17); o período (4/8/12 semanas ou completo) é client-side, sobre o
 * MESMO array de semanas (`selectPeriodWeeks`) — gráfico e cards recalculam juntos, sem ida ao
 * servidor e sem poderem divergir.
 */
export default function EvolutionView({ data }: { data: EvolutionData }) {
  const [period, setPeriod] = useState<EvolutionPeriod>(12);
  const weeks = useMemo(() => selectPeriodWeeks(data.weeks, period), [data.weeks, period]);

  const weightMetric = data.metrics.find((m) => m.key === "weight_kg") ?? null;
  const cardMetrics = data.metrics.filter((m) => m.key !== "weight_kg");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PeriodSelector period={period} onChange={setPeriod} />
        <PeriodCaption weeks={weeks} totalWeeks={data.weeks.length} period={period} />
      </div>

      {weightMetric && <WeightHero metric={weightMetric} weeks={weeks} />}

      {cardMetrics.length > 0 && (
        <section aria-label="Outras métricas" className="flex flex-col gap-4">
          <h3 className={EYEBROW}>{weightMetric ? "Outras métricas" : "Métricas acompanhadas"}</h3>
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {cardMetrics.map((m) => (
              <MetricCard key={m.key} metric={m} weeks={weeks} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PeriodSelector({
  period,
  onChange,
}: {
  period: EvolutionPeriod;
  onChange: (p: EvolutionPeriod) => void;
}) {
  return (
    <div role="group" aria-label="Período da evolução" className="flex flex-wrap gap-2">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          aria-pressed={period === opt.value}
          onClick={() => onChange(opt.value)}
          className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-1.5 font-mono text-sm transition-colors ${
            period === opt.value
              ? "border-brand bg-brand-tint text-brand"
              : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Uma linha que diz exatamente o que o período mostra (semanas + datas) — deixa claro, sem olhar
 *  o gráfico, que o resumo e o gráfico abaixo falam da mesma janela. */
function PeriodCaption({
  weeks,
  totalWeeks,
  period,
}: {
  weeks: EvolutionWeekPoint[];
  totalWeeks: number;
  period: EvolutionPeriod;
}) {
  if (weeks.length === 0) return null;
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const range =
    first.periodStart && last.periodStart
      ? weeks.length === 1
        ? ` · ${dateShort(first.periodStart)}`
        : ` · ${dateShort(first.periodStart)} a ${dateShort(last.periodStart)}`
      : "";
  const partial = period !== "all" && totalWeeks < period;
  return (
    <p className="text-sm text-ink-muted" aria-live="polite">
      {weeks.length === 1
        ? `Semana ${first.weekNumber}${range}`
        : `Semanas ${first.weekNumber} a ${last.weekNumber}${range}`}
      {partial && <span className="text-ink-faint"> · todo o histórico disponível ({totalWeeks} com registro)</span>}
    </p>
  );
}

/** Peso — item 15: "manter gráfico principal de peso quando aplicável". Resumo editorial (número
 *  grande + início/variação/meta + leitura da tendência em palavras) sobre o gráfico; tudo calculado
 *  do mesmo `weeks` filtrado pelo período. */
function WeightHero({ metric, weeks }: { metric: EvolutionMetricDef; weeks: EvolutionWeekPoint[] }) {
  const trend = useMemo(() => computeMetricTrend(weeks, metric.key, metric.goalDirection), [weeks, metric]);
  const reading = describeTrend(trend);
  const gap = describeGoalGap(trend.latest, metric.targetValue, metric.goalDirection);
  const hasData = trend.latest != null;

  return (
    <section
      aria-label="Peso"
      className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-5 shadow-[var(--surface-raised-shadow)] sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className={EYEBROW}>Peso</span>
          <span className="font-display text-counter leading-none text-ink">
            {trend.latest != null ? formatMetricValue("kg", trend.latest) : "—"}
          </span>
          {reading ? (
            <p className="text-sm text-ink-muted">
              <span className={`font-medium ${deltaTone(trend.good)}`}>{reading.label}</span>
              {reading.hint && <span> · {reading.hint}</span>}
            </p>
          ) : (
            <p className="text-sm text-ink-faint">
              {hasData ? "Ainda sem histórico suficiente para uma tendência" : "Sem registros neste período"}
            </p>
          )}
        </div>

        {hasData && <WeightFacts trend={trend} gap={gap} targetValue={metric.targetValue} />}
      </div>

      {hasData ? <WeightChart metric={metric} trend={trend} /> : (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-sm text-ink-muted">
          Sem registros de peso neste período.
        </p>
      )}
    </section>
  );
}

/** Três fatos lado a lado (Início · Variação · Meta) — leitura rápida, sem caixas dentro de caixa. */
function WeightFacts({
  trend,
  gap,
  targetValue,
}: {
  trend: MetricTrend;
  gap: ReturnType<typeof describeGoalGap>;
  targetValue: number | null;
}) {
  return (
    <dl className="grid grid-cols-3 gap-x-6 border-t border-line pt-4 sm:border-t-0 sm:pt-0">
      <div className="flex min-w-0 flex-col gap-1">
        <dt className={EYEBROW}>Início</dt>
        <dd className="text-base text-ink">{trend.first != null ? formatMetricValue("kg", trend.first) : "—"}</dd>
        {trend.firstDate && <dd className="text-xs text-ink-faint">{dateShort(trend.firstDate)}</dd>}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className={EYEBROW}>Variação</dt>
        <dd className={`text-base ${deltaTone(trend.good)}`}>
          {trend.delta != null ? formatTrendDelta("kg", trend.delta) : "—"}
        </dd>
        {trend.perWeek != null && trend.perWeek !== 0 && (
          <dd className="whitespace-nowrap text-xs text-ink-faint">
            {trend.perWeek > 0 ? "+" : "−"}
            {formatNumber(Math.abs(trend.perWeek))} kg/sem
          </dd>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className={EYEBROW}>Meta</dt>
        <dd className="text-base text-ink">{targetValue != null ? formatMetricValue("kg", targetValue) : "—"}</dd>
        {gap && (
          <dd className="text-xs text-ink-faint">
            {gap.reached
              ? gap.remaining === 0
                ? "Atingida"
                : "Atingida (superada)"
              : `Faltam ${formatMetricValue("kg", gap.remaining)}`}
          </dd>
        )}
      </div>
    </dl>
  );
}

function WeightChart({ metric, trend }: { metric: EvolutionMetricDef; trend: MetricTrend }) {
  const chartData = trend.points.map((p) => ({
    weekNumber: p.weekNumber,
    dateLabel: p.periodStart ? dateShort(p.periodStart) : `S${p.weekNumber}`,
    value: p.value,
  }));
  const target = metric.targetValue;
  const summary =
    trend.delta != null
      ? `Gráfico de peso: de ${formatMetricValue("kg", trend.first ?? 0)} para ${formatMetricValue("kg", trend.latest ?? 0)} no período.`
      : `Gráfico de peso: ${formatMetricValue("kg", trend.latest ?? 0)}.`;

  return (
    <div role="img" aria-label={summary} className="h-56 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            stroke="var(--ink-faint)"
            tick={{ fill: "var(--ink-faint)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line)" }}
            minTickGap={24}
          />
          <YAxis
            stroke="var(--ink-faint)"
            tick={{ fill: "var(--ink-faint)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
            // A meta entra no domínio, senão a linha de referência some quando está longe da série.
            domain={[
              (min: number) => Math.floor(Math.min(min, target ?? min) - 1),
              (max: number) => Math.ceil(Math.max(max, target ?? max) + 1),
            ]}
          />
          {target != null && (
            <ReferenceLine
              y={target}
              stroke="var(--ink-faint)"
              strokeDasharray="4 4"
              label={{
                value: `Meta ${formatNumber(target)} kg`,
                position: "insideTopRight",
                fill: "var(--ink-faint)",
                fontSize: 11,
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
            content={({ active, label, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const raw = payload[0]?.value;
              const value = typeof raw === "number" ? raw : null;
              if (value == null) return null;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[var(--surface-raised-shadow)]">
                  <p className="text-ink-faint">{label}</p>
                  <p className="font-medium text-ink">{formatMetricValue("kg", value)}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--brand)"
            strokeWidth={2}
            fill="var(--brand)"
            fillOpacity={0.1}
            connectNulls
            dot={chartData.length <= 12 ? { r: 3, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 1.5 } : false}
            activeDot={{ r: 5, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Card compacto de UMA métrica (cintura, quadril, energia, custom...) — valor + variação + traço
 *  fino de tendência, sem virar outro gráfico. Sem caixa: um filete no topo, no estilo de índice
 *  editorial, pra não parecer o grid de KPIs genérico de dashboard. */
function MetricCard({ metric, weeks }: { metric: EvolutionMetricDef; weeks: EvolutionWeekPoint[] }) {
  const trend = useMemo(() => computeMetricTrend(weeks, metric.key, metric.goalDirection), [weeks, metric]);
  const reading = describeTrend(trend);
  const values = trend.points.map((p) => p.value).filter((v): v is number => v != null);

  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-line-strong pt-3">
      <span className={`truncate ${EYEBROW}`}>{metric.label}</span>
      <span className="font-display text-2xl leading-none text-ink">
        {trend.latest != null ? formatMetricValue(metric.unit, trend.latest) : "—"}
      </span>
      {trend.hasEnoughData && trend.delta != null ? (
        <>
          <Sparkline values={values} />
          <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
            <span className={deltaTone(trend.good)}>{formatTrendDelta(metric.unit, trend.delta)}</span>
            {reading && reading.label !== "Estável" && <span className="text-ink-faint">{reading.label}</span>}
          </span>
        </>
      ) : (
        <span className="text-xs text-ink-faint">
          {trend.latest != null ? "Ainda sem histórico suficiente" : "Sem registros neste período"}
        </span>
      )}
    </div>
  );
}

/** Traço mínimo (não é um gráfico completo: sem eixo, sem legenda, sem tooltip) — só o formato da
 *  tendência. Linha em tom neutro (de-ênfase); o ponto mais recente em destaque (accent). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 100;
  const height = 28;
  const pad = 3; // deixa o ponto final (r=3) inteiro dentro do viewBox
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => [pad + i * stepX, height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid meet" className="h-7 w-full" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill="var(--brand)" />
    </svg>
  );
}
