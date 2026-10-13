import { computeWeekInfo, mondayOf, periodOfWeek } from "@/lib/checkin-week";
import { todayDateSP } from "@/lib/portal-today";

/**
 * Check-in ATRASADO, derivado na leitura (nunca gravado — o app não escreve `status = 'late'`).
 * Pura (sem I/O): usada por `getEvaluationQueue` e testável isoladamente.
 *
 * Regra: a semana é segunda a domingo (America/Sao_Paulo, ver `lib/checkin-week.ts`). A janela do
 * check-in da semana N fecha no domingo; a partir de segunda, se a instância da semana N não está
 * `submitted`/`reviewed`, o check-in daquela semana ficou em atraso. Só a semana imediatamente
 * anterior é avaliada (semanas mais antigas não enviadas já foram "superadas" pela anterior).
 * A semana corrente ainda aberta NUNCA é atrasada.
 */

/** Status que provam que o aluno enviou o check-in da semana. */
export function isCheckinSent(status: string | null | undefined): boolean {
  return status === "submitted" || status === "reviewed";
}

export type LateWeek = { weekNumber: number; periodStart: string; periodEnd: string };

/** Primeiro dia (segunda, `AAAA-MM-DD`) da semana anterior à corrente — corte da query de instâncias. */
export function previousWeekMonday(now: Date = new Date()): string {
  const monday = mondayOf(todayDateSP(now));
  const ms = new Date(`${monday}T00:00:00Z`).getTime() - 7 * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Devolve a semana anterior se ela ficou sem check-in enviado, senão `null`.
 *
 * @param startDate        `clients.start_date`
 * @param prevWeekStatus   status da instância da semana anterior (`undefined`/`null` = nunca criada)
 * @param currentWeekSent  a semana corrente já foi enviada/avaliada? (então o aluno não está "devendo")
 */
export function deriveLateWeek(
  startDate: string,
  prevWeekStatus: string | null | undefined,
  currentWeekSent: boolean,
  now: Date = new Date()
): LateWeek | null {
  if (currentWeekSent) return null;
  const current = computeWeekInfo(startDate, now);
  const prevWeek = current.weekNumber - 1;
  if (prevWeek < 1) return null; // semana 1: não existe semana anterior para atrasar
  if (isCheckinSent(prevWeekStatus)) return null;
  return { weekNumber: prevWeek, ...periodOfWeek(startDate, prevWeek) };
}

/**
 * `status = 'late'` gravado (legado/dados importados) só vale como atraso DEPOIS que o período
 * acabou (domingo, America/Sao_Paulo). Antes disso a semana ainda está aberta — o aluno pode
 * enviar até `periodEnd` — então não é atraso, por mais que o banco diga `late`.
 */
export function isStoredLateOverdue(
  status: string | null | undefined,
  periodEnd: string,
  now: Date = new Date()
): boolean {
  return status === "late" && todayDateSP(now) > periodEnd;
}
