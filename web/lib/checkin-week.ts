import { todayDateSP } from "@/lib/portal-today";

/**
 * Semana do acompanhamento, ALINHADA AO CALENDÁRIO (decisão de 2026-10-09): toda semana vai de
 * SEGUNDA a DOMINGO, igual para todos os alunos — casa com a janela do check-in (sexta a
 * domingo, `checkinWindow` em `lib/portal-today.ts`), que nunca mais cruza duas semanas.
 * Semana 1 = a semana de calendário em que cai o `start_date`; cada semana seguinte = +7 dias.
 *
 * "Hoje" é o dia em America/Sao_Paulo (domingo 23:30 em SP ainda é a semana que está fechando,
 * mesmo já sendo segunda em UTC). A mesma conta existe no banco, em
 * `private.client_can_open_checkin` (migration 0014) — se mudar aqui, mude lá junto.
 *
 * Pura (sem I/O). Instâncias antigas em `checkin_instances` guardam o período com que foram
 * criadas; isto só decide a semana corrente e o período de semanas sem instância.
 */

const DAY_MS = 86_400_000;

function dateMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function toDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Segunda-feira da semana de calendário de `date` (`AAAA-MM-DD`). */
export function mondayOf(date: string): string {
  const ms = dateMs(date);
  const weekday = new Date(ms).getUTCDay(); // 0 domingo ... 6 sábado
  return toDate(ms - ((weekday + 6) % 7) * DAY_MS);
}

/** Período (segunda a domingo) da semana `weekNumber` de um aluno que começou em `startDate`. */
export function periodOfWeek(startDate: string, weekNumber: number): { periodStart: string; periodEnd: string } {
  const startMs = dateMs(mondayOf(startDate)) + (weekNumber - 1) * 7 * DAY_MS;
  return { periodStart: toDate(startMs), periodEnd: toDate(startMs + 6 * DAY_MS) };
}

/** Semana corrente (1-based) e o período dela. */
export function computeWeekInfo(
  startDateStr: string,
  today: Date = new Date()
): { weekNumber: number; periodStart: string; periodEnd: string } {
  const diffDays = (dateMs(mondayOf(todayDateSP(today))) - dateMs(mondayOf(startDateStr))) / DAY_MS;
  const weekNumber = Math.max(1, Math.round(diffDays / 7) + 1);
  return { weekNumber, ...periodOfWeek(startDateStr, weekNumber) };
}
