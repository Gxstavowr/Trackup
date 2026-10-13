import assert from "node:assert/strict";
import test from "node:test";
import {
  HELP_TEXT_MAX_LENGTH,
  formatCheckinAnswer,
  getCatalogQuestion,
  normalizeHelpText,
  resolveQuestionHelp,
  specForQuestion,
  withoutSensitive,
} from "./checkin-catalog";
import { checkAnswer, checkSubmission, type QuestionLike } from "./checkin-steps";

// Pergunta Sim/Não criada pelo coach (tipo do banco "boolean", chave q_…) — migration 0019.
const yesNo = (required: boolean, help_text: string | null = null): QuestionLike & { help_text: string | null } => ({
  key: "q_abc123def4",
  label: "Fez a suplementação todos os dias?",
  type: "boolean",
  unit: null,
  required,
  help_text,
});

test("normalizeHelpText: vazio vira null, espaços colapsados, corte no limite por code point", () => {
  assert.equal(normalizeHelpText(null), null);
  assert.equal(normalizeHelpText(""), null);
  assert.equal(normalizeHelpText("   \n "), null);
  assert.equal(normalizeHelpText("  Conte  só\nos dias  "), "Conte só os dias");
  const long = "a".repeat(HELP_TEXT_MAX_LENGTH + 50);
  assert.equal(normalizeHelpText(long)?.length, HELP_TEXT_MAX_LENGTH);
  const emoji = "💪".repeat(HELP_TEXT_MAX_LENGTH + 5);
  const cut = normalizeHelpText(emoji) ?? "";
  assert.equal(Array.from(cut).length, HELP_TEXT_MAX_LENGTH);
  assert.ok(!cut.includes("�"));
});

test("resolveQuestionHelp: ajuda do coach substitui a do catálogo, exceto o aviso de pergunta sensível", () => {
  assert.equal(resolveQuestionHelp("Padrão.", null, false), "Padrão.");
  assert.equal(resolveQuestionHelp("Padrão.", "  ", false), "Padrão.");
  assert.equal(resolveQuestionHelp("Padrão.", "Do coach.", false), "Do coach.");
  assert.equal(resolveQuestionHelp(undefined, "Do coach.", false), "Do coach.");
  assert.equal(resolveQuestionHelp(undefined, null, false), undefined);
  assert.equal(
    resolveQuestionHelp("Fica só entre você e seu coach.", "Inclua termogênicos.", true),
    "Inclua termogênicos. Fica só entre você e seu coach."
  );
  assert.equal(resolveQuestionHelp("Fica só.", "Fica só.", true), "Fica só.");
});

test("specForQuestion: help_text chega ao aluno (pergunta do coach e do catálogo)", () => {
  assert.equal(specForQuestion(yesNo(false)).help, undefined);
  assert.equal(specForQuestion(yesNo(false, "Conte só os dias úteis.")).help, "Conte só os dias úteis.");
  assert.equal(specForQuestion({ key: "weight_kg", type: "number", help_text: "Use a mesma balança." }).help, "Use a mesma balança.");
  assert.equal(specForQuestion({ key: "weight_kg", type: "number" }).help, getCatalogQuestion("weight_kg")?.help);
  // Sensível: o aviso de privacidade continua.
  const sensitive = specForQuestion({ key: "substances_use", type: "boolean", help_text: "Inclua termogênicos." });
  assert.ok(sensitive.sensitive);
  assert.match(sensitive.help ?? "", /^Inclua termogênicos\. /);
  assert.match(sensitive.help ?? "", /Fica só entre você e seu coach\./);
});

test("Sim/Não do coach: controle de dois botões Sim/Não, não texto", () => {
  const spec = specForQuestion(yesNo(true));
  assert.equal(spec.input, "toggle");
  assert.deepEqual(
    spec.options.map((o) => o.label),
    ["Sim", "Não"]
  );
  assert.equal(spec.sensitive, false);
});

test("Sim/Não do coach: validação obrigatória e normalização yes/no", () => {
  assert.deepEqual(checkAnswer(yesNo(true), ""), { ok: false, message: "Escolha uma opção para continuar." });
  assert.deepEqual(checkAnswer(yesNo(false), ""), { ok: true, value: "" });
  assert.deepEqual(checkAnswer(yesNo(true), "yes"), { ok: true, value: "yes" });
  assert.deepEqual(checkAnswer(yesNo(true), "Sim"), { ok: true, value: "yes" });
  assert.deepEqual(checkAnswer(yesNo(true), "não"), { ok: true, value: "no" });
  assert.equal(checkAnswer(yesNo(true), "talvez").ok, false);

  const missing = checkSubmission([yesNo(true)], {});
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.field, "q_abc123def4");
  assert.deepEqual(checkSubmission([yesNo(true)], { q_abc123def4: "no" }), { ok: true, answers: { q_abc123def4: "no" } });
});

test("Sim/Não do coach: revisão e avaliação mostram Sim/Não; respostas antigas seguem legíveis", () => {
  assert.equal(formatCheckinAnswer(yesNo(false), "yes"), "Sim");
  assert.equal(formatCheckinAnswer(yesNo(false), "no"), "Não");
  assert.equal(formatCheckinAnswer(yesNo(false), "true"), "Sim");
  assert.equal(formatCheckinAnswer(yesNo(false), ""), "");
  assert.equal(formatCheckinAnswer(yesNo(false), "algo antigo"), "algo antigo");
});

test("Sim/Não do coach não é sensível: fica no rascunho local", () => {
  assert.deepEqual(withoutSensitive({ q_abc123def4: "yes", substances_use: "yes" }), { q_abc123def4: "yes" });
});
