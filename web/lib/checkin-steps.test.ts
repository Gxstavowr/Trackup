import assert from "node:assert/strict";
import test from "node:test";
import { checkSubmission, ensureWeightQuestion, isAlwaysTrackedMetric, type QuestionLike } from "./checkin-steps";

const weight = (required: boolean): QuestionLike => ({ key: "weight_kg", label: "Peso", type: "number", unit: "kg", required });
const notes: QuestionLike = { key: "notes", label: "Observações", type: "text", required: false };
const make = (): QuestionLike => ({ key: "weight_kg", label: "Peso atual", type: "number", unit: "kg", required: false });

test("ensureWeightQuestion: força obrigatório quando o coach deixou opcional", () => {
  const out = ensureWeightQuestion([weight(false), notes], make);
  assert.equal(out.length, 2);
  assert.equal(out[0].required, true);
});

test("ensureWeightQuestion: acrescenta a pergunta de peso se o template não tiver", () => {
  const out = ensureWeightQuestion([notes], make);
  assert.equal(out[0].key, "weight_kg");
  assert.equal(out[0].required, true);
  assert.equal(out[1].key, "notes");
});

test("envio sem peso é recusado mesmo com template sem a pergunta", () => {
  const qs = ensureWeightQuestion([notes], make);
  const res = checkSubmission(qs, { notes: "ok" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.field, "weight_kg");
  assert.equal(checkSubmission(qs, { weight_kg: "81,5" }).ok, true);
  assert.equal(checkSubmission(qs, { weight_kg: "5" }).ok, false);
});

test("peso não pode ser ocultado por aluno", () => {
  assert.equal(isAlwaysTrackedMetric("weight_kg"), true);
  assert.equal(isAlwaysTrackedMetric("waist_cm"), false);
});
