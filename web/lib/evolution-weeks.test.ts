import assert from "node:assert/strict";
import test from "node:test";
import { buildEvolutionWeeks, evolutionMaxWeek } from "./evolution-weeks";

// 2026-10-05 é segunda. Início em 2026-09-24 (quinta) -> semana 1 = 21/09 a 27/09.
const START = "2026-09-24";
const TODAY = new Date("2026-10-09T12:00:00Z"); // sexta, semana 3

test("semana corrente da evolução usa a mesma regra de calendário do app", () => {
  assert.equal(evolutionMaxWeek(START, TODAY), 3);
  assert.equal(evolutionMaxWeek(null, TODAY), null);
});

test("métricas acima da semana corrente não entram (sem 'semana 10' quando o app diz semana 3)", () => {
  const weeks = buildEvolutionWeeks(
    [
      { week_number: 1, key: "weight_kg", value: 80 },
      { week_number: 3, key: "weight_kg", value: "79,5" },
      { week_number: 10, key: "weight_kg", value: 78 },
      { week_number: 0, key: "weight_kg", value: 81 },
    ],
    [{ week_number: 10, period_start: "2026-11-23" }],
    { startDate: START, maxWeek: evolutionMaxWeek(START, TODAY) }
  );
  assert.deepEqual(
    weeks.map((w) => w.weekNumber),
    [1, 3]
  );
  assert.equal(weeks[1].values.weight_kg, 79.5);
});

test("sem check-in na semana, a data vem do período calculado pelo start_date", () => {
  const weeks = buildEvolutionWeeks(
    [
      { week_number: 1, key: "waist_cm", value: 90 },
      { week_number: 2, key: "waist_cm", value: 89 },
    ],
    [{ week_number: 2, period_start: "2026-09-28" }],
    { startDate: START, maxWeek: 3 }
  );
  assert.equal(weeks[0].periodStart, "2026-09-21");
  assert.equal(weeks[1].periodStart, "2026-09-28");
});

test("peso <= 0 e valores não numéricos são descartados; sem start_date não há teto", () => {
  const weeks = buildEvolutionWeeks(
    [
      { week_number: 4, key: "weight_kg", value: 0 },
      { week_number: 5, key: "weight_kg", value: "abc" },
      { week_number: 12, key: "weight_kg", value: 70 },
    ],
    [],
    { startDate: null, maxWeek: null }
  );
  assert.deepEqual(weeks, [{ weekNumber: 12, periodStart: null, values: { weight_kg: 70 } }]);
});
