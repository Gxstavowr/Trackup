/**
 * Regras PURAS da tela "Avaliação semanal" do aluno (V5 item 33): quais semanas existem, qual
 * abrir, vizinhas e em que ponto do ciclo cada semana está (check-in -> avaliação do coach).
 * Sem I/O. Uma semana só entra se tem check-in enviado OU avaliação enviada; rascunho do coach
 * nunca chega aqui (o chamador só entrega orientações enviadas).
 */

export type CycleCheckin = { weekNumber: number; status: string; submittedAt?: string | null };
export type CycleOrientation = { weekNumber: number; sentAt: string | null };

export function isCheckinSent(status: string | null | undefined): boolean {
  return status === "submitted" || status === "reviewed";
}

/** Semanas com algo para ver, da mais recente para a mais antiga. */
export function evaluationWeekNumbers(checkins: CycleCheckin[], orientations: CycleOrientation[]): number[] {
  const weeks = new Set<number>();
  for (const c of checkins) if (isCheckinSent(c.status)) weeks.add(c.weekNumber);
  for (const o of orientations) weeks.add(o.weekNumber);
  return [...weeks].sort((a, b) => b - a);
}

/**
 * Semana a abrir: a pedida (`?semana=`) se existir na lista; senão a avaliação mais recente já
 * recebida; senão a semana mais recente da lista; senão `null`.
 */
export function pickEvaluationWeek(
  requested: string | number | null | undefined,
  available: number[],
  withOrientation: number[]
): number | null {
  const n = typeof requested === "number" ? requested : Number.parseInt(String(requested ?? ""), 10);
  if (Number.isInteger(n) && available.includes(n)) return n;
  const received = available.find((w) => withOrientation.includes(w));
  return received ?? available[0] ?? null;
}

/** Semana anterior e seguinte DENTRO das disponíveis (lista em qualquer ordem). */
export function adjacentWeeks(selected: number, available: number[]): { older: number | null; newer: number | null } {
  const asc = [...available].sort((a, b) => a - b);
  const i = asc.indexOf(selected);
  if (i < 0) return { older: null, newer: null };
  return { older: asc[i - 1] ?? null, newer: asc[i + 1] ?? null };
}

export type CycleStage = "checkin_open" | "awaiting_evaluation" | "evaluated";

/**
 * Onde a semana está no ciclo: o check-in abre o ciclo, a avaliação do coach o conclui.
 *  - evaluated: o coach enviou a avaliação;
 *  - awaiting_evaluation: check-in enviado, avaliação ainda não;
 *  - checkin_open: nenhum check-in enviado (nem avaliação).
 */
export function cycleStage(checkinStatus: string | null | undefined, hasOrientation: boolean): CycleStage {
  if (hasOrientation) return "evaluated";
  return isCheckinSent(checkinStatus) ? "awaiting_evaluation" : "checkin_open";
}

export const CYCLE_STAGE_TEXT: Record<CycleStage, string> = {
  checkin_open: "O check-in desta semana não foi enviado.",
  awaiting_evaluation: "Check-in enviado. Seu coach ainda não enviou a avaliação.",
  evaluated: "Ciclo concluído: check-in enviado e avaliação recebida.",
};
