/**
 * Lógica PURA de apresentação da execução do treino (V5 item 31): faixa de progresso por
 * exercício, resumo do cardio prescrito e o feedback discreto ao concluir série/exercício.
 * Sem I/O nem React — testada em `lib/workout-session-ui.test.ts`.
 */

import { isExerciseDone, setKey, setNumbersFor, type PrescribedExerciseLike, type SetKey } from "./workout-session";

// ----------------------------------------------------------------------------
// Faixa de progresso por exercício
// ----------------------------------------------------------------------------

export type SegmentState = "done" | "current" | "partial" | "pending";
export type ExerciseSegment = { id: string; state: SegmentState; done: number; total: number; pct: number };

/**
 * Um segmento por exercício, na ordem do dia. `current` é o exercício em foco ainda incompleto
 * (um exercício em foco já concluído continua "done"); `partial` = tem série feita mas não está
 * em foco; `pct` é o preenchimento do segmento (0–100).
 */
export function exerciseSegments(
  flat: PrescribedExerciseLike[],
  doneKeys: ReadonlySet<SetKey>,
  currentIdx: number
): ExerciseSegment[] {
  return flat.map((ex, i) => {
    const nums = setNumbersFor(ex);
    const done = nums.filter((n) => doneKeys.has(setKey(ex.id, n))).length;
    const total = nums.length;
    const complete = isExerciseDone(ex, doneKeys);
    const state: SegmentState = complete ? "done" : i === currentIdx ? "current" : done > 0 ? "partial" : "pending";
    return { id: ex.id, state, done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  });
}

// ----------------------------------------------------------------------------
// Cardio prescrito junto ao treino
// ----------------------------------------------------------------------------

export type CardioLike = { block_type: string; duration_sec: number | null };
export type CardioSummary = { count: number; totalSec: number | null; label: string };

/** "20 min", "1 h 05 min", "45 s". */
export function formatCardioDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  const totalMin = Math.round(sec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/**
 * Resumo do cardio do dia (blocos `block_type = "cardio"`). `null` quando o dia não tem cardio.
 * A duração só aparece se TODOS os blocos de cardio a informam — nunca se soma parcial como se
 * fosse o total.
 */
export function cardioSummary(exercises: CardioLike[]): CardioSummary | null {
  const cardio = exercises.filter((e) => e.block_type === "cardio");
  if (cardio.length === 0) return null;
  const allTimed = cardio.every((c) => c.duration_sec != null && c.duration_sec > 0);
  const totalSec = allTimed ? cardio.reduce((s, c) => s + (c.duration_sec as number), 0) : null;
  const base = cardio.length === 1 ? "Cardio" : `Cardio (${cardio.length} blocos)`;
  return { count: cardio.length, totalSec, label: totalSec != null ? `${base} · ${formatCardioDuration(totalSec)}` : base };
}

// ----------------------------------------------------------------------------
// Feedback ao concluir
// ----------------------------------------------------------------------------

export type CompletionFlash =
  | { kind: "set"; text: string }
  | { kind: "exercise"; text: string }
  | { kind: "workout"; text: string };

/**
 * Mensagem curta após registrar a série `setNumber` do exercício `idx` (já contada em
 * `doneAfter`). Série comum -> "Série 2 de 4 registrada"; última série do exercício ->
 * "<nome> concluído" (+ "Próximo: <nome>"); tudo feito -> "Treino completo". `null` se for uma
 * re-edição de série (já estava feita antes) — editar não comemora.
 */
export function completionFlash(args: {
  flat: (PrescribedExerciseLike & { name: string })[];
  idx: number;
  setNumber: number;
  doneBefore: ReadonlySet<SetKey>;
  doneAfter: ReadonlySet<SetKey>;
  nextIdx: number | null;
}): CompletionFlash | null {
  const { flat, idx, setNumber, doneBefore, doneAfter, nextIdx } = args;
  const ex = flat[idx];
  if (!ex) return null;
  if (doneBefore.has(setKey(ex.id, setNumber))) return null;
  if (flat.every((e) => isExerciseDone(e, doneAfter))) return { kind: "workout", text: "Treino completo. Falta só finalizar." };
  if (isExerciseDone(ex, doneAfter)) {
    const next = nextIdx != null && nextIdx !== idx ? flat[nextIdx] : null;
    return { kind: "exercise", text: next ? `${ex.name} concluído · Próximo: ${next.name}` : `${ex.name} concluído` };
  }
  const total = setNumbersFor(ex).length;
  return { kind: "set", text: total > 1 ? `Série ${setNumber} de ${total} registrada` : "Registrado" };
}
