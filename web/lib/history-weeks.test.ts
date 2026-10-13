import assert from "node:assert/strict";
import test from "node:test";
import { timelineCheckinState, timelineWeekNumbers } from "./history-weeks";

test("timelineWeekNumbers: lista todas as semanas de 1 até a corrente, mesmo sem registro", () => {
  // Aluno na semana 3 com dado só nas semanas 1 e 3: a semana 2 aparece (como ausência).
  assert.deepEqual(timelineWeekNumbers([1, 3], 3), [3, 2, 1]);
  assert.deepEqual(timelineWeekNumbers([], 3), [3, 2, 1]);
});

test("timelineWeekNumbers: nunca descarta semana com dado fora do intervalo", () => {
  assert.deepEqual(timelineWeekNumbers([5], 3), [5, 3, 2, 1]);
  // Sem data de início: só as semanas com dado.
  assert.deepEqual(timelineWeekNumbers([2, 4], null), [4, 2]);
  assert.deepEqual(timelineWeekNumbers([], null), []);
});

test("timelineCheckinState: enviado/avaliado valem em qualquer semana", () => {
  assert.equal(timelineCheckinState("submitted", 1, 3), "submitted");
  assert.equal(timelineCheckinState("reviewed", 1, 3), "reviewed");
  assert.equal(timelineCheckinState("reviewed", 3, 3), "reviewed");
});

test("timelineCheckinState: semana passada sem envio é 'não enviado'", () => {
  assert.equal(timelineCheckinState("pending", 1, 3), "not_sent");
  assert.equal(timelineCheckinState("late", 2, 3), "not_sent");
  assert.equal(timelineCheckinState(null, 2, 3), "not_sent");
});

test("timelineCheckinState: pendente/atrasado só na semana corrente", () => {
  assert.equal(timelineCheckinState("pending", 3, 3), "pending");
  assert.equal(timelineCheckinState("late", 3, 3), "late");
  assert.equal(timelineCheckinState(null, 3, 3), "pending");
  // Sem semana corrente conhecida: mantém o status gravado; sem instância, não enviado.
  assert.equal(timelineCheckinState("pending", 2, null), "pending");
  assert.equal(timelineCheckinState(null, 2, null), "not_sent");
});
