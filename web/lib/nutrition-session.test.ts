import assert from "node:assert/strict";
import test from "node:test";
import {
  clampWaterMl,
  computeDaySummary,
  computeWaterProgress,
  indexMealLogsByMealId,
  jsWeekdayToDayOfWeek,
  mealCountsAsEaten,
  mealStatusLabel,
} from "./nutrition-session";

/**
 * Testes das funções puras da experiência de nutrição do aluno (item 21). Rodar (pasta
 * `web/`): `npx tsx --test lib/nutrition-session.test.ts`
 */

// ----------------------------------------------------------------------------
// jsWeekdayToDayOfWeek
// ----------------------------------------------------------------------------

test("jsWeekdayToDayOfWeek: domingo (0) vira 7", () => {
  assert.equal(jsWeekdayToDayOfWeek(0), 7);
});

test("jsWeekdayToDayOfWeek: segunda (1) a sábado (6) mantém o número", () => {
  assert.equal(jsWeekdayToDayOfWeek(1), 1);
  assert.equal(jsWeekdayToDayOfWeek(3), 3);
  assert.equal(jsWeekdayToDayOfWeek(6), 6);
});

// ----------------------------------------------------------------------------
// mealStatusLabel / mealCountsAsEaten
// ----------------------------------------------------------------------------

test("mealStatusLabel: traduz os 3 status e cai em 'Pendente' sem status", () => {
  assert.equal(mealStatusLabel("done"), "Realizada");
  assert.equal(mealStatusLabel("partial"), "Parcial");
  assert.equal(mealStatusLabel("skipped"), "Não realizada");
  assert.equal(mealStatusLabel(null), "Pendente");
  assert.equal(mealStatusLabel(undefined), "Pendente");
});

test("mealCountsAsEaten: done e partial contam, skipped e pendente não", () => {
  assert.equal(mealCountsAsEaten("done"), true);
  assert.equal(mealCountsAsEaten("partial"), true);
  assert.equal(mealCountsAsEaten("skipped"), false);
  assert.equal(mealCountsAsEaten(null), false);
  assert.equal(mealCountsAsEaten(undefined), false);
});

// ----------------------------------------------------------------------------
// indexMealLogsByMealId
// ----------------------------------------------------------------------------

test("indexMealLogsByMealId: indexa por meal_id e ignora log sem meal_id", () => {
  const logs = [
    { meal_id: "m1", status: "done" as const },
    { meal_id: null, status: "done" as const },
    { meal_id: "m2", status: "skipped" as const },
  ];
  const map = indexMealLogsByMealId(logs);
  assert.equal(map.size, 2);
  assert.equal(map.get("m1")?.status, "done");
  assert.equal(map.get("m2")?.status, "skipped");
});

// ----------------------------------------------------------------------------
// computeDaySummary
// ----------------------------------------------------------------------------

function meal(id: string, kcal: number): { id: string; items: { macros: { kcal: number } }[] } {
  return { id, items: [{ macros: { kcal } }] };
}

test("computeDaySummary: conta cada status e soma macros planejados x consumidos", () => {
  const todayMeals = [meal("a", 400), meal("b", 300), meal("c", 200), meal("d", 100)];
  const logsByMealId = indexMealLogsByMealId([
    { meal_id: "a", status: "done" as const },
    { meal_id: "b", status: "partial" as const },
    { meal_id: "c", status: "skipped" as const },
    // "d" fica pendente (sem log)
  ]);

  const summary = computeDaySummary(todayMeals, logsByMealId);

  assert.equal(summary.mealsTotal, 4);
  assert.equal(summary.mealsDone, 1);
  assert.equal(summary.mealsPartial, 1);
  assert.equal(summary.mealsSkipped, 1);
  assert.equal(summary.mealsPending, 1);
  assert.equal(summary.macrosPlanned.kcal, 1000); // todas as refeições de hoje
  assert.equal(summary.macrosConsumed.kcal, 700); // só done (400) + partial (300)
});

test("computeDaySummary: dia sem refeições dá tudo zerado, sem NaN", () => {
  const summary = computeDaySummary([], new Map());
  assert.deepEqual(summary, {
    mealsTotal: 0,
    mealsDone: 0,
    mealsPartial: 0,
    mealsSkipped: 0,
    mealsPending: 0,
    macrosPlanned: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    macrosConsumed: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  });
});

// ----------------------------------------------------------------------------
// computeWaterProgress / clampWaterMl
// ----------------------------------------------------------------------------

test("computeWaterProgress: calcula percentual e restante quando há meta", () => {
  const progress = computeWaterProgress(1500, 2000);
  assert.equal(progress.pct, 75);
  assert.equal(progress.remainingMl, 500);
  assert.equal(progress.targetMl, 2000);
});

test("computeWaterProgress: sem meta (null/0/negativo), pct e restante ficam null", () => {
  assert.equal(computeWaterProgress(1000, null).pct, null);
  assert.equal(computeWaterProgress(1000, undefined).pct, null);
  assert.equal(computeWaterProgress(1000, 0).pct, null);
});

test("computeWaterProgress: passar da meta dá percentual acima de 100, sem teto artificial", () => {
  const progress = computeWaterProgress(2500, 2000);
  assert.equal(progress.pct, 125);
  assert.equal(progress.remainingMl, 0); // nunca negativo
});

test("clampWaterMl: nunca fica negativo", () => {
  assert.equal(clampWaterMl(-50), 0);
});

test("clampWaterMl: nunca passa do teto do banco (20000)", () => {
  assert.equal(clampWaterMl(25000), 20000);
});

test("clampWaterMl: arredonda e mantém valores dentro da faixa", () => {
  assert.equal(clampWaterMl(750.4), 750);
  assert.equal(clampWaterMl(1250), 1250);
});
