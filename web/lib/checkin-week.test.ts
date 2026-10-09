import assert from "node:assert/strict";
import test from "node:test";
import { computeWeekInfo, mondayOf, periodOfWeek } from "./checkin-week";

// 2026-10-05 é segunda; 2026-10-11 é domingo.

test("mondayOf devolve a segunda da semana de calendário", () => {
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(mondayOf("2026-10-08"), "2026-10-05");
  assert.equal(mondayOf("2026-10-11"), "2026-10-05");
  assert.equal(mondayOf("2026-10-12"), "2026-10-12");
});

test("semana 1 é a semana de calendário do início, mesmo começando no domingo", () => {
  const info = computeWeekInfo("2026-10-11", new Date("2026-10-11T15:00:00Z"));
  assert.deepEqual(info, { weekNumber: 1, periodStart: "2026-10-05", periodEnd: "2026-10-11" });
  // Segunda seguinte já é a semana 2.
  assert.equal(computeWeekInfo("2026-10-11", new Date("2026-10-12T15:00:00Z")).weekNumber, 2);
});

test("toda a janela sexta-domingo cai numa semana só, para qualquer dia de início", () => {
  for (let d = 5; d <= 11; d++) {
    const start = `2026-10-${String(d).padStart(2, "0")}`;
    const fri = computeWeekInfo(start, new Date("2026-10-23T12:00:00Z"));
    const sun = computeWeekInfo(start, new Date("2026-10-25T12:00:00Z"));
    assert.equal(fri.weekNumber, 3);
    assert.deepEqual(sun, fri);
    assert.deepEqual(fri, { weekNumber: 3, periodStart: "2026-10-19", periodEnd: "2026-10-25" });
  }
});

test("domingo à noite em São Paulo ainda é a semana que está fechando (já é segunda em UTC)", () => {
  // Domingo 2026-10-25 23:30 em SP = segunda 02:30 UTC.
  assert.equal(computeWeekInfo("2026-10-05", new Date("2026-10-26T02:30:00Z")).weekNumber, 3);
  // Segunda 00:00 em SP = 03:00 UTC: vira a semana.
  assert.equal(computeWeekInfo("2026-10-05", new Date("2026-10-26T03:00:00Z")).weekNumber, 4);
});

test("antes do início, fica na semana 1", () => {
  assert.equal(computeWeekInfo("2026-10-20", new Date("2026-10-10T12:00:00Z")).weekNumber, 1);
});

test("periodOfWeek bate com computeWeekInfo", () => {
  assert.deepEqual(periodOfWeek("2026-10-08", 4), { periodStart: "2026-10-26", periodEnd: "2026-11-01" });
});
