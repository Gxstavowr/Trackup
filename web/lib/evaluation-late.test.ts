import assert from "node:assert/strict";
import test from "node:test";
import { deriveLateWeek, isStoredLateOverdue } from "./evaluation-late";

// 2026-10-12 é segunda; 2026-10-18 é domingo. 13/10 12:00 SP = 15:00Z.
const TUE = new Date("2026-10-13T15:00:00Z");

test("status 'late' gravado não é atraso enquanto o período ainda está aberto", () => {
  assert.equal(isStoredLateOverdue("late", "2026-10-18", TUE), false);
  // Domingo 23:30 em SP (02:30Z de segunda) ainda é dentro do prazo.
  assert.equal(isStoredLateOverdue("late", "2026-10-18", new Date("2026-10-19T02:30:00Z")), false);
});

test("status 'late' gravado vale depois que o período terminou (segunda em SP)", () => {
  assert.equal(isStoredLateOverdue("late", "2026-10-18", new Date("2026-10-19T03:30:00Z")), true);
  assert.equal(isStoredLateOverdue("late", "2026-10-11", TUE), true);
});

test("outros status nunca são atraso gravado", () => {
  assert.equal(isStoredLateOverdue("pending", "2026-10-11", TUE), false);
  assert.equal(isStoredLateOverdue(null, "2026-10-11", TUE), false);
});

test("deriveLateWeek: semana anterior sem envio vira atrasada; semana corrente nunca", () => {
  // Início 2026-09-14 -> semana 5 = 12/10–18/10; semana 4 = 05/10–11/10.
  assert.deepEqual(deriveLateWeek("2026-09-14", undefined, false, TUE), {
    weekNumber: 4,
    periodStart: "2026-10-05",
    periodEnd: "2026-10-11",
  });
  assert.equal(deriveLateWeek("2026-09-14", "submitted", false, TUE), null);
  assert.equal(deriveLateWeek("2026-09-14", undefined, true, TUE), null);
});
