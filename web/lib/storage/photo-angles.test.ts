import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKIN_PHOTO_ANGLES,
  PHOTO_ANGLE_LABEL,
  PHOTO_FILE_RE,
  displayAnglesForWeek,
  isCheckinPhotoAngle,
  isPhotoAngle,
  missingCheckinPhotoAngles,
  photoGridClass,
  sortPhotoAngles,
} from "./photo-angles";

test("check-in novo pede 4 posições, na ordem frente, esquerda, direita, costas", () => {
  assert.deepEqual([...CHECKIN_PHOTO_ANGLES], ["front", "left", "right", "back"]);
  assert.equal(PHOTO_ANGLE_LABEL.front, "Frente");
  assert.equal(PHOTO_ANGLE_LABEL.left, "Lateral esquerda");
  assert.equal(PHOTO_ANGLE_LABEL.right, "Lateral direita");
  assert.equal(PHOTO_ANGLE_LABEL.back, "Costas");
  assert.equal(PHOTO_ANGLE_LABEL.side, "Lateral (registro anterior)");
});

test("legado side: válido pra leitura, recusado pra upload novo", () => {
  assert.equal(isPhotoAngle("side"), true);
  assert.equal(isCheckinPhotoAngle("side"), false);
  for (const a of ["front", "left", "right", "back"]) {
    assert.equal(isPhotoAngle(a), true);
    assert.equal(isCheckinPhotoAngle(a), true);
  }
  assert.equal(isPhotoAngle("lado"), false);
  assert.equal(isPhotoAngle(undefined), false);
});

test("regex de path aceita as 4 posições e o legado, nada mais", () => {
  for (const a of ["front", "left", "right", "back", "side"]) {
    assert.equal(PHOTO_FILE_RE.test(`week-3/${a}.jpg`), true, a);
  }
  assert.equal(PHOTO_FILE_RE.test("week-3/top.jpg"), false);
  assert.equal(PHOTO_FILE_RE.test("week-3/front.png"), false);
  assert.equal(PHOTO_FILE_RE.test("../week-3/front.jpg"), false);
  assert.equal(PHOTO_FILE_RE.test("week-3/front.jpg/x"), false);
  assert.equal(PHOTO_FILE_RE.test("week-x/front.jpg"), false);
});

test("missingCheckinPhotoAngles: side antigo não preenche esquerda/direita", () => {
  assert.deepEqual(missingCheckinPhotoAngles(["front", "side", "back"]), ["left", "right"]);
  assert.deepEqual(missingCheckinPhotoAngles(["back", "right", "left", "front"]), []);
  assert.deepEqual(missingCheckinPhotoAngles([]), ["front", "left", "right", "back"]);
});

test("sortPhotoAngles: ordem canônica, legado no fim, desconhecidos fora", () => {
  assert.deepEqual(sortPhotoAngles(["side", "back", "front", "x"]), ["front", "back", "side"]);
});

test("displayAnglesForWeek: semana antiga mantém 3 quadros; nova mostra 4", () => {
  assert.deepEqual(displayAnglesForWeek(["front", "side", "back"]), ["front", "side", "back"]);
  assert.deepEqual(displayAnglesForWeek(["side"]), ["front", "side", "back"]);
  assert.deepEqual(displayAnglesForWeek(["front"]), ["front", "left", "right", "back"]);
  assert.deepEqual(displayAnglesForWeek([]), ["front", "left", "right", "back"]);
  // Mistura (lateral antiga + nova na mesma semana): a antiga vira um quadro próprio no fim.
  assert.deepEqual(displayAnglesForWeek(["left", "side"]), ["front", "left", "right", "back", "side"]);
});

test("photoGridClass: 4 fotos = 2x2 no celular", () => {
  assert.equal(photoGridClass(4), "grid-cols-2 sm:grid-cols-4");
  assert.equal(photoGridClass(3), "grid-cols-3");
});
