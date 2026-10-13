import assert from "node:assert/strict";
import test from "node:test";
import {
  CHECKIN_CATALOG,
  NOT_APPLICABLE,
  defaultTemplateRows,
  formatCheckinAnswer,
  isQuestionVisible,
  isSensitiveKey,
  missingCatalogQuestions,
  specForQuestion,
  withoutSensitive,
  type CheckinContext,
} from "./checkin-catalog";
import { checkAnswer, type QuestionLike } from "./checkin-steps";
import { isSensitiveAnswer, splitAnswers } from "./evaluation-answers";

const female: CheckinContext = { gender: "female" };
const male: CheckinContext = { gender: "male" };
const unknown: CheckinContext = { gender: "unknown" };

const q = (key: string, required = false): QuestionLike => {
  const cat = CHECKIN_CATALOG.find((c) => c.key === key);
  assert.ok(cat, `chave ${key} deveria estar no catálogo`);
  return { key, label: cat.label, type: cat.dbType, unit: cat.unit ?? null, required };
};

// ---- Visibilidade ---------------------------------------------------------------------------

test("ciclo menstrual: some para masculino, aparece para feminino e não informado", () => {
  assert.equal(isQuestionVisible("menstrual_cycle", {}, male), false);
  assert.equal(isQuestionVisible("menstrual_cycle", {}, female), true);
  assert.equal(isQuestionVisible("menstrual_cycle", {}, unknown), true);
});

test("ciclo menstrual: 'Não se aplica' só quando o sexo não foi informado", () => {
  const values = (ctx: CheckinContext) => specForQuestion(q("menstrual_cycle"), ctx).options.map((o) => o.value);
  assert.ok(values(unknown).includes(NOT_APPLICABLE));
  assert.equal(specForQuestion(q("menstrual_cycle"), unknown).options.at(-1)?.label, "Não se aplica");
  assert.ok(!values(female).includes(NOT_APPLICABLE));
});

test("substâncias: follow-ups só quando a resposta é sim", () => {
  const followUps = ["substances_types", "substances_dose", "substances_effects"];
  for (const key of followUps) {
    assert.equal(isQuestionVisible(key, {}, female), false, `${key} sem resposta`);
    assert.equal(isQuestionVisible(key, { substances_use: "no" }, female), false, `${key} com não`);
    assert.equal(isQuestionVisible(key, { substances_use: "yes" }, female), true, `${key} com sim`);
  }
  assert.equal(isQuestionVisible("substances_use", {}, male), true);
});

test("substâncias: variantes de sim aceitas pela validação também mostram os follow-ups", () => {
  for (const v of ["sim", "Sim", " YES ", "true"]) {
    assert.equal(checkAnswer(q("substances_use"), v).ok, true, `validação aceita ${v}`);
    assert.equal(isQuestionVisible("substances_types", { substances_use: v }, unknown), true, `visível com ${v}`);
  }
  assert.equal(isQuestionVisible("substances_types", { substances_use: "não" }, unknown), false);
});

test("data do exame de sangue: só com hormônios marcados", () => {
  const vis = (a: Record<string, string>) => isQuestionVisible("blood_test_date", a, unknown);
  assert.equal(vis({ substances_use: "yes", substances_types: "stimulants" }), false);
  assert.equal(vis({ substances_use: "yes", substances_types: "hormones,peptides" }), true);
  assert.equal(vis({ substances_use: "no", substances_types: "hormones" }), false);
  assert.equal(vis({}), false);
});

test("cardio: dias/minutos só quando fez cardio", () => {
  assert.equal(isQuestionVisible("cardio_days", {}), false);
  assert.equal(isQuestionVisible("cardio_days", { cardio_type: "none" }), false);
  assert.equal(isQuestionVisible("cardio_minutes", { cardio_type: "run" }), true);
});

test("chave fora do catálogo é sempre visível", () => {
  assert.equal(isQuestionVisible("q_custom", {}, male), true);
});

// ---- Validação ------------------------------------------------------------------------------

test("choice: só aceita valores das opções", () => {
  assert.deepEqual(checkAnswer(q("training_performance"), "below"), { ok: true, value: "below" });
  assert.equal(checkAnswer(q("training_performance"), "Abaixo do normal").ok, false);
  assert.equal(checkAnswer(q("sleep_quality"), "excellent").ok, false);
});

test("multi: valores das opções, sem repetição, na ordem do catálogo", () => {
  assert.deepEqual(checkAnswer(q("substances_types", true), "peptides, hormones"), {
    ok: true,
    value: "hormones,peptides",
  });
  assert.equal(checkAnswer(q("substances_types", true), "hormones,hormones").ok, false);
  assert.equal(checkAnswer(q("substances_types", true), "insulin").ok, false);
  assert.equal(checkAnswer(q("substances_types", true), "").ok, false);
});

test("date: válida, não futura, não muito antiga", () => {
  const ctx: CheckinContext = { gender: "unknown", today: "2026-10-10" };
  assert.deepEqual(checkAnswer(q("blood_test_date"), "2026-03-01", ctx), { ok: true, value: "2026-03-01" });
  assert.equal(checkAnswer(q("blood_test_date"), "2026-02-30", ctx).ok, false);
  assert.equal(checkAnswer(q("blood_test_date"), "01/03/2026", ctx).ok, false);
  assert.equal(checkAnswer(q("blood_test_date"), "2026-10-11", ctx).ok, false);
  assert.equal(checkAnswer(q("blood_test_date"), "1900-01-01", ctx).ok, false);
});

test("number: limites e casas decimais do catálogo", () => {
  assert.deepEqual(checkAnswer(q("water_l"), "2,5"), { ok: true, value: "2.5" });
  assert.equal(checkAnswer(q("water_l"), "20").ok, false);
  assert.equal(checkAnswer(q("water_l"), "2,55").ok, false);
  assert.equal(checkAnswer(q("cardio_days"), "3.5").ok, false);
  assert.equal(checkAnswer(q("cardio_days"), "8").ok, false);
  assert.equal(checkAnswer(q("sleep_h"), "7,3").ok, false);
  assert.deepEqual(checkAnswer(q("sleep_h"), "7,5"), { ok: true, value: "7.5" });
  assert.equal(checkAnswer(q("water_l"), "abc").ok, false);
});

// ---- Upgrade idempotente --------------------------------------------------------------------

test("missingCatalogQuestions: template vazio recebe o catálogo inteiro", () => {
  const rows = missingCatalogQuestions([]);
  assert.equal(rows.length, CHECKIN_CATALOG.length);
  assert.deepEqual(rows, defaultTemplateRows());
});

test("missingCatalogQuestions: idempotente e não mexe em perguntas personalizadas", () => {
  const existing = [
    { key: "weight_kg", sort_order: 0 },
    { key: "q_custom_1", sort_order: 1 },
    { key: "notes", sort_order: 5 },
  ];
  const before = JSON.stringify(existing);
  const added = missingCatalogQuestions(existing);
  assert.equal(JSON.stringify(existing), before, "não altera a entrada");
  assert.ok(!added.some((r) => r.key === "weight_kg" || r.key === "notes" || r.key === "q_custom_1"));
  assert.equal(added.length, CHECKIN_CATALOG.length - 2);
  assert.equal(added[0].sort_order, 6, "novas entram depois da maior sort_order");
  const second = missingCatalogQuestions([...existing, ...added]);
  assert.deepEqual(second, []);
});

test("missingCatalogQuestions: sort_order nula conta como 0", () => {
  const added = missingCatalogQuestions([{ key: "q_x", sort_order: null }]);
  assert.equal(added[0].sort_order, 1);
});

// ---- Sensível -------------------------------------------------------------------------------

test("withoutSensitive: tira só as chaves sensíveis", () => {
  const out = withoutSensitive({
    weight_kg: "80",
    menstrual_cycle: "period",
    substances_use: "yes",
    substances_types: "hormones",
    substances_dose: "x",
    substances_effects: "y",
    blood_test_date: "2026-01-01",
    notes: "ok",
    q_custom: "z",
  });
  assert.deepEqual(out, { weight_kg: "80", notes: "ok", q_custom: "z" });
});

test("isSensitiveKey: catálogo", () => {
  assert.equal(isSensitiveKey("substances_types"), true);
  assert.equal(isSensitiveKey("weight_kg"), false);
  assert.equal(isSensitiveKey("q_hormonios"), false);
});

test("isSensitiveAnswer: substances_types com rótulo 'O que você usa?' é sensível", () => {
  assert.equal(isSensitiveAnswer({ key: "substances_types", label: "O que você usa?" }), true);
  // Rótulo reescrito pelo coach não tira a pergunta do bloco sensível.
  assert.equal(isSensitiveAnswer({ key: "substances_use", label: "Algo mais?" }), true);
  // Heurística continua valendo para perguntas personalizadas.
  assert.equal(isSensitiveAnswer({ key: "q_123", label: "Usa hormônios?" }), true);
  assert.equal(isSensitiveAnswer({ key: "q_456", label: "Como foi a semana?" }), false);
  const { regular, sensitive } = splitAnswers([
    { key: "substances_types", label: "O que você usa?", display: "Hormônios" },
    { key: "mood", label: "Humor", display: "Bem" },
  ]);
  assert.deepEqual(regular.map((a) => a.key), ["mood"]);
  assert.deepEqual(sensitive.map((a) => a.key), ["substances_types"]);
});

// ---- Formatação -----------------------------------------------------------------------------

test("formatCheckinAnswer: rótulos, Sim/Não, data, unidade, escala", () => {
  assert.equal(formatCheckinAnswer(q("training_performance"), "below"), "Abaixo do normal");
  assert.equal(formatCheckinAnswer(q("substances_use"), "yes"), "Sim");
  assert.equal(formatCheckinAnswer(q("substances_use"), "no"), "Não");
  assert.equal(formatCheckinAnswer(q("substances_use"), "sim"), "Sim");
  assert.equal(formatCheckinAnswer(q("substances_types"), "hormones,peptides"), "Hormônios, Peptídeos");
  assert.equal(formatCheckinAnswer(q("blood_test_date"), "2026-03-01"), "01/03/2026");
  assert.equal(formatCheckinAnswer(q("water_l"), "2.5"), "2,5 L");
  assert.equal(formatCheckinAnswer(q("cardio_days"), "1"), "1 dia");
  assert.equal(formatCheckinAnswer(q("cardio_days"), "3"), "3 dias");
  assert.equal(formatCheckinAnswer(q("energy"), "4"), "4 de 5");
  assert.equal(formatCheckinAnswer(q("menstrual_cycle"), NOT_APPLICABLE), "Não se aplica");
});

test("formatCheckinAnswer: vazio vira '' e valor desconhecido aparece cru", () => {
  assert.equal(formatCheckinAnswer(q("mood"), ""), "");
  assert.equal(formatCheckinAnswer(q("mood"), null), "");
  assert.equal(formatCheckinAnswer(q("mood"), "legacy_value"), "legacy_value");
  assert.equal(formatCheckinAnswer({ key: "q_custom", type: "text" }, "livre"), "livre");
});
