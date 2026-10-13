import assert from "node:assert/strict";
import test from "node:test";
import { resolveWeekPeriods, weekPeriodLabel } from "./week-label";

const w = (weekNumber: number, periodStart: string, periodEnd: string) => ({ weekNumber, periodStart, periodEnd });

test("instância gravada (qualquer status) manda; sem instância vale o período calculado", () => {
  const out = resolveWeekPeriods(
    [w(11, "2026-09-28", "2026-10-04"), w(12, "2026-10-05", "2026-10-11")],
    [
      { week_number: 11, period_start: "2026-09-29", period_end: "2026-10-05" },
      { week_number: 12, period_start: "2026-10-06", period_end: "2026-10-12" },
    ]
  );
  assert.deepEqual(out.map(weekPeriodLabel), ["Semana 11 · 29/09–05/10", "Semana 12 · 06/10–12/10"]);
});

test("período calculado nunca se sobrepõe ao gravado da semana anterior", () => {
  const out = resolveWeekPeriods(
    [w(12, "2026-10-05", "2026-10-11"), w(11, "2026-09-28", "2026-10-04")],
    [{ week_number: 11, period_start: "2026-09-29", period_end: "2026-10-05" }]
  );
  assert.deepEqual(out.map(weekPeriodLabel), ["Semana 11 · 29/09–05/10", "Semana 12 · 06/10–11/10"]);
});

test("sem nenhuma instância, os períodos calculados ficam como estão", () => {
  const weeks = [w(1, "2026-09-21", "2026-09-27"), w(2, "2026-09-28", "2026-10-04")];
  assert.deepEqual(resolveWeekPeriods(weeks, []), weeks);
});
