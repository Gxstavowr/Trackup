import assert from "node:assert/strict";
import test from "node:test";
import { adjacentWeeks, cycleStage, evaluationWeekNumbers, pickEvaluationWeek } from "./history-evaluation";

const checkins = [
  { weekNumber: 3, status: "reviewed" },
  { weekNumber: 4, status: "submitted" },
  { weekNumber: 5, status: "pending" },
  { weekNumber: 1, status: "submitted" },
];
const orientations = [{ weekNumber: 3, sentAt: "2026-09-14T10:00:00Z" }, { weekNumber: 2, sentAt: "2026-09-07T10:00:00Z" }];

test("semanas: check-in enviado ou avaliação recebida, mais recente primeiro; pendente fica de fora", () => {
  assert.deepEqual(evaluationWeekNumbers(checkins, orientations), [4, 3, 2, 1]);
  assert.deepEqual(evaluationWeekNumbers([], []), []);
});

test("semana aberta: a pedida, senão a avaliação mais recente recebida, senão a mais recente", () => {
  const weeks = [4, 3, 2, 1];
  assert.equal(pickEvaluationWeek("2", weeks, [3, 2]), 2);
  assert.equal(pickEvaluationWeek("99", weeks, [3, 2]), 3);
  assert.equal(pickEvaluationWeek("abc", weeks, [3, 2]), 3);
  assert.equal(pickEvaluationWeek(undefined, weeks, []), 4);
  assert.equal(pickEvaluationWeek(undefined, [], []), null);
  assert.equal(pickEvaluationWeek(3, weeks, [3]), 3);
});

test("semanas vizinhas dentro das disponíveis", () => {
  assert.deepEqual(adjacentWeeks(3, [4, 3, 1]), { older: 1, newer: 4 });
  assert.deepEqual(adjacentWeeks(4, [4, 3, 1]), { older: 3, newer: null });
  assert.deepEqual(adjacentWeeks(9, [4, 3, 1]), { older: null, newer: null });
});

test("ciclo: check-in abre, avaliação conclui", () => {
  assert.equal(cycleStage("pending", false), "checkin_open");
  assert.equal(cycleStage(null, false), "checkin_open");
  assert.equal(cycleStage("submitted", false), "awaiting_evaluation");
  assert.equal(cycleStage("reviewed", false), "awaiting_evaluation");
  assert.equal(cycleStage("submitted", true), "evaluated");
  assert.equal(cycleStage(null, true), "evaluated");
});
