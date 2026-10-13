import assert from "node:assert/strict";
import test from "node:test";
import { unitForValue } from "./week-comparison-format";

test("unitForValue: valor 1 volta ao singular regular", () => {
  assert.equal(unitForValue("treinos", 1), "treino");
  assert.equal(unitForValue("dias", 1), "dia");
  assert.equal(unitForValue("horas", 1), "hora");
});

test("unitForValue: outros valores e unidades curtas ficam como estão", () => {
  assert.equal(unitForValue("treinos", 3), "treinos");
  assert.equal(unitForValue("treinos", 0), "treinos");
  assert.equal(unitForValue("kg", 1), "kg");
  assert.equal(unitForValue("cm", 1), "cm");
  assert.equal(unitForValue("sessões", 1), "sessões");
  assert.equal(unitForValue(null, 1), null);
  assert.equal(unitForValue("  ", 1), null);
});

import { defaultComparisonAngle, selectableAngles } from "./week-comparison-format";

test("selectableAngles: 4 posições novas sempre; lateral antiga só se alguma semana tiver", () => {
  assert.deepEqual(selectableAngles([{ photoAngles: ["front"] }, { photoAngles: [] }]), [
    "front",
    "left",
    "right",
    "back",
  ]);
  assert.deepEqual(selectableAngles([{ photoAngles: ["front", "side", "back"] }, { photoAngles: ["left"] }]), [
    "front",
    "left",
    "right",
    "back",
    "side",
  ]);
});

test("defaultComparisonAngle: nunca pareia lateral antiga com esquerda/direita", () => {
  // Semana antiga (front/side/back) x nova (4 posições): a primeira comum é a frente.
  assert.equal(
    defaultComparisonAngle([{ photoAngles: ["front", "side", "back"] }, { photoAngles: ["front", "left", "right", "back"] }]),
    "front"
  );
  // Só laterais: antiga x nova não têm posição em comum -> primeira que existe em alguma (esquerda),
  // e a outra semana mostra "sem foto" em vez de usar a lateral antiga.
  assert.equal(defaultComparisonAngle([{ photoAngles: ["side"] }, { photoAngles: ["left", "right"] }]), "left");
  assert.equal(defaultComparisonAngle([{ photoAngles: ["side"] }, { photoAngles: ["side"] }]), "side");
  assert.equal(defaultComparisonAngle([{ photoAngles: [] }, { photoAngles: [] }]), "front");
});

test("noComparisonMessage: só a semana 1 é 'a primeira'; depois, as anteriores estão vazias", async () => {
  const { noComparisonMessage } = await import("./week-comparison-format");
  assert.match(noComparisonMessage(1), /primeira semana/);
  assert.equal(
    noComparisonMessage(2),
    "A semana 1 não tem check-in enviado, métricas nem fotos — não há dados para comparar com a semana 2."
  );
  const msg = noComparisonMessage(3);
  assert.doesNotMatch(msg, /primeira/);
  assert.match(msg, /semanas anteriores \(1 a 2\)/);
  assert.match(msg, /semana 3/);
});
