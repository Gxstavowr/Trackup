import { dateShort, type ComparisonWeek } from "@/lib/week-comparison-format";

/**
 * Rótulo de período usado em TODA a área Progresso (fotos, comparação, histórico):
 * "Semana 5 · 02/09–08/09". O número da semana é sempre o mesmo `week_number` que Home, check-in e
 * evolução usam (todos limitados à semana corrente pela regra de `lib/checkin-week.ts`).
 */
export function weekRange(week: Pick<ComparisonWeek, "periodStart" | "periodEnd">): string {
  return `${dateShort(week.periodStart)}–${dateShort(week.periodEnd)}`;
}

export function weekPeriodLabel(week: Pick<ComparisonWeek, "weekNumber" | "periodStart" | "periodEnd">): string {
  return `Semana ${week.weekNumber} · ${weekRange(week)}`;
}

export type StoredWeekPeriod = { week_number: number; period_start: string; period_end: string };

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * REGRA ÚNICA de período na área Progresso (a mesma da tela de check-in): se a semana tem
 * `checkin_instances` (QUALQUER status — inclusive em aberto), vale o período gravado nela; só
 * sem instância entra o período calculado (`periodOfWeek`, já vindo em `periodStart/periodEnd`).
 * Instâncias antigas podem ter outro alinhamento (ex.: terça a segunda); pra dois rótulos
 * vizinhos nunca se sobreporem, um período CALCULADO começa no máximo no dia seguinte ao fim da
 * semana anterior exibida. Períodos gravados nunca são alterados.
 */
export function resolveWeekPeriods<W extends Pick<ComparisonWeek, "weekNumber" | "periodStart" | "periodEnd">>(
  weeks: W[],
  stored: StoredWeekPeriod[]
): W[] {
  const byWeek = new Map(stored.map((s) => [s.week_number, s]));
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  let prevEnd: string | null = null;
  return sorted.map((w) => {
    const s = byWeek.get(w.weekNumber);
    let periodStart = s?.period_start ?? w.periodStart;
    let periodEnd = s?.period_end ?? w.periodEnd;
    if (!s && prevEnd && periodStart <= prevEnd) {
      periodStart = addDays(prevEnd, 1);
      if (periodEnd < periodStart) periodEnd = periodStart;
    }
    prevEnd = periodEnd;
    return { ...w, periodStart, periodEnd };
  });
}
