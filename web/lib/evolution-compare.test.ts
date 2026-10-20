import assert from "node:assert/strict";
import test from "node:test";
import { coverageLabel, photoCoverage, sharedNewAngles, suggestShortcuts } from "./evolution-compare";

test("cobertura: quatro posições novas, parcial e registro antigo", () => {
  assert.deepEqual(photoCoverage(["front", "left", "right", "back"]), { count: 4, complete: true, legacy: false });
  assert.deepEqual(photoCoverage(["front", "back"]), { count: 2, complete: false, legacy: false });
  // A lateral antiga nunca completa as quatro posições nem vira esquerda/direita.
  assert.deepEqual(photoCoverage(["front", "side", "back"]), { count: 2, complete: false, legacy: true });
  assert.equal(coverageLabel(["front", "left", "right", "back"]), "4 posições");
  assert.equal(coverageLabel(["front", "side", "back"]), "2 de 4 posições + antiga");
  assert.equal(coverageLabel(["side"]), "registro antigo");
  assert.equal(coverageLabel([]), "sem fotos");
});

test("atalhos: sempre contra a semana mais recente, sem pares repetidos", () => {
  assert.deepEqual(suggestShortcuts([3]), []);
  const two = suggestShortcuts([3, 4]);
  assert.deepEqual(two.map((s) => [s.id, s.from, s.to]), [["previous", 3, 4]]);

  const many = suggestShortcuts([1, 2, 5, 8, 9, 12, 13]);
  const pairs = many.map((s) => [s.id, s.from, s.to]);
  assert.deepEqual(pairs, [
    ["previous", 12, 13],
    ["m4", 9, 13],
    ["m12", 1, 13],
  ]);
  assert.equal(new Set(many.map((s) => s.from)).size, many.length);
  assert.ok(many.every((s) => s.to === 13));
});

test("atalhos: entrada fora de ordem; início só quando ainda não foi oferecido", () => {
  const s = suggestShortcuts([6, 2, 4]);
  assert.deepEqual(s.map((x) => [x.id, x.from]), [["previous", 4], ["m4", 2]]);
  const t = suggestShortcuts([3, 4, 5]);
  assert.deepEqual(t.map((x) => [x.id, x.from]), [["previous", 4], ["start", 3]]);
});

test("posições compartilhadas entre duas semanas", () => {
  assert.deepEqual(sharedNewAngles(["front", "left", "right", "back"], ["front", "back", "side"]), ["front", "back"]);
  assert.deepEqual(sharedNewAngles(["side"], ["side"]), []);
});
