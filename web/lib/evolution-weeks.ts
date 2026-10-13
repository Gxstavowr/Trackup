import { computeWeekInfo, periodOfWeek } from "@/lib/checkin-week";
import type { EvolutionWeekPoint } from "@/lib/evolution-format";

/**
 * Montagem PURA (sem I/O) das semanas da evolução — extraída de `lib/evolution.ts` pra poder ser
 * testada sem `server-only`.
 *
 * Regra de semana ÚNICA com o resto do app (V3 tarefa 13): a semana corrente vem de
 * `computeWeekInfo(start_date)` (semanas de calendário, `lib/checkin-week.ts`) e NENHUMA semana
 * acima dela entra — a mesma guarda `week_number <= currentWeek` de `lib/week-comparison.ts`
 * (Comparar/Jornada/Fotos). Sem isso, métricas gravadas com uma numeração antiga/adiantada (ex.:
 * dados demo calculados com 7 dias corridos) faziam o resumo e o gráfico falarem em "semana 10"
 * enquanto Home e Jornada diziam "Semana 3". Semanas < 1 também são descartadas.
 *
 * Data de início de cada semana: a do `checkin_instances` quando existe; senão, o período
 * calculado a partir do `start_date` (mesmo fallback de `lib/week-comparison.ts`), pra os rótulos
 * "Semana N · dd/mm" baterem com as fotos.
 */

export type EvolutionMetricRow = { week_number: number; key: string; value: number | string | null };
export type EvolutionInstanceRow = { week_number: number; period_start: string };

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Semana corrente do aluno pela regra do app; `null` sem `start_date` (sem teto). */
export function evolutionMaxWeek(startDate: string | null, today: Date = new Date()): number | null {
  return startDate ? computeWeekInfo(startDate, today).weekNumber : null;
}

export function buildEvolutionWeeks(
  metricRows: EvolutionMetricRow[],
  instanceRows: EvolutionInstanceRow[],
  opts: { startDate: string | null; maxWeek: number | null }
): EvolutionWeekPoint[] {
  const { startDate, maxWeek } = opts;
  const inRange = (w: number) => w >= 1 && (maxWeek == null || w <= maxWeek);

  const periodStartByWeek = new Map<number, string>();
  for (const row of instanceRows) {
    if (inRange(row.week_number)) periodStartByWeek.set(row.week_number, row.period_start);
  }

  const valuesByWeek = new Map<number, Record<string, number>>();
  for (const row of metricRows) {
    if (!inRange(row.week_number)) continue;
    const value = toNumber(row.value);
    if (value == null) continue;
    // Mesma guarda de `metrics` em `lib/repository.ts`/`lib/week-comparison.ts`: peso <= 0 é lixo
    // de digitação, não um registro válido — não deve virar ponto no gráfico.
    if (row.key === "weight_kg" && value <= 0) continue;
    const bucket = valuesByWeek.get(row.week_number) ?? {};
    bucket[row.key] = value;
    valuesByWeek.set(row.week_number, bucket);
  }

  return [...valuesByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, values]) => ({
      weekNumber,
      periodStart:
        periodStartByWeek.get(weekNumber) ?? (startDate ? periodOfWeek(startDate, weekNumber).periodStart : null),
      values,
    }));
}
