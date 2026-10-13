import test from "node:test";
import assert from "node:assert/strict";
import {
  foodBase,
  formatNumber,
  macrosSummaryText,
  parseQuantityText,
  scaleFoodMacros,
  sumKnownMacros,
} from "./food-macros";

const arroz = { unit: "g", macros: { kcal: 128, protein_g: 2.5, carbs_g: 28.1, fat_g: 0.2 } };

test("foodBase: padrão 100 para g/ml e 1 para unidade", () => {
  assert.deepEqual(foodBase(arroz), { qty: 100, unit: "g" });
  assert.deepEqual(foodBase({ unit: "un", macros: {} }), { qty: 1, unit: "un" });
  assert.deepEqual(foodBase({ unit: "g", macros: { base_qty: 50 } }), { qty: 50, unit: "g" });
});

test("scaleFoodMacros: escala por quantidade / porção-base", () => {
  assert.deepEqual(scaleFoodMacros(arroz, 150, "g"), { kcal: 192, protein_g: 3.8, carbs_g: 42.2, fat_g: 0.3 });
});

test("scaleFoodMacros: unidade diferente ou sem quantidade não inventa valor", () => {
  assert.deepEqual(scaleFoodMacros(arroz, 2, "colher"), {});
  assert.deepEqual(scaleFoodMacros(arroz, null, "g"), {});
  assert.deepEqual(scaleFoodMacros({ unit: "g", macros: { kcal: 100 } }, 200, "g"), { kcal: 200 });
});

test("sumKnownMacros: campo sem nenhum valor fica null, não 0", () => {
  const t = sumKnownMacros([{ macros: { kcal: 100 } }, { macros: { kcal: 50, protein_g: 3 } }, { macros: {} }]);
  assert.deepEqual(t, { kcal: 150, protein_g: 3, carbs_g: null, fat_g: null });
});

test("formatação pt-BR e parse de quantidade", () => {
  assert.equal(formatNumber(2.5), "2,5");
  assert.equal(formatNumber(null), "—");
  assert.equal(macrosSummaryText({ kcal: 128, protein_g: 2.5 }), "128 kcal · P 2,5 g");
  assert.deepEqual(parseQuantityText("1,5 colher"), { quantity: 1.5, unit: "colher" });
  assert.deepEqual(parseQuantityText("150g"), { quantity: 150, unit: "g" });
  assert.equal(parseQuantityText("a gosto"), null);
});
