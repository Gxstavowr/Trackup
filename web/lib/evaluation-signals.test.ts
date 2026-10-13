import assert from "node:assert/strict";
import test from "node:test";
import { deriveSignalCards } from "./evaluation-signals";
import type { ContextWeek, EvaluationDetail } from "./evaluations";

function detail(context: ContextWeek[], weight: EvaluationDetail["weight"]): EvaluationDetail {
  return {
    row: { weekNumber: 10, submittedAt: "2026-10-12T12:00:00Z", periodEnd: "2026-10-18" },
    answers: [],
    weight,
    goals: [],
    context,
    adherenceIsScale: true,
    sessionsDone: null,
    orientation: null,
    previousOrientation: null,
  } as unknown as EvaluationDetail;
}

const w = (weekNumber: number, weight: number, adherence: number, energy: number): ContextWeek => ({
  weekNumber,
  weight,
  adherence,
  energy,
  submitted: true,
});

test("variação comum contra a semana anterior não vira cartão (já está na comparação)", () => {
  const cards = deriveSignalCards(
    detail([w(9, 79, 4, 4), w(10, 78.5, 5, 4)], { current: 78.5, previous: { value: 79, weekNumber: 9 }, delta: -0.5 })
  );
  assert.equal(cards.find((c) => c.id === "weight"), undefined);
  assert.equal(cards.find((c) => c.id === "adherence"), undefined);
});

test("contexto dos cartões lista só semanas passadas, nunca a atual", () => {
  const cards = deriveSignalCards(
    detail([w(7, 79, 4, 4), w(8, 79.2, 4, 4), w(9, 79, 4, 4), w(10, 78.5, 4, 4)], {
      current: 78.5,
      previous: { value: 79, weekNumber: 9 },
      delta: -0.5,
    })
  );
  assert.ok(cards.length > 0);
  for (const card of cards) {
    for (const row of card.context ?? []) {
      assert.notEqual(row.label, "Semana 10", `${card.id} repete a semana atual`);
      assert.ok(!row.current);
      assert.ok(!row.value.includes("78,5"));
    }
    assert.ok(!card.description.includes("78,5"), `${card.id} repete o peso atual`);
  }
});

test("variação acima do limite continua como sinal", () => {
  const cards = deriveSignalCards(
    detail([w(9, 80, 5, 4), w(10, 78.5, 3, 4)], { current: 78.5, previous: { value: 80, weekNumber: 9 }, delta: -1.5 })
  );
  assert.equal(cards.find((c) => c.id === "weight")?.badge, "Variação relevante");
  assert.equal(cards.find((c) => c.id === "adherence")?.tone, "attention");
});
