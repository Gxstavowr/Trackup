import test from "node:test";
import assert from "node:assert/strict";
import {
  computeMealClock,
  formatCountdown,
  headlineLabels,
  hhmm,
  MISSED_LABEL,
  NOW_WINDOW_MIN,
  slotLabel,
  type ClockMeal,
} from "./meal-clock";

/**
 * Testes do relógio de refeições (V3 tarefa 10). Rodar (pasta `web/`):
 * `npx --yes tsx --test lib/meal-clock.test.ts`
 */

const at = (h: number, m = 0, s = 0) => h * 60 + m + s / 60;
const meal = (id: string, time: string | null, day_of_week: number | null = null): ClockMeal => ({
  id,
  name: id,
  time,
  day_of_week,
});

const plan = [meal("cafe", "07:30:00"), meal("almoco", "12:00:00"), meal("lanche", "16:00"), meal("jantar", "19:30:00")];
const THU = 4; // JS: quinta

test("hhmm normaliza e rejeita inválido", () => {
  assert.equal(hhmm("07:30:00"), "07:30");
  assert.equal(hhmm("7:05"), "07:05");
  assert.equal(hhmm(null), null);
  assert.equal(hhmm("25:00"), null);
  assert.equal(hhmm("abc"), null);
});

test("formatCountdown: limiares de minutos e horas", () => {
  assert.equal(formatCountdown(0), "Agora");
  assert.equal(formatCountdown(-3), "Agora");
  assert.equal(formatCountdown(1), "Em 1 min");
  assert.equal(formatCountdown(10), "Em 10 min");
  assert.equal(formatCountdown(20), "Em 20 min");
  assert.equal(formatCountdown(40), "Em 40 min");
  assert.equal(formatCountdown(59), "Em 59 min");
  assert.equal(formatCountdown(60), "Em 1 h");
  assert.equal(formatCountdown(65), "Em 1 h 05 min");
  assert.equal(formatCountdown(150), "Em 2 h 30 min");
  assert.equal(formatCountdown(0.4), "Em 1 min");
});

test("próxima refeição com contagem regressiva (40/20/10 min)", () => {
  for (const [nowMin, label] of [
    [at(18, 50), "Em 40 min"],
    [at(19, 10), "Em 20 min"],
    [at(19, 20), "Em 10 min"],
    [at(19, 29, 30), "Em 1 min"],
  ] as const) {
    const c = computeMealClock(plan, THU, nowMin, { cafe: "done", almoco: "done", lanche: "done" });
    assert.equal(c.headline.kind, "upcoming");
    if (c.headline.kind !== "upcoming") return;
    assert.equal(c.headline.meal.id, "jantar");
    assert.equal(c.headline.time, "19:30");
    assert.equal(headlineLabels(c.headline).when, label);
    assert.equal(c.primaryId, "jantar");
  }
});

test("contagem longa vira horas e minutos", () => {
  const c = computeMealClock(plan, THU, at(10, 55), { cafe: "done" });
  assert.equal(c.headline.kind, "upcoming");
  assert.equal(headlineLabels(c.headline).when, "Em 1 h 05 min");
});

test("janela 'Agora': do horário até 30 min depois, sem registro", () => {
  const exact = computeMealClock(plan, THU, at(19, 30), { cafe: "done", almoco: "done", lanche: "done" });
  assert.equal(exact.headline.kind, "now");
  assert.equal(headlineLabels(exact.headline).when, "Agora");
  assert.equal(exact.slots.jantar.kind, "now");

  const late = computeMealClock(plan, THU, at(19, 30 + NOW_WINDOW_MIN - 1, 59), { cafe: "done", almoco: "done", lanche: "done" });
  assert.equal(late.headline.kind, "now");

  const after = computeMealClock(plan, THU, at(19, 30 + NOW_WINDOW_MIN), { cafe: "done", almoco: "done", lanche: "done" });
  assert.equal(after.slots.jantar.kind, "missed");
  assert.notEqual(after.headline.kind, "now");
});

test("horário passou sem registro: estado não punitivo e destaque vai para a próxima", () => {
  const c = computeMealClock(plan, THU, at(12, 45), { cafe: "done" });
  assert.equal(c.slots.almoco.kind, "missed");
  assert.equal(slotLabel(c.slots.almoco), MISSED_LABEL);
  assert.equal(c.headline.kind, "upcoming");
  if (c.headline.kind === "upcoming") assert.equal(c.headline.meal.id, "lanche");
  assert.equal(c.previous?.meal.id, "almoco");
  assert.equal(c.previous?.slot.kind, "missed");
});

test("registrada não é 'agora' nem 'próxima' e aparece como contexto", () => {
  const c = computeMealClock(plan, THU, at(12, 10), { cafe: "done", almoco: "partial" });
  assert.deepEqual(c.slots.almoco, { kind: "registered", status: "partial" });
  assert.equal(slotLabel(c.slots.almoco), "Registrada · parcial");
  assert.equal(c.headline.kind, "upcoming");
  if (c.headline.kind === "upcoming") assert.equal(c.headline.meal.id, "lanche");
  assert.equal(c.previous?.meal.id, "almoco");

  // Registrada antes do horário também sai do destaque.
  const early = computeMealClock(plan, THU, at(18, 0), { jantar: "done" });
  assert.deepEqual(early.slots.jantar, { kind: "registered", status: "done" });
  assert.equal(early.primaryId, null);
  assert.equal(headlineLabels(early.headline).when, "Amanhã · 07:30");
});

test("passou a última refeição do dia: 'Amanhã · 07:30'", () => {
  const c = computeMealClock(plan, THU, at(21, 0), { cafe: "done", almoco: "done", lanche: "done", jantar: "done" });
  assert.equal(c.headline.kind, "later-day");
  assert.equal(headlineLabels(c.headline).when, "Amanhã · 07:30");
  assert.equal(c.primaryId, null);
  assert.equal(c.previous?.meal.id, "jantar");

  // Jantar sem registro depois da janela: destaque é amanhã, contexto mostra o jantar pendente.
  const missed = computeMealClock(plan, THU, at(22, 0), { cafe: "done" });
  assert.equal(missed.headline.kind, "later-day");
  assert.equal(missed.previous?.slot.kind, "missed");
});

test("horários por dia da semana: usa só as refeições do dia (e as de todo dia)", () => {
  const weekly = [
    meal("cafe-semana", "06:30", 4), // quinta
    meal("cafe-sexta", "09:00", 5), // sexta
    meal("ceia", "22:00", null), // todo dia
  ];
  const thu = computeMealClock(weekly, THU, at(6, 0), {});
  assert.equal(thu.headline.kind, "upcoming");
  if (thu.headline.kind === "upcoming") assert.equal(thu.headline.meal.id, "cafe-semana");
  assert.equal(thu.slots["cafe-sexta"], undefined);

  // Quinta depois da ceia: amanhã (sexta) começa às 09:00, não 06:30.
  const night = computeMealClock(weekly, THU, at(23, 0), { "cafe-semana": "done", ceia: "done" });
  assert.equal(night.headline.kind, "later-day");
  assert.equal(headlineLabels(night.headline).when, "Amanhã · 09:00");

  // Sábado sem refeição própria cedo: só a ceia de todo dia.
  const sat = computeMealClock(weekly, 6, at(8, 0), {});
  if (sat.headline.kind === "upcoming") assert.equal(sat.headline.meal.id, "ceia");
  else assert.fail("esperava upcoming");
});

test("próxima refeição em outro dia além de amanhã usa o nome do dia", () => {
  const onlyMonday = [meal("cafe", "07:00", 1)];
  const c = computeMealClock(onlyMonday, THU, at(10, 0), {});
  assert.equal(c.headline.kind, "later-day");
  assert.equal(headlineLabels(c.headline).when, "Segunda · 07:00");
});

test("sem horários no plano: estado neutro, nada inventado", () => {
  const c = computeMealClock([meal("a", null), meal("b", null)], THU, at(12, 0), {});
  assert.equal(c.headline.kind, "no-times");
  assert.equal(c.primaryId, null);
  assert.equal(c.slots.a.kind, "untimed");
  assert.equal(headlineLabels(c.headline).when, null);

  const empty = computeMealClock([], THU, at(12, 0), {});
  assert.equal(empty.headline.kind, "empty");
});

test("duas refeições na janela 'Agora': destaca a mais recente", () => {
  const close = [meal("a", "12:00"), meal("b", "12:15")];
  const c = computeMealClock(close, THU, at(12, 20), {});
  assert.equal(c.headline.kind, "now");
  if (c.headline.kind === "now") assert.equal(c.headline.meal.id, "b");
  assert.equal(c.previous?.meal.id, "a");
});

test("contagem regressiva local: Em 40 / 20 / 10 min e Agora conforme o relógio avança", () => {
  const meals = [meal("a", "12:00")];
  const labelAt = (nowMin: number) => {
    const c = computeMealClock(meals, 3, nowMin, {});
    return headlineLabels(c.headline).when;
  };
  assert.equal(labelAt(at(11, 20)), "Em 40 min");
  assert.equal(labelAt(at(11, 40)), "Em 20 min");
  assert.equal(labelAt(at(11, 50)), "Em 10 min");
  assert.equal(labelAt(at(11, 59, 30)), "Em 1 min");
  assert.equal(labelAt(at(12, 0)), "Agora");
});
