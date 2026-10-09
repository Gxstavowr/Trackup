import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionSummary,
  computeElapsedSeconds,
  computeSessionProgress,
  formatDuration,
  formatRestClock,
  groupPreviousPerformance,
  isExerciseDone,
  setKey,
  setNumbersFor,
  unitCountFor,
  type PrescribedExerciseLike,
} from "./workout-session";

/**
 * Testes das funções puras da execução do treino pelo aluno (item 19). Rodar (pasta `web/`):
 * `npx tsx --test lib/workout-session.test.ts`
 */

function exercise(over: Partial<PrescribedExerciseLike> & { id: string }): PrescribedExerciseLike {
  return { sets: 3, block_type: "normal", ...over };
}

// ----------------------------------------------------------------------------
// unitCountFor / setNumbersFor
// ----------------------------------------------------------------------------

test("unitCountFor: usa sets quando definido e positivo", () => {
  assert.equal(unitCountFor(exercise({ id: "1", sets: 4 })), 4);
});

test("unitCountFor: cai pra 1 unidade quando sets é null (cardio por duração)", () => {
  assert.equal(unitCountFor(exercise({ id: "1", sets: null, block_type: "cardio" })), 1);
});

test("unitCountFor: nunca zero mesmo com sets = 0", () => {
  assert.equal(unitCountFor(exercise({ id: "1", sets: 0 })), 1);
});

test("setNumbersFor: gera a sequência 1..N", () => {
  assert.deepEqual(setNumbersFor(exercise({ id: "1", sets: 3 })), [1, 2, 3]);
});

// ----------------------------------------------------------------------------
// computeSessionProgress / isExerciseDone
// ----------------------------------------------------------------------------

test("computeSessionProgress: soma séries de todos os exercícios do dia", () => {
  const exercises = [exercise({ id: "a", sets: 3 }), exercise({ id: "b", sets: 2 })];
  const done = new Set([setKey("a", 1), setKey("a", 2), setKey("b", 1)]);
  const progress = computeSessionProgress(exercises, done);
  assert.deepEqual(progress, { done: 3, total: 5, pct: 60 });
});

test("computeSessionProgress: dia vazio dá 0/0 sem NaN", () => {
  assert.deepEqual(computeSessionProgress([], new Set()), { done: 0, total: 0, pct: 0 });
});

test("isExerciseDone: só true quando TODAS as séries estão marcadas", () => {
  const ex = exercise({ id: "a", sets: 2 });
  assert.equal(isExerciseDone(ex, new Set([setKey("a", 1)])), false);
  assert.equal(isExerciseDone(ex, new Set([setKey("a", 1), setKey("a", 2)])), true);
});

// ----------------------------------------------------------------------------
// groupPreviousPerformance
// ----------------------------------------------------------------------------

test("groupPreviousPerformance: fica só com a sessão mais recente por exercício prescrito", () => {
  const logs = [
    { workout_exercise_id: "we1", session_id: "s2", set_number: 1 }, // mais recente (primeiro na lista DESC)
    { workout_exercise_id: "we1", session_id: "s2", set_number: 2 },
    { workout_exercise_id: "we1", session_id: "s1", set_number: 1 }, // sessão antiga — deve sumir
    { workout_exercise_id: "we2", session_id: "s2", set_number: 1 },
  ];
  const grouped = groupPreviousPerformance(logs);
  assert.deepEqual(grouped.get("we1")?.map((l) => l.session_id), ["s2", "s2"]);
  assert.equal(grouped.get("we1")?.length, 2);
  assert.equal(grouped.get("we2")?.length, 1);
});

test("groupPreviousPerformance: exclui a sessão atual (não compara consigo mesma)", () => {
  const logs = [
    { workout_exercise_id: "we1", session_id: "current", set_number: 1 },
    { workout_exercise_id: "we1", session_id: "previous", set_number: 1 },
  ];
  const grouped = groupPreviousPerformance(logs, "current");
  assert.deepEqual(grouped.get("we1")?.map((l) => l.session_id), ["previous"]);
});

test("groupPreviousPerformance: ordena as séries devolvidas por set_number", () => {
  const logs = [
    { workout_exercise_id: "we1", session_id: "s1", set_number: 3 },
    { workout_exercise_id: "we1", session_id: "s1", set_number: 1 },
    { workout_exercise_id: "we1", session_id: "s1", set_number: 2 },
  ];
  const grouped = groupPreviousPerformance(logs);
  assert.deepEqual(grouped.get("we1")?.map((l) => l.set_number), [1, 2, 3]);
});

test("groupPreviousPerformance: ignora logs sem workout_exercise_id (log antigo por semana)", () => {
  const logs = [{ workout_exercise_id: null, session_id: null, set_number: null }];
  const grouped = groupPreviousPerformance(logs);
  assert.equal(grouped.size, 0);
});

// ----------------------------------------------------------------------------
// formatRestClock / formatDuration / computeElapsedSeconds
// ----------------------------------------------------------------------------

test("formatRestClock: mm:ss com segundo com zero à esquerda", () => {
  assert.equal(formatRestClock(95), "1:35");
  assert.equal(formatRestClock(5), "0:05");
  assert.equal(formatRestClock(0), "0:00");
});

test("formatRestClock: nunca fica negativo", () => {
  assert.equal(formatRestClock(-10), "0:00");
});

test("formatDuration: minutos só, e horas+minutos acima de 1h", () => {
  assert.equal(formatDuration(8 * 60), "8min");
  assert.equal(formatDuration(72 * 60), "1h 12min");
});

test("computeElapsedSeconds: exclui o total já pausado", () => {
  const now = new Date("2026-01-01T10:30:00Z");
  const session = {
    started_at: "2026-01-01T10:00:00Z",
    paused_at: null,
    paused_total_sec: 300, // 5min pausados
    ended_at: null,
  };
  // 30min corridos - 5min pausados = 25min = 1500s
  assert.equal(computeElapsedSeconds(session, now), 1500);
});

test("computeElapsedSeconds: soma a pausa em andamento até `now`", () => {
  const now = new Date("2026-01-01T10:20:00Z");
  const session = {
    started_at: "2026-01-01T10:00:00Z",
    paused_at: "2026-01-01T10:10:00Z", // pausou há 10min, ainda pausado
    paused_total_sec: 0,
    ended_at: null,
  };
  // 20min corridos - 10min de pausa em andamento = 10min = 600s
  assert.equal(computeElapsedSeconds(session, now), 600);
});

test("computeElapsedSeconds: usa ended_at como fim quando a sessão já terminou", () => {
  const session = {
    started_at: "2026-01-01T10:00:00Z",
    paused_at: null,
    paused_total_sec: 0,
    ended_at: "2026-01-01T10:15:00Z",
  };
  // now bem depois do fim não deveria importar
  assert.equal(computeElapsedSeconds(session, new Date("2026-01-01T23:00:00Z")), 900);
});

// ----------------------------------------------------------------------------
// buildSessionSummary
// ----------------------------------------------------------------------------

test("buildSessionSummary: agrega séries, exercícios concluídos e volume", () => {
  const exercises = [exercise({ id: "a", sets: 2 }), exercise({ id: "b", sets: 1 })];
  const logs = [
    { workout_exercise_id: "a", set_number: 1, load: 20, reps: 10 },
    { workout_exercise_id: "a", set_number: 2, load: 22.5, reps: 8 },
    { workout_exercise_id: "b", set_number: 1, load: null, reps: null }, // cardio, sem carga
  ];
  const summary = buildSessionSummary(exercises, logs, 1800);
  assert.equal(summary.exercisesDone, 2);
  assert.equal(summary.exercisesTotal, 2);
  assert.equal(summary.setsDone, 3);
  assert.equal(summary.setsTotal, 3);
  assert.equal(summary.totalVolume, 20 * 10 + 22.5 * 8);
  assert.equal(summary.durationSec, 1800);
});

test("buildSessionSummary: exercício parcialmente feito não conta como concluído", () => {
  const exercises = [exercise({ id: "a", sets: 3 })];
  const logs = [{ workout_exercise_id: "a", set_number: 1, load: 10, reps: 10 }];
  const summary = buildSessionSummary(exercises, logs, 60);
  assert.equal(summary.exercisesDone, 0);
  assert.equal(summary.setsDone, 1);
  assert.equal(summary.setsTotal, 3);
});
