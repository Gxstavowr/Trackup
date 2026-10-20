import assert from "node:assert/strict";
import test from "node:test";
import {
  FREQUENCY_OPTIONS,
  LEGACY_QUESTIONS,
  QUESTIONNAIRE_STEPS,
  QUESTIONNAIRE_VERSION,
  ageOn,
  checkAnswer,
  formatAnswer,
  getQuestion,
  groupAnswersForDisplay,
  isSensitiveKey,
  mergeStoredAnswers,
  missingMatrixRows,
  normalizeCurrentStep,
  normalizeSections,
  profileFieldsFrom,
  resumeStepIndex,
  sanitizeAnswers,
  stepsFor,
  summarizeMatrix,
  validateQuestionnaire,
  validateStep,
  type AnswerMap,
} from "./questionnaire-catalog";
import { sectionsFor } from "./packages";

const ctx = { today: "2026-10-13" };

const symptomsQ = getQuestion("symptoms")!;
const ALL_NEVER: Record<string, string> = Object.fromEntries((symptomsQ.rows ?? []).map((r) => [r.value, "never"]));

const COMMON_OK: AnswerMap = {
  birth_date: "1995-04-20",
  height_cm: 175,
  weight_kg: 80.5,
  goal: "fat_loss",
  goal_detail: "Chegar a 72 kg com mais definição",
  occupation: "Analista",
  daily_activity: "sedentary",
};

const NUTRITION_OK: AnswerMap = {
  meals_per_day: 4,
  symptoms: ALL_NEVER,
  bristol_type: "4",
  urine_color: "1-3",
  household_income: "2",
};

test("versão nova cabe na coluna e chaves do catálogo são únicas", () => {
  assert.equal(QUESTIONNAIRE_VERSION, "v2.1-lufteam-2026-10");
  assert.ok(QUESTIONNAIRE_VERSION.length <= 40);
  const keys = QUESTIONNAIRE_STEPS.flatMap((s) => s.questions.map((q) => q.key));
  assert.equal(new Set(keys).size, keys.length);
  const ids = QUESTIONNAIRE_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(id.length <= 60, "current_step ≤ 60");
  // nenhuma chave legada colide com o catálogo atual
  for (const k of Object.keys(LEGACY_QUESTIONS)) assert.equal(getQuestion(k), undefined, k);
});

test("seções por pacote: comum para todos, nutrição só em Nutrição/Híbrido, sem seção de treino", () => {
  const sec = (s: string[]) => [...new Set(stepsFor(s).map((x) => x.section))];
  assert.deepEqual(sec(sectionsFor(null)), ["common"]);
  assert.deepEqual(sec(sectionsFor("training")), ["common"]);
  assert.deepEqual(sec(sectionsFor("nutrition")), ["common", "nutrition"]);
  assert.deepEqual(sec(sectionsFor("hybrid")), ["common", "nutrition"]);
  assert.ok(!QUESTIONNAIRE_STEPS.some((s) => s.section === "training"));
  // envio antigo com "training" em sections: normaliza, mas não há etapas de treino
  assert.deepEqual(normalizeSections(["nutrition", "x", "training"]), ["common", "training", "nutrition"]);
  assert.deepEqual(sec(["common", "training"]), ["common"]);
});

test("pacote Treino não pergunta sobre alimentação; nutrição tem as perguntas do formulário Dieta", () => {
  const trainingKeys = stepsFor(sectionsFor("training")).flatMap((s) => s.questions.map((q) => q.key));
  assert.ok(!trainingKeys.includes("symptoms"));
  assert.ok(!trainingKeys.includes("meals_per_day"));
  const nutritionKeys = stepsFor(sectionsFor("nutrition")).flatMap((s) => s.questions.map((q) => q.key));
  for (const k of [
    "current_diet", "meals_per_day", "symptoms", "symptoms_extra", "food_allergies", "food_intolerances",
    "health_conditions", "carb_sources", "protein_sources", "fat_sources", "fruits", "vegetables",
    "disliked_foods", "must_have_foods", "bowel_habits", "bristol_type", "urine_color", "supplements",
    "household_income", "sweets_craving", "medications", "eating_routine",
    "diet_difficulty", "weekend_habits", "nutrition_notes",
    // do formulário Dieta, mas na seção comum (valem para todos os pacotes)
    "goal_detail", "sleep_time", "wake_time", "occupation",
  ]) {
    assert.ok(nutritionKeys.includes(k), k);
  }
});

test("comum: não pergunta nome, e-mail, telefone nem CPF", () => {
  const keys = stepsFor(["common"]).flatMap((s) => s.questions.map((q) => q.key));
  for (const k of ["name", "full_name", "email", "phone", "cpf"]) assert.ok(!keys.includes(k), k);
  for (const k of ["state", "referral", "experience_training", "experience_diet", "experience_hormones", "previous_online_coach"]) {
    assert.ok(keys.includes(k), k);
  }
});

test("obrigatórias: dados do corpo, objetivo + detalhe, ocupação; nutrição: grade, Bristol, Armstrong, renda", () => {
  for (const key of ["birth_date", "height_cm", "weight_kg", "goal", "goal_detail", "occupation", "symptoms", "bristol_type", "urine_color", "household_income", "meals_per_day"]) {
    assert.equal(getQuestion(key)?.required, true, key);
  }
  for (const key of ["symptoms_extra", "state", "referral", "experience_hormones", "sleep_time", "food_allergies"]) {
    assert.equal(getQuestion(key)?.required, false, key);
  }
  assert.ok(getQuestion("household_income")!.options!.some((o) => o.value === "undisclosed"));
});

test("sensíveis: hormônio, sintomas, alergias, intolerâncias, doenças, medicamentos, intestino, Bristol, Armstrong, renda", () => {
  for (const k of [
    "experience_hormones", "symptoms", "symptoms_extra", "food_allergies", "food_intolerances", "health_conditions",
    "medications", "bowel_habits", "bristol_type", "urine_color", "household_income",
    // legadas (removidas na v2.1) continuam sensíveis se vierem num rascunho/envio antigo
    "has_injuries", "injuries_detail", "contraceptive",
  ]) {
    assert.equal(isSensitiveKey(k), true, k);
  }
  for (const k of ["birth_date", "weight_kg", "goal", "goal_detail", "supplements", "carb_sources", "occupation", "state"]) {
    assert.equal(isSensitiveKey(k), false, k);
  }
  // legadas sensíveis continuam sensíveis
  assert.equal(isSensitiveKey("food_restrictions"), true);
});

test("número: vírgula, limites, inteiro e arredondamento", () => {
  const w = getQuestion("weight_kg")!;
  assert.deepEqual(checkAnswer(w, "78,46"), { ok: true, value: 78.5 });
  assert.equal(checkAnswer(w, "abc").ok, false);
  assert.equal(checkAnswer(w, "10").ok, false);
  const h = getQuestion("height_cm")!;
  assert.equal(checkAnswer(h, "172.5").ok, false);
  assert.deepEqual(checkAnswer(h, "172"), { ok: true, value: 172 });
  assert.deepEqual(checkAnswer(h, ""), { ok: true, value: null });
});

test("data de nascimento: real, não futura, idade plausível", () => {
  const b = getQuestion("birth_date")!;
  assert.equal(checkAnswer(b, "2026-02-30", ctx).ok, false);
  assert.equal(checkAnswer(b, "2027-01-01", ctx).ok, false);
  assert.equal(checkAnswer(b, "2020-01-01", ctx).ok, false); // 6 anos
  assert.equal(checkAnswer(b, "1990-05-01", ctx).ok, true);
  assert.equal(ageOn("2000-10-14", "2026-10-13"), 25);
  assert.equal(ageOn("2000-10-13", "2026-10-13"), 26);
});

test("horário: HH:MM normalizado; inválido recusado", () => {
  const t = getQuestion("sleep_time")!;
  assert.deepEqual(checkAnswer(t, "7:05"), { ok: true, value: "07:05" });
  assert.deepEqual(checkAnswer(t, "23:00"), { ok: true, value: "23:00" });
  assert.equal(checkAnswer(t, "24:00").ok, false);
  assert.equal(checkAnswer(t, "meia-noite").ok, false);
  assert.equal(formatAnswer("sleep_time", "23:00"), "23:00");
});

test("escolha e lista suspensa (estado) só aceitam opções", () => {
  assert.deepEqual(checkAnswer(getQuestion("state")!, "SP"), { ok: true, value: "SP" });
  assert.equal(checkAnswer(getQuestion("state")!, "XX").ok, false);
  assert.equal(formatAnswer("state", "MG"), "Minas Gerais");
  assert.equal(checkAnswer(getQuestion("bristol_type")!, "8").ok, false);
  assert.equal(checkAnswer(getQuestion("goal")!, "dominar o mundo").ok, false);
});

test("grade: 19 linhas × 4 colunas; parcial válida no rascunho; valores fora da grade recusados", () => {
  assert.equal(symptomsQ.input, "matrix");
  assert.equal(symptomsQ.rows!.length, 19);
  assert.deepEqual(symptomsQ.options!.map((o) => o.label), ["Nunca", "Raramente", "Ocasionalmente", "Frequentemente"]);
  assert.deepEqual(FREQUENCY_OPTIONS.map((o) => o.value), ["never", "rarely", "sometimes", "often"]);
  // parcial ok, ordem estável pela ordem das linhas
  assert.deepEqual(checkAnswer(symptomsQ, { insomnia: "often", headache: "never" }), {
    ok: true,
    value: { headache: "never", insomnia: "often" },
  });
  assert.equal(checkAnswer(symptomsQ, { headache: "talvez" }).ok, false);
  assert.equal(checkAnswer(symptomsQ, { hacker: "never" }).ok, false);
  assert.equal(checkAnswer(symptomsQ, ["never"]).ok, false);
  assert.deepEqual(checkAnswer(symptomsQ, {}), { ok: true, value: null });
  assert.equal(missingMatrixRows(symptomsQ, { headache: "never" }).length, 18);
});

test("grade obrigatória: exige todas as linhas", () => {
  const step = QUESTIONNAIRE_STEPS.find((s) => s.id === "nutrition_symptoms")!;
  assert.deepEqual(Object.keys(validateStep(step, {})), ["symptoms"]);
  const partial = { ...ALL_NEVER };
  delete partial.often_sick;
  assert.equal(validateStep(step, { symptoms: partial }).symptoms, "Falta responder 1 linha.");
  delete partial.fatigue;
  assert.equal(validateStep(step, { symptoms: partial }).symptoms, "Faltam responder 2 linhas.");
  assert.deepEqual(validateStep(step, { symptoms: ALL_NEVER }), {});
  // "Algum sintoma a adicionar" é opcional ("Nenhum" aceito)
  assert.deepEqual(validateStep(step, { symptoms: ALL_NEVER, symptoms_extra: "Nenhum" }), {});
});

test("condicionais: coach anterior; lesão e anticoncepcional não são mais perguntados", () => {
  const bg = QUESTIONNAIRE_STEPS.find((s) => s.id === "common_background")!;
  assert.deepEqual(validateStep(bg, {}), {});
  assert.deepEqual(validateStep(bg, { previous_online_coach: "yes" }), {});
  const split = sanitizeAnswers(["common"], { previous_online_coach: "no", previous_online_coach_detail: "y" }, ctx);
  assert.ok(!("previous_online_coach_detail" in split.answers));
  const yes = sanitizeAnswers(["common"], { previous_online_coach: "yes", previous_online_coach_detail: "y" }, ctx);
  assert.equal(yes.answers.previous_online_coach_detail, "y");
  // chaves removidas não entram em novos envios
  const old = sanitizeAnswers(sectionsFor("hybrid"), { has_injuries: "yes", injuries_detail: "joelho", contraceptive: "pílula", gender: "feminino" }, ctx);
  for (const k of ["has_injuries", "injuries_detail", "contraceptive"]) {
    assert.ok(!(k in old.answers) && !(k in old.sensitive_answers), k);
    assert.equal(getQuestion(k), undefined, k);
  }
});

test("validação completa por pacote aponta a primeira etapa com problema", () => {
  assert.deepEqual(validateQuestionnaire(sectionsFor("hybrid"), { ...COMMON_OK, ...NUTRITION_OK }, ctx), { ok: true });
  assert.deepEqual(validateQuestionnaire(sectionsFor("training"), COMMON_OK, ctx), { ok: true });
  const res = validateQuestionnaire(sectionsFor("hybrid"), { ...COMMON_OK, ...NUTRITION_OK, symptoms: { headache: "often" } }, ctx);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.firstStepId, "nutrition_symptoms");
    assert.equal(res.firstKey, "symptoms");
  }
  const noGoal = validateQuestionnaire(sectionsFor("nutrition"), { ...COMMON_OK, goal_detail: "", ...NUTRITION_OK }, ctx);
  assert.equal(noGoal.ok, false);
  if (!noGoal.ok) assert.equal(noGoal.firstKey, "goal_detail");
});

test("sanitize: divide answers/sensitive_answers, descarta chaves de fora, ocultas e inválidas", () => {
  const raw = {
    ...COMMON_OK,
    ...NUTRITION_OK,
    experience_hormones: "nunca usei",
    food_allergies: "camarão",
    medications: "nenhum",
    supplements: "creatina",
    hacker: "x",
    training_experience: "beginner", // pergunta da v1, fora do catálogo
    weight_kg: "9999", // inválido → descartado no rascunho
  };
  const { answers, sensitive_answers } = sanitizeAnswers(sectionsFor("hybrid"), raw, ctx);
  assert.deepEqual(Object.keys(sensitive_answers).sort(), [
    "bristol_type", "experience_hormones", "food_allergies", "household_income", "medications", "symptoms", "urine_color",
  ]);
  assert.deepEqual(sensitive_answers.symptoms, ALL_NEVER);
  for (const k of Object.keys(sensitive_answers)) assert.ok(!(k in answers), k);
  assert.equal(answers.supplements, "creatina");
  assert.equal(answers.meals_per_day, 4);
  assert.ok(!("hacker" in answers));
  assert.ok(!("training_experience" in answers));
  assert.ok(!("weight_kg" in answers));
  assert.equal(answers.height_cm, 175);

  // pacote Treino: nada de nutrição é gravado
  const t = sanitizeAnswers(sectionsFor("training"), raw, ctx);
  assert.ok(!("symptoms" in t.sensitive_answers));
  assert.ok(!("meals_per_day" in t.answers));
  assert.equal(t.sensitive_answers.experience_hormones, "nunca usei");
});

test("merge (inclui grade) e campos de perfil", () => {
  const merged = mergeStoredAnswers(
    { height_cm: 175, birth_date: "1995-04-20", bad: { x: 1 } },
    { symptoms: { headache: "often" } }
  );
  assert.deepEqual(merged, { height_cm: 175, birth_date: "1995-04-20", symptoms: { headache: "often" } });
  assert.deepEqual(profileFieldsFrom({ ...merged, gender: "feminino" }), {
    heightCm: 175,
    birthDate: "1995-04-20",
    gender: "feminino",
  });
  assert.deepEqual(profileFieldsFrom({}), { heightCm: null, birthDate: null, gender: null });
});

test("retomar na etapa salva; etapa desconhecida (ex.: treino da v1) volta ao início", () => {
  const steps = stepsFor(sectionsFor("hybrid"));
  assert.equal(resumeStepIndex(steps, "nutrition_gut"), steps.findIndex((s) => s.id === "nutrition_gut"));
  assert.equal(resumeStepIndex(steps, "training_setup"), 0);
  assert.equal(resumeStepIndex(stepsFor(["common"]), "nutrition_gut"), 0);
});

test("formatação: grade com maior frequência primeiro", () => {
  assert.equal(formatAnswer("weight_kg", 80.5), "80,5 kg");
  assert.equal(formatAnswer("goal", "fat_loss"), "Emagrecer");
  assert.equal(formatAnswer("birth_date", "1995-04-20", ctx), "20/04/1995 (31 anos)");
  assert.equal(formatAnswer("goal_detail", ""), "Não respondido");
  assert.equal(formatAnswer("chave_desconhecida", "valor"), "valor");
  const grid = { headache: "sometimes", insomnia: "often", acne: "never", fatigue: "often" };
  assert.deepEqual(summarizeMatrix("symptoms", grid), [
    { value: "often", label: "Frequentemente", rows: ["Insônia", "Fadiga"] },
    { value: "sometimes", label: "Ocasionalmente", rows: ["Dor de cabeça"] },
    { value: "never", label: "Nunca", rows: ["Acne"] },
  ]);
  assert.equal(
    formatAnswer("symptoms", grid),
    "Frequentemente: Insônia, Fadiga · Ocasionalmente: Dor de cabeça · Nunca: Acne"
  );
  assert.equal(formatAnswer("urine_color", "4-6"), "4 a 6 · amarelo-escuro");
});

test("leitura: grade traz resumo estruturado; sensíveis marcadas", () => {
  const { groups } = groupAnswersForDisplay(sectionsFor("hybrid"), { ...COMMON_OK, ...NUTRITION_OK }, ctx);
  assert.deepEqual(groups.map((g) => g.section), ["common", "nutrition"]);
  const items = groups.flatMap((g) => g.steps.flatMap((s) => s.items));
  const sym = items.find((i) => i.key === "symptoms")!;
  assert.equal(sym.sensitive, true);
  assert.deepEqual(sym.matrix, [{ value: "never", label: "Nunca", rows: symptomsQ.rows!.map((r) => r.label) }]);
  assert.equal(items.find((i) => i.key === "household_income")!.sensitive, true);
  assert.equal(items.find((i) => i.key === "goal")!.sensitive, false);
});

test("respostas da v1 continuam legíveis (incluindo a seção Treino) em extra, com rótulo e sensibilidade", () => {
  const v1: AnswerMap = {
    birth_date: "1995-04-20",
    height_cm: 175,
    weight_kg: 80,
    goal: "fat_loss",
    expectations: "Perder 6 kg",
    available_days: ["mon", "fri"],
    training_experience: "beginner",
    training_location: "home",
    equipment: ["dumbbells"],
    has_injuries: "yes",
    injuries_detail: "joelho",
    contraceptive: "pílula X",
    eating_habits: ["snacking"],
    has_food_restrictions: "yes",
    food_restrictions: ["lactose"],
    antiga_desconhecida: "x",
  };
  const { groups, extra } = groupAnswersForDisplay(["common", "training", "nutrition"], v1, { ...ctx, hideEmpty: true });
  // a seção Treino (sem etapas na v2) não vira grupo vazio
  assert.deepEqual(groups.map((g) => g.section), ["common", "nutrition"]);
  // hideEmpty: só perguntas respondidas (nutrição v2 não foi respondida → sem etapas)
  assert.equal(groups.find((g) => g.section === "nutrition")!.steps.length, 0);
  const commonKeys = groups[0].steps.flatMap((s) => s.items.map((i) => i.key));
  assert.deepEqual(commonKeys, ["birth_date", "height_cm", "weight_kg", "goal"]);
  const byKey = Object.fromEntries(extra.map((e) => [e.key, e]));
  assert.equal(byKey.available_days.value, "Seg, Sex");
  assert.equal(byKey.training_experience.label, "Há quanto tempo treina");
  assert.equal(byKey.training_experience.value, "Menos de 6 meses");
  assert.equal(byKey.training_location.value, "Em casa");
  assert.equal(byKey.equipment.value, "Halteres");
  assert.equal(byKey.eating_habits.value, "Belisco entre as refeições");
  assert.equal(byKey.food_restrictions.value, "Lactose");
  assert.equal(byKey.food_restrictions.sensitive, true);
  assert.equal(byKey.has_food_restrictions.value, "Sim");
  assert.equal(byKey.expectations.sensitive, false);
  // lesão e anticoncepcional (removidos na v2.1) aparecem em "Outras respostas", rotulados e privados
  assert.equal(byKey.has_injuries.label, "Você tem alguma lesão, dor ou restrição de movimento?");
  assert.equal(byKey.has_injuries.value, "Sim");
  assert.equal(byKey.has_injuries.sensitive, true);
  assert.equal(byKey.injuries_detail.value, "joelho");
  assert.equal(byKey.injuries_detail.sensitive, true);
  assert.equal(byKey.contraceptive.value, "pílula X");
  assert.equal(byKey.contraceptive.sensitive, true);
  assert.deepEqual(byKey.antiga_desconhecida, { key: "antiga_desconhecida", label: "antiga_desconhecida", value: "x", sensitive: false });
});

test("current_step: revisão e etapas das seções; resto vira null", () => {
  assert.equal(normalizeCurrentStep(["common"], "review"), "review");
  assert.equal(normalizeCurrentStep(["common"], "common_goal"), "common_goal");
  assert.equal(normalizeCurrentStep(["common"], "nutrition_gut"), null);
  assert.equal(normalizeCurrentStep(["common", "training"], "training_setup"), null);
  assert.equal(normalizeCurrentStep(["common"], 42), null);
  const steps = stepsFor(["common"]);
  assert.equal(resumeStepIndex(steps, "review"), steps.length);
});
