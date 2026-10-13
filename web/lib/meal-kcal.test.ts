import test from "node:test";
import assert from "node:assert/strict";
import { formatItemKcal, formatKcalSum, itemKcal, mealKcal, mealsKcal, missingKcalNote, sumItemsKcal } from "./meal-kcal";

/** Rodar (pasta `web/`): `npx --yes tsx --test lib/meal-kcal.test.ts` */

test("itemKcal: null quando ausente (nunca 0)", () => {
  assert.equal(itemKcal({ macros: { kcal: 192 } }), 192);
  assert.equal(itemKcal({ macros: { protein_g: 3 } }), null);
  assert.equal(itemKcal({ macros: null }), null);
  assert.equal(itemKcal({ macros: { kcal: 0 } }), 0);
});

test("soma só o que existe e marca parcial", () => {
  const full = sumItemsKcal([{ macros: { kcal: 100 } }, { macros: { kcal: 50 } }]);
  assert.deepEqual(full, { kcal: 150, itemCount: 2, missingCount: 0, partial: false });
  assert.equal(formatKcalSum(full), "150 kcal");

  const partial = sumItemsKcal([{ macros: { kcal: 100 } }, { macros: {} }]);
  assert.equal(partial.kcal, 100);
  assert.equal(partial.partial, true);
  assert.equal(formatKcalSum(partial), "100 kcal · parcial");
  assert.equal(missingKcalNote(partial), "1 alimento sem kcal");

  const none = sumItemsKcal([{ macros: {} }, { macros: null }]);
  assert.equal(none.kcal, null);
  assert.equal(none.partial, false);
  assert.equal(formatKcalSum(none), "kcal não informada");
  assert.equal(missingKcalNote(none), "2 alimentos sem kcal");
});

test("refeição e dia somam os itens", () => {
  const a = { items: [{ macros: { kcal: 1200 } }] };
  const b = { items: [{ macros: { kcal: 300 } }, { macros: {} }] };
  assert.equal(mealKcal(a).kcal, 1200);
  const day = mealsKcal([a, b]);
  assert.equal(day.kcal, 1500);
  assert.equal(day.partial, true);
  assert.equal(formatKcalSum(day), "1.500 kcal · parcial");
  assert.equal(formatItemKcal(null), "kcal não informada");
});
