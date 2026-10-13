import assert from "node:assert/strict";
import test from "node:test";
import { pickNextWorkoutDay, pickWorkoutCardMode, resolveCompletedDayIds } from "./portal-today";

test("pickWorkoutCardMode: open session always wins (Continuar treino)", () => {
  assert.equal(pickWorkoutCardMode({ hasOpenSession: true, trainedToday: false, hasNext: true }), "continue");
  // A set logged today inside the still-open session must not read as "concluído".
  assert.equal(pickWorkoutCardMode({ hasOpenSession: true, trainedToday: true, hasNext: true }), "continue");
  // Stale session from another day / all days done this week: still continue it, like /portal/treino.
  assert.equal(pickWorkoutCardMode({ hasOpenSession: true, trainedToday: false, hasNext: false }), "continue");
});

test("pickWorkoutCardMode: no open session keeps the previous rules", () => {
  assert.equal(pickWorkoutCardMode({ hasOpenSession: false, trainedToday: true, hasNext: true }), "done_today");
  assert.equal(pickWorkoutCardMode({ hasOpenSession: false, trainedToday: false, hasNext: false }), "week_done");
  assert.equal(pickWorkoutCardMode({ hasOpenSession: false, trainedToday: false, hasNext: true }), "start");
});

test("resolveCompletedDayIds: session under the old plan version still counts after republish", () => {
  // Plano republicado no meio da semana: dias novos (ids novos), mesma estrutura.
  const days = [
    { id: "new-a", name: "Treino A", sort_order: 0, exercises: [1] },
    { id: "new-b", name: "Treino B", sort_order: 1, exercises: [1] },
    { id: "new-c", name: "Treino C", sort_order: 2, exercises: [1] },
  ];
  const completed = [{ day_id: "old-a", name: "Treino A", sort_order: 0 }];
  const done = resolveCompletedDayIds(days, completed);
  assert.deepEqual([...done], ["new-a"]);
  const progress = pickNextWorkoutDay(days, done);
  assert.equal(progress.doneCount, 1);
  assert.equal(progress.next?.id, "new-b");
});

test("resolveCompletedDayIds: same-version id, renamed day (by position), reordered day (by name)", () => {
  const days = [
    { id: "b", name: "Treino B", sort_order: 0 },
    { id: "a", name: "Treino A", sort_order: 1 },
    { id: "x", name: "Pernas", sort_order: 2 },
  ];
  const done = resolveCompletedDayIds(days, [
    { day_id: "b", name: "Treino B", sort_order: 0 }, // mesma versão
    { day_id: "old-a", name: " treino a ", sort_order: 0 }, // reordenado: casa pelo nome
    { day_id: "old-c", name: "Treino C", sort_order: 2 }, // renomeado: casa pela posição
    { day_id: "old-z", name: null, sort_order: 9 }, // dia que não existe mais: ignora
  ]);
  assert.deepEqual([...done].sort(), ["a", "b", "x"]);
});
