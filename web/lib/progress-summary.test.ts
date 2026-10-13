import assert from "node:assert/strict";
import test from "node:test";
import { buildProgressSummary } from "./progress-summary";
import type { EvolutionData } from "./evolution-format";

const weight = [82, 81.5, 81, 80.5, 80, 79.5, 79, 78.5, 78, 77.5];
const evolution: EvolutionData = {
  clientName: "Ana",
  metrics: [{ key: "weight_kg", label: "Peso", unit: "kg", source: "catalog", goalDirection: "decrease", targetValue: null }],
  weeks: weight.map((w, i) => ({ weekNumber: i + 1, periodStart: null, values: { weight_kg: w } })),
};
const checkins = weight.map((_, i) => ({ weekNumber: i + 1, status: "reviewed" }));

function text(period?: 4 | 8 | 12 | "all") {
  const s = buildProgressSummary({ evolution, checkins, goals: [], currentWeek: 10, period });
  assert.equal(s.status, "ok");
  if (s.status !== "ok") throw new Error("unreachable");
  return s;
}

test("resumo: sem período usa as últimas 4 semanas com medidas", () => {
  const s = text();
  assert.equal(s.periodLabel, "Semanas 7 a 10");
  assert.match(s.items[0].text, /de 79 kg \(semana 7\) para 77,5 kg \(semana 10\)/);
});

test("resumo: segue o período escolhido no seletor (8 e completo)", () => {
  assert.equal(text(8).periodLabel, "Semanas 3 a 10");
  assert.match(text(8).items[0].text, /de 81 kg \(semana 3\)/);
  const all = text("all");
  assert.equal(all.periodLabel, "Semanas 1 a 10");
  assert.match(all.items[0].text, /de 82 kg \(semana 1\) para 77,5 kg \(semana 10\)/);
});

test("resumo: check-ins contados na mesma janela do período", () => {
  const four = text(4).items.find((i) => i.id === "checkins");
  assert.match(four?.text ?? "", /semanas 7 a 10: 4 de 4/);
  const all = text("all").items.find((i) => i.id === "checkins");
  assert.match(all?.text ?? "", /semanas 1 a 10: 10 de 10/);
});

test("resumo: período maior que o histórico usa tudo e exige 2 semanas", () => {
  const one: EvolutionData = { ...evolution, weeks: evolution.weeks.slice(0, 1) };
  const s = buildProgressSummary({ evolution: one, checkins: [], goals: [], currentWeek: 1, period: 12 });
  assert.equal(s.status, "insufficient");
});
