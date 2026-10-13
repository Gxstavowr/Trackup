import type { CheckinInstanceStatus } from "@/lib/repository";

/**
 * Regras PURAS da timeline do histórico (sem I/O): quais semanas aparecem e como o check-in de
 * cada uma é descrito. Separadas de `lib/history.ts` (que é `server-only`) para poderem ser
 * testadas.
 */

/**
 * Semanas da timeline, mais recente primeiro: TODAS de 1 até a semana corrente do aluno (as
 * semanas sem nenhum registro aparecem como ausência, igual ao "Contexto histórico" da
 * avaliação), mais qualquer semana com dado fora desse intervalo (nunca some dado registrado).
 * `currentWeek` nulo (aluno sem data de início): só as semanas que têm dado.
 */
export function timelineWeekNumbers(withData: Iterable<number>, currentWeek: number | null): number[] {
  const weeks = new Set<number>(withData);
  if (currentWeek != null) {
    for (let w = 1; w <= currentWeek; w++) weeks.add(w);
  }
  return [...weeks].sort((a, b) => b - a);
}

export type TimelineCheckinState = "reviewed" | "submitted" | "late" | "pending" | "not_sent";

/**
 * Situação do check-in de UMA semana na timeline. "Pendente"/"atrasado" só fazem sentido na
 * semana corrente (ainda dá pra enviar); semana que já passou sem envio — com instância
 * pendente/atrasada ou sem instância nenhuma — é "não enviado".
 */
export function timelineCheckinState(
  status: CheckinInstanceStatus | null,
  weekNumber: number,
  currentWeek: number | null
): TimelineCheckinState {
  if (status === "reviewed" || status === "submitted") return status;
  const past = currentWeek != null && weekNumber < currentWeek;
  if (past) return "not_sent";
  // Semana corrente ainda sem instância: o check-in só não foi aberto/enviado AINDA.
  if (status == null) return currentWeek != null && weekNumber === currentWeek ? "pending" : "not_sent";
  return status;
}
