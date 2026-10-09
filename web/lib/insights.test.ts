import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveInsights,
  hasEnoughHistory,
  type Insight,
  type InsightGoal,
  type InsightInput,
  type InsightMetric,
  type InsightWeek,
} from "./insights";

/**
 * Testes das regras de insight (item 31). Rodar: `npx tsx --test lib/insights.test.ts` (a pasta
 * `web/`). Sem runner novo no projeto: usa só `node:test` + `node:assert`, que o Node já traz.
 */

const WEIGHT: InsightMetric = { key: "weight_kg", label: "Peso", unit: "kg", goalDirection: null };
const WAIST: InsightMetric = { key: "waist_cm", label: "Cintura", unit: "cm", goalDirection: null };

/** Semana com check-in enviado e valores por chave. */
function week(weekNumber: number, values: Record<string, number> = {}, submitted = true): InsightWeek {
  return { weekNumber, submitted, values };
}

function weights(startWeek: number, values: number[]): InsightWeek[] {
  return values.map((v, i) => week(startWeek + i, { weight_kg: v }));
}

function input(partial: Partial<InsightInput>): InsightInput {
  return { currentWeek: null, metrics: [WEIGHT], weeks: [], goals: [], ...partial };
}

function goal(weekNumber: number, resultStatus: InsightGoal["resultStatus"], over: Partial<InsightGoal> = {}): InsightGoal {
  return {
    weekNumber,
    metricKey: "water_l",
    label: "Beber 3 L de água por dia",
    unit: null,
    targetValue: 3,
    resultStatus,
    ...over,
  };
}

function byRule(insights: Insight[], ruleId: string): Insight[] {
  return insights.filter((i) => i.ruleId === ruleId);
}

/** Congela a entrada em profundidade: qualquer mutação numa regra lança TypeError. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Dados insuficientes
// ---------------------------------------------------------------------------

test("dados insuficientes: entrada vazia não gera insight", () => {
  const empty = input({});
  assert.equal(hasEnoughHistory(empty), false);
  assert.deepEqual(deriveInsights(empty), []);
});

test("dados insuficientes: 2 semanas, mesmo com variação grande, não geram insight", () => {
  const two = input({ weeks: weights(1, [90, 80]) });
  assert.equal(hasEnoughHistory(two), false);
  assert.deepEqual(deriveInsights(two), []);
});

test("dados insuficientes: 3 semanas de dado mas só 2 pontos da métrica não afirmam tendência", () => {
  const weeksData = [week(1, { weight_kg: 90 }), week(2), week(3, { weight_kg: 80 })];
  const i = input({ weeks: weeksData });
  assert.equal(hasEnoughHistory(i), true);
  assert.deepEqual(byRule(deriveInsights(i), "metric_change"), []);
});

// ---------------------------------------------------------------------------
// Mudança / tendência
// ---------------------------------------------------------------------------

test("mudança: peso caiu 1,2 kg em 4 semanas, com a evidência estruturada", () => {
  const i = input({ weeks: weights(5, [83.6, 83.2, 83.0, 82.6, 82.4]) });
  const [insight] = byRule(deriveInsights(i), "metric_change");
  assert.ok(insight, "esperava um insight de mudança");
  assert.ok(insight.text.startsWith("Peso caiu 1,2 kg em 4 semanas"), insight.text);
  assert.match(insight.text, /de 83,6 kg para 82,4 kg/);
  assert.match(insight.text, /queda em todos os registros do período/);
  assert.equal(insight.id, "metric_change:weight_kg");
  assert.equal(insight.tone, "info");
  assert.deepEqual(insight.evidence.weeks, [5, 6, 7, 8, 9]);
  assert.equal(insight.evidence.points.length, 5);
  assert.equal(insight.evidence.metricKey, "weight_kg");
});

test("mudança: variação abaixo do limiar (0,9 kg) não gera insight de mudança", () => {
  const i = input({ weeks: weights(5, [83.0, 82.8, 82.4, 82.1]) });
  assert.deepEqual(byRule(deriveInsights(i), "metric_change"), []);
});

test("mudança sem consistência não diz 'em todos os registros'", () => {
  const i = input({ weeks: weights(5, [83.6, 83.9, 82.9, 82.4]) });
  const [insight] = byRule(deriveInsights(i), "metric_change");
  assert.ok(insight);
  assert.doesNotMatch(insight.text, /em todos os registros/);
});

test("mudança contra a direção da meta definida vira atenção e cita a meta", () => {
  const gaining: InsightMetric = { ...WEIGHT, goalDirection: "decrease" };
  const i = input({ metrics: [gaining], weeks: weights(5, [80, 80.6, 81.2, 81.5]) });
  const [insight] = byRule(deriveInsights(i), "metric_change");
  assert.ok(insight);
  assert.equal(insight.tone, "attention");
  assert.match(insight.text, /Peso subiu 1,5 kg em 3 semanas/);
  assert.match(insight.text, /Meta definida para este indicador: diminuir\./);
});

test("mudança na direção da meta continua neutra (info)", () => {
  const losing: InsightMetric = { ...WEIGHT, goalDirection: "decrease" };
  const i = input({ metrics: [losing], weeks: weights(5, [83.6, 83.0, 82.6, 82.2]) });
  const [insight] = byRule(deriveInsights(i), "metric_change");
  assert.equal(insight.tone, "info");
});

test("métrica custom sem unidade usa limiar relativo de 10% e texto sem unidade", () => {
  const steps: InsightMetric = { key: "custom_passos", label: "Passos", unit: null, goalDirection: null };
  const i = input({
    metrics: [steps],
    weeks: [week(1, { custom_passos: 5000 }), week(2, { custom_passos: 5400 }), week(3, { custom_passos: 5800 })],
  });
  const [insight] = byRule(deriveInsights(i), "metric_change");
  assert.ok(insight);
  assert.match(insight.text, /^Passos subiu de 5\.000 para 5\.800 em 2 semanas/);
});

test("métrica que NÃO é acompanhada não gera insight, mesmo com valores gravados", () => {
  const i = input({ metrics: [WAIST], weeks: weights(5, [90, 88, 86, 84]) });
  assert.deepEqual(deriveInsights(i), []);
});

// ---------------------------------------------------------------------------
// Estabilidade
// ---------------------------------------------------------------------------

test("estabilidade: peso entre 82 e 82,4 kg nas últimas 4 semanas", () => {
  const i = input({ weeks: weights(6, [82.0, 82.3, 82.1, 82.4]) });
  const insights = deriveInsights(i);
  const [insight] = byRule(insights, "metric_stable");
  assert.ok(insight, "esperava insight de estabilidade");
  assert.equal(insight.text, "Peso ficou entre 82 kg e 82,4 kg nas últimas 4 semanas com registro (semanas 6 a 9).");
  assert.equal(insight.tone, "info");
  assert.deepEqual(byRule(insights, "metric_change"), [], "estável não pode ser também 'mudança'");
});

test("estabilidade com meta de diminuir: mesma frase de fato + a meta, tom de atenção", () => {
  const losing: InsightMetric = { ...WEIGHT, goalDirection: "decrease" };
  const i = input({ metrics: [losing], weeks: weights(6, [82.0, 82.0, 82.0, 82.0]) });
  const [insight] = byRule(deriveInsights(i), "metric_stable");
  assert.ok(insight);
  assert.equal(insight.tone, "attention");
  assert.match(insight.text, /^Peso ficou em 82 kg nas últimas 4 semanas/);
  assert.match(insight.text, /Meta definida para este indicador: diminuir\./);
});

test("estabilidade exige 4 registros", () => {
  const i = input({ weeks: weights(6, [82.0, 82.2, 82.1]) });
  assert.deepEqual(byRule(deriveInsights(i), "metric_stable"), []);
});

// ---------------------------------------------------------------------------
// Aderência
// ---------------------------------------------------------------------------

function adherence(startWeek: number, values: number[]): InsightWeek[] {
  return values.map((v, i) => week(startWeek + i, { adherence_pct: v }));
}

test("queda de aderência (escala 1–5): de 5 para 3 nas últimas 3 semanas", () => {
  const i = input({ metrics: [], weeks: adherence(7, [5, 4, 3]) });
  const [insight] = byRule(deriveInsights(i), "adherence_drop");
  assert.ok(insight);
  assert.equal(insight.tone, "attention");
  assert.equal(
    insight.text,
    "Aderência caiu de 5 para 3 (escala de 1 a 5) nas últimas 3 semanas com registro (semanas 7 a 9)."
  );
  assert.deepEqual(insight.evidence.points, [
    { weekNumber: 7, value: 5 },
    { weekNumber: 8, value: 4 },
    { weekNumber: 9, value: 3 },
  ]);
});

test("queda de aderência (percentual): de 90% para 60% nas últimas 3 semanas", () => {
  const i = input({ metrics: [], weeks: adherence(7, [90, 75, 60]) });
  const [insight] = byRule(deriveInsights(i), "adherence_drop");
  assert.ok(insight);
  assert.equal(
    insight.text,
    "Aderência caiu de 90% para 60% nas últimas 3 semanas com registro (semanas 7 a 9)."
  );
});

test("aderência: queda pequena (1 ponto) ou com recuperação no meio não gera insight", () => {
  assert.deepEqual(deriveInsights(input({ metrics: [], weeks: adherence(7, [5, 5, 4]) })), []);
  assert.deepEqual(deriveInsights(input({ metrics: [], weeks: adherence(7, [5, 2, 5, 3]) })), []);
  assert.deepEqual(deriveInsights(input({ metrics: [], weeks: adherence(7, [3, 4, 5]) })), []);
});

test("aderência: o flag explícito de escala vence a heurística", () => {
  const i = input({ metrics: [], adherenceIsScale: false, weeks: adherence(7, [5, 3, 2]) });
  // Como percentual, 5 -> 2 é queda de 3 p.p. (< 15): nada a dizer.
  assert.deepEqual(deriveInsights(i), []);
});

// ---------------------------------------------------------------------------
// Check-ins faltantes
// ---------------------------------------------------------------------------

test("check-ins faltantes: 2 das últimas 4 semanas concluídas sem envio", () => {
  // Semana corrente 9 -> janela 5..8 (a semana 9 ainda está aberta e não conta como falta).
  const i = input({ currentWeek: 9, metrics: [], weeks: [week(2), week(5), week(8)] });
  const [insight] = byRule(deriveInsights(i), "missed_checkins");
  assert.ok(insight);
  assert.equal(insight.tone, "attention");
  assert.equal(insight.text, "Sem check-in enviado em 2 das últimas 4 semanas concluídas (semanas 6 e 7).");
  assert.deepEqual(insight.evidence.weeks, [6, 7]);
});

test("check-ins faltantes: 1 falta só, ou semana corrente desconhecida, não gera insight", () => {
  const one = input({ currentWeek: 9, metrics: [], weeks: [week(5), week(7), week(8)] });
  assert.deepEqual(byRule(deriveInsights(one), "missed_checkins"), []);
  const unknown = input({ currentWeek: null, metrics: [], weeks: [week(2), week(3), week(4)] });
  assert.deepEqual(byRule(deriveInsights(unknown), "missed_checkins"), []);
});

// ---------------------------------------------------------------------------
// Metas recorrentes / alteradas
// ---------------------------------------------------------------------------

test("meta recorrente: não atingida em 3 das últimas 4 semanas em que foi avaliada", () => {
  const i = input({
    metrics: [],
    weeks: [week(5), week(6), week(7), week(8)],
    goals: [goal(5, "fail"), goal(6, "success"), goal(7, "partial"), goal(8, "fail")],
  });
  const [insight] = byRule(deriveInsights(i), "recurring_goal");
  assert.ok(insight);
  assert.equal(insight.tone, "attention");
  assert.equal(
    insight.text,
    "A meta “Beber 3 L de água por dia” não foi atingida por completo em 3 das últimas 4 semanas em que foi avaliada (semanas 5, 7 e 8)."
  );
  assert.deepEqual(insight.evidence.weeks, [5, 7, 8]);
});

test("meta recorrente: só 1 falha, ou poucas semanas avaliadas, não geram insight de atenção", () => {
  const few = input({ metrics: [], weeks: [week(5), week(6), week(7)], goals: [goal(5, "fail"), goal(6, "fail")] });
  assert.deepEqual(byRule(deriveInsights(few), "recurring_goal"), []);
  const one = input({
    metrics: [],
    weeks: [week(5), week(6), week(7)],
    goals: [goal(5, "success"), goal(6, "fail"), goal(7, "success")],
  });
  assert.deepEqual(byRule(deriveInsights(one), "recurring_goal"), []);
});

test("meta recorrente: resultado pendente não conta como fato", () => {
  const i = input({
    metrics: [],
    weeks: [week(5), week(6), week(7)],
    goals: [goal(5, "fail"), goal(6, "fail"), goal(7, "pending")],
  });
  assert.deepEqual(byRule(deriveInsights(i), "recurring_goal"), []);
});

test("meta atingida em todas as semanas avaliadas vira observação neutra", () => {
  const i = input({
    metrics: [],
    weeks: [week(5), week(6), week(7)],
    goals: [goal(5, "success"), goal(6, "success"), goal(7, "success")],
  });
  const [insight] = byRule(deriveInsights(i), "recurring_goal");
  assert.ok(insight);
  assert.equal(insight.tone, "info");
  assert.match(insight.text, /foi atingida nas últimas 3 semanas em que foi avaliada \(semanas 5, 6 e 7\)/);
});

test("meta alterada: valor-alvo mudou entre as duas semanas-com-meta mais recentes", () => {
  const i = input({
    metrics: [],
    weeks: [week(5), week(6), week(7)],
    goals: [goal(5, "success"), goal(6, "success", { targetValue: 4 }), goal(7, "pending", { targetValue: 4 })],
  });
  assert.deepEqual(byRule(deriveInsights(i), "goal_changed"), [], "mudou na semana 6; a semana 7 repetiu o valor");

  const changed = input({
    metrics: [],
    weeks: [week(5), week(6), week(7)],
    goals: [goal(5, "success"), goal(6, "success"), goal(7, "pending", { targetValue: 4, unit: "L" })],
  });
  const [insight] = byRule(deriveInsights(changed), "goal_changed");
  assert.ok(insight);
  assert.equal(insight.text, "A meta “Beber 3 L de água por dia” passou de 3 (semana 6) para 4 L (semana 7).");
});

// ---------------------------------------------------------------------------
// Propriedades gerais
// ---------------------------------------------------------------------------

function richInput(): InsightInput {
  return {
    currentWeek: 12,
    metrics: [
      { ...WEIGHT, goalDirection: "decrease" },
      WAIST,
      { key: "energy", label: "Energia", unit: null, goalDirection: null },
    ],
    weeks: [
      week(5, { weight_kg: 83.6, waist_cm: 90, energy: 4, adherence_pct: 5 }),
      week(6, { weight_kg: 83.2, waist_cm: 89, energy: 3, adherence_pct: 4 }),
      week(7, { weight_kg: 83.0, waist_cm: 88, energy: 3, adherence_pct: 4 }),
      week(8, { weight_kg: 82.6, waist_cm: 87, energy: 2, adherence_pct: 3 }),
      week(9, { weight_kg: 82.4, waist_cm: 86, energy: 2, adherence_pct: 3 }),
    ],
    goals: [goal(6, "fail"), goal(7, "fail"), goal(8, "partial"), goal(9, "fail", { targetValue: 4 })],
  };
}

test("pureza: mesma entrada dá a mesma saída e a entrada não é mutada", () => {
  const frozen = deepFreeze(richInput());
  const a = deriveInsights(frozen);
  const b = deriveInsights(frozen);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 5, `esperava vários insights, veio ${a.length}`);
});

test("ordem: atenção antes de informação; ids únicos", () => {
  const insights = deriveInsights(richInput());
  const firstInfo = insights.findIndex((i) => i.tone === "info");
  if (firstInfo >= 0) assert.ok(insights.slice(firstInfo).every((i) => i.tone === "info"));
  assert.equal(new Set(insights.map((i) => i.id)).size, insights.length);
});

test("linguagem: nenhuma frase causal, diagnóstica ou prescritiva em nenhuma regra", () => {
  const forbidden =
    /porque|por causa|devido|motivo|causa|culpa|provavelmente|possivelmente|talvez|indica que|sugere|sinal de|resultado d[eao]|consequência|graças|por isso|portanto|diagnóstic|sintoma|doença|transtorno|deve |devem |precisa|recomend|sugest|tente|considere|falta de (?:foco|disciplina|motivação)|desmotiv|preguiç|sabotag/i;
  const inputs = [
    richInput(),
    input({ metrics: [], weeks: adherence(7, [90, 75, 60]) }),
    input({ currentWeek: 9, metrics: [], weeks: [week(2), week(3), week(4)] }),
    input({ weeks: weights(6, [82.0, 82.0, 82.1, 82.0]), metrics: [{ ...WEIGHT, goalDirection: "increase" }] }),
  ];
  let checked = 0;
  for (const i of inputs) {
    for (const insight of deriveInsights(i)) {
      assert.doesNotMatch(insight.text, forbidden, `frase suspeita: ${insight.text}`);
      checked++;
    }
  }
  assert.ok(checked >= 6, `poucas frases verificadas (${checked})`);
});

test("toda frase tem evidência estruturada coerente com o texto (primeira e última semana citadas)", () => {
  for (const insight of deriveInsights(richInput())) {
    const { weeks } = insight.evidence;
    assert.ok(weeks.length > 0, insight.id);
    for (const w of [weeks[0], weeks[weeks.length - 1]]) {
      assert.match(insight.text, new RegExp(`\\b${w}\\b`), `${insight.id}: semana ${w} não aparece em "${insight.text}"`);
    }
  }
});
