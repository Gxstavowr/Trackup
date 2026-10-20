import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPriceBRL,
  isPackageId,
  modulesOf,
  packageIncludes,
  packageLabel,
  PACKAGES,
  sectionsFor,
} from "./packages";

test("PACKAGES usa os ids da migração 0022", () => {
  assert.deepEqual(Object.keys(PACKAGES).sort(), ["hybrid", "nutrition", "training"]);
  assert.equal(PACKAGES.hybrid.label, "Híbrido");
});

test("modulesOf por pacote e legado", () => {
  assert.deepEqual(modulesOf("training"), ["training"]);
  assert.deepEqual(modulesOf("nutrition"), ["nutrition"]);
  assert.deepEqual(modulesOf("hybrid"), ["training", "nutrition"]);
  assert.deepEqual(modulesOf(null), []);
});

test("packageIncludes cobre todas as combinações", () => {
  assert.equal(packageIncludes("training", "training"), true);
  assert.equal(packageIncludes("training", "nutrition"), false);
  assert.equal(packageIncludes("nutrition", "nutrition"), true);
  assert.equal(packageIncludes("nutrition", "training"), false);
  assert.equal(packageIncludes("hybrid", "training"), true);
  assert.equal(packageIncludes("hybrid", "nutrition"), true);
  assert.equal(packageIncludes(null, "training"), false);
});

test("sectionsFor sempre inclui common", () => {
  // sem seção de treino (v2): o coach monta o treino a partir da seção comum
  assert.deepEqual(sectionsFor("training"), ["common"]);
  assert.deepEqual(sectionsFor("nutrition"), ["common", "nutrition"]);
  assert.deepEqual(sectionsFor("hybrid"), ["common", "nutrition"]);
  assert.deepEqual(sectionsFor(null), ["common"]);
});

test("rótulos e validação de id", () => {
  assert.equal(packageLabel("training"), "Treino");
  assert.equal(packageLabel(null), "Sem pacote");
  assert.equal(isPackageId("hybrid"), true);
  assert.equal(isPackageId("hibrido"), false);
  assert.equal(isPackageId(undefined), false);
});

test("formatPriceBRL formata centavos", () => {
  assert.equal(formatPriceBRL(0), "R$ 0,00");
  assert.equal(formatPriceBRL(15000), "R$ 150,00");
  assert.equal(formatPriceBRL(123456), "R$ 1.234,56");
  assert.equal(formatPriceBRL(5), "R$ 0,05");
  assert.equal(formatPriceBRL(null), "R$ 0,00");
  assert.equal(formatPriceBRL(Number.NaN), "R$ 0,00");
});
