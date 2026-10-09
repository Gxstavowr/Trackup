import { GOAL_DIRECTION_LABEL, isGoodMetricDelta, type MetricDirection } from "@/lib/metrics-catalog";
import { formatMetricValue } from "@/lib/evolution-format";
import { formatNumber } from "@/lib/week-comparison-format";

/**
 * INTELIGÊNCIA DETERMINÍSTICA (item 31 do master TODO) — "Padrões observados" do aluno, SEM "AI
 * coach". Cada regra é uma função PURA `(InsightInput) => Insight[]` (sem I/O, sem data/hora do
 * relógio, sem aleatoriedade): mesma entrada, mesma saída. O módulo é puro de propósito (sem
 * `server-only`) pra rodar no servidor, no cliente ou num script de teste, e pra o dado agregado
 * de vários alunos poder passar pelas mesmas regras no futuro (benchmarking) sem reescrever nada.
 *
 * REGRA DE LINGUAGEM (vale pra qualquer regra nova): só FATO OBSERVÁVEL, em português neutro —
 * "Peso caiu 1,2 kg em 4 semanas (de 83,6 kg para 82,4 kg)". Nunca diagnóstico, nunca causa
 * ("por causa de", "devido a", "provavelmente"), nunca recomendação. Toda frase carrega os
 * números e as semanas que a sustentam, e o mesmo suporte vai em `Insight.evidence` (estruturado)
 * pra qualquer consumidor futuro (relatório, alerta, agregação) checar o fato sem reparsear texto.
 *
 * REGRA DE DADOS MÍNIMOS: menos de `MIN_HISTORY_WEEKS` semanas com dado -> nenhum insight (mesma
 * régua de `Trackly.buildCoachMemory` no protótipo). Cada regra tem ainda o seu próprio mínimo de
 * pontos, pra nunca afirmar uma tendência com dois pontos.
 *
 * Complementa (não duplica) `lib/evaluation-signals.ts` (item 13): lá é a semana em avaliação
 * contra a anterior; aqui é o padrão ao longo de várias semanas.
 */

// ============================================================================
// Tipos
// ============================================================================

export type InsightRuleId =
  | "metric_change"
  | "metric_stable"
  | "adherence_drop"
  | "missed_checkins"
  | "recurring_goal"
  | "goal_changed";

export type InsightTone = "attention" | "info";

export type InsightPoint = { weekNumber: number; value: number };

/** O que sustenta o fato, em forma estruturada (o texto é só uma leitura disso). */
export type InsightEvidence = {
  /** Indicador observado (`metrics.key`; `adherence_pct` pra aderência; chave da meta) ou `null`. */
  metricKey: string | null;
  /** Semanas cobertas pela observação, ascendente. */
  weeks: number[];
  /** Série observada (vazia nas regras que não são numéricas, como check-ins faltantes). */
  points: InsightPoint[];
  /** Limiar da regra que foi atingido (`null` quando a regra não tem limiar numérico). */
  threshold: number | null;
};

export type Insight = {
  /** Estável entre chamadas: `<regra>:<indicador>` — serve de `key` de lista e de chave de dedupe. */
  id: string;
  ruleId: InsightRuleId;
  tone: InsightTone;
  /** Frase factual em português, com números e semanas. */
  text: string;
  evidence: InsightEvidence;
};

export type InsightMetric = {
  key: string;
  label: string;
  unit: string | null;
  goalDirection: MetricDirection | null;
};

export type InsightWeek = {
  weekNumber: number;
  /** Havia check-in enviado (submitted/reviewed) nesta semana? */
  submitted: boolean;
  /** Valores por chave de métrica; a aderência (resposta do check-in) entra como `adherence_pct`. */
  values: Record<string, number>;
};

export type InsightGoal = {
  weekNumber: number;
  metricKey: string;
  label: string;
  unit: string | null;
  targetValue: number;
  resultStatus: "success" | "partial" | "fail" | "pending";
};

export type InsightInput = {
  /** Semana corrente do aluno (a partir de `start_date`); `null` desliga a regra de check-ins faltantes. */
  currentWeek: number | null;
  /** SÓ as métricas acompanhadas agora (item 17): o que não está aqui nunca vira insight. */
  metrics: InsightMetric[];
  weeks: InsightWeek[];
  goals: InsightGoal[];
  /** Aderência é escala 1–5 (template padrão) ou percentual? Sem valor: escala se todo valor <= 5. */
  adherenceIsScale?: boolean;
};

export type InsightRule = (input: InsightInput) => Insight[];

// ============================================================================
// Limiares (fixos e simples de propósito — mesma filosofia de evaluation-signals.ts)
// ============================================================================

/** Menos semanas com dado do que isto -> nenhum insight. */
export const MIN_HISTORY_WEEKS = 3;
/** Janela das regras numéricas: registros até N semanas antes do mais recente. */
export const TREND_WINDOW_WEEKS = 4;
/** Mínimo de registros na janela pra falar de mudança / de estabilidade / de queda de aderência. */
export const MIN_CHANGE_POINTS = 3;
export const MIN_STABLE_POINTS = 4;
export const MIN_ADHERENCE_POINTS = 3;
/** Variação mínima (na unidade da métrica) entre o primeiro e o último registro da janela. */
export const CHANGE_MIN: Record<string, number> = { weight_kg: 1, waist_cm: 2, hip_cm: 2, energy: 2 };
/** Métrica sem limiar próprio (custom): variação de 10% do primeiro valor. */
export const CUSTOM_RELATIVE_CHANGE = 0.1;
/** Amplitude máxima (max − min) pra chamar de "estável" — só medidas corporais. */
export const STABLE_MAX_RANGE: Record<string, number> = { weight_kg: 0.5, waist_cm: 1, hip_cm: 1 };
/** Queda mínima de aderência: 2 pontos numa escala de 5 ou 15 p.p. num percentual. */
export const ADHERENCE_DROP_SCALE = 2;
export const ADHERENCE_DROP_PERCENT = 15;
/** Check-ins faltantes: janela de semanas CONCLUÍDAS e mínimo de faltas. */
export const MISSED_WINDOW_WEEKS = 4;
export const MISSED_MIN = 2;
/** Metas: janela de semanas-com-meta, mínimo de semanas avaliadas da mesma meta e de não atingidas. */
export const GOAL_WINDOW_WEEKS = 4;
export const GOAL_MIN_WEEKS = 3;
export const GOAL_MIN_UNMET = 2;

export const ADHERENCE_KEY = "adherence_pct";

// ============================================================================
// Auxiliares
// ============================================================================

const EPS = 1e-9;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Série ascendente (por semana) de uma chave, só com valores numéricos válidos. */
function seriesOf(weeks: InsightWeek[], key: string): InsightPoint[] {
  return weeks
    .filter((w) => isFiniteNumber(w.values[key]))
    .map((w) => ({ weekNumber: w.weekNumber, value: w.values[key] }))
    .sort((a, b) => a.weekNumber - b.weekNumber);
}

/** Registros até `spanWeeks` semanas antes do mais recente (inclusive). */
function windowOf(points: InsightPoint[], spanWeeks: number): InsightPoint[] {
  if (points.length === 0) return [];
  const latest = points[points.length - 1].weekNumber;
  return points.filter((p) => p.weekNumber >= latest - spanWeeks);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** [6] -> "6"; [6, 8] -> "6 e 8"; [5, 6, 8] -> "5, 6 e 8". */
function joinWeeks(weeks: number[]): string {
  if (weeks.length <= 1) return weeks.join("");
  return `${weeks.slice(0, -1).join(", ")} e ${weeks[weeks.length - 1]}`;
}

/** " Meta definida para este indicador: diminuir." — só quando a direção é aumentar/diminuir. */
function goalNote(direction: MetricDirection | null): string {
  if (direction !== "increase" && direction !== "decrease") return "";
  return ` Meta definida para este indicador: ${GOAL_DIRECTION_LABEL[direction].toLowerCase()}.`;
}

function fmt(unit: string | null, value: number): string {
  return formatMetricValue(unit, value);
}

function changeThreshold(key: string, first: number): number | null {
  if (key in CHANGE_MIN) return CHANGE_MIN[key];
  if (first === 0) return null;
  return Math.abs(first) * CUSTOM_RELATIVE_CHANGE;
}

// ============================================================================
// Regras (cada uma pura; a ordem em `INSIGHT_RULES` é a ordem de exibição dentro do mesmo tom)
// ============================================================================

/** Mudança de uma métrica acompanhada entre o primeiro e o último registro da janela recente. */
export const metricChangeRule: InsightRule = (input) => {
  const insights: Insight[] = [];
  for (const metric of input.metrics) {
    const pts = windowOf(seriesOf(input.weeks, metric.key), TREND_WINDOW_WEEKS);
    if (pts.length < MIN_CHANGE_POINTS) continue;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const delta = round2(last.value - first.value);
    const threshold = changeThreshold(metric.key, first.value);
    if (threshold == null || Math.abs(delta) + EPS < threshold) continue;

    const steps = pts.slice(1).map((p, i) => p.value - pts[i].value);
    const consistent = steps.every((s) => s > 0) || steps.every((s) => s < 0);
    const span = last.weekNumber - first.weekNumber;
    const verb = delta > 0 ? "subiu" : "caiu";
    const spanText = `${span} ${plural(span, "semana", "semanas")}`;
    const support = consistent ? `; ${delta > 0 ? "alta" : "queda"} em todos os registros do período` : "";
    const body = metric.unit
      ? `${metric.label} ${verb} ${fmt(metric.unit, Math.abs(delta))} em ${spanText} (de ${fmt(metric.unit, first.value)} para ${fmt(metric.unit, last.value)}; semanas ${first.weekNumber} a ${last.weekNumber}${support}).`
      : `${metric.label} ${verb} de ${formatNumber(first.value)} para ${formatNumber(last.value)} em ${spanText} (semanas ${first.weekNumber} a ${last.weekNumber}${support}).`;

    insights.push({
      id: `metric_change:${metric.key}`,
      ruleId: "metric_change",
      // Só "atenção" quando a variação vai contra a direção que o próprio coach definiu pra meta.
      tone: isGoodMetricDelta(metric.goalDirection, delta) === false ? "attention" : "info",
      text: `${body}${goalNote(metric.goalDirection)}`,
      evidence: {
        metricKey: metric.key,
        weeks: pts.map((p) => p.weekNumber),
        points: pts,
        threshold: round2(threshold),
      },
    });
  }
  return insights;
};

/** Medida corporal praticamente parada nos últimos registros (estabilidade). */
export const metricStableRule: InsightRule = (input) => {
  const insights: Insight[] = [];
  for (const metric of input.metrics) {
    const maxRange = STABLE_MAX_RANGE[metric.key];
    if (maxRange == null) continue;
    const pts = windowOf(seriesOf(input.weeks, metric.key), TREND_WINDOW_WEEKS);
    if (pts.length < MIN_STABLE_POINTS) continue;

    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (round2(max - min) > maxRange + EPS) continue;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const level =
      min === max ? `ficou em ${fmt(metric.unit, min)}` : `ficou entre ${fmt(metric.unit, min)} e ${fmt(metric.unit, max)}`;
    const hasGoal = metric.goalDirection === "increase" || metric.goalDirection === "decrease";

    insights.push({
      id: `metric_stable:${metric.key}`,
      ruleId: "metric_stable",
      // Parado + meta de aumentar/diminuir definida = vale o coach olhar; parado sem meta é só informação.
      tone: hasGoal ? "attention" : "info",
      text: `${metric.label} ${level} nas últimas ${pts.length} semanas com registro (semanas ${first.weekNumber} a ${last.weekNumber}).${goalNote(metric.goalDirection)}`,
      evidence: {
        metricKey: metric.key,
        weeks: pts.map((p) => p.weekNumber),
        points: pts,
        threshold: maxRange,
      },
    });
  }
  return insights;
};

/** Aderência em queda contínua nos últimos registros (escala 1–5 ou percentual). */
export const adherenceDropRule: InsightRule = (input) => {
  const pts = windowOf(seriesOf(input.weeks, ADHERENCE_KEY), TREND_WINDOW_WEEKS - 1);
  if (pts.length < MIN_ADHERENCE_POINTS) return [];

  const isScale = input.adherenceIsScale ?? pts.every((p) => p.value <= 5);
  const minDrop = isScale ? ADHERENCE_DROP_SCALE : ADHERENCE_DROP_PERCENT;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const nonIncreasing = pts.every((p, i) => i === 0 || p.value <= pts[i - 1].value);
  if (!nonIncreasing || round2(first.value - last.value) + EPS < minDrop) return [];

  const shown = (v: number) => (isScale ? formatNumber(v) : `${formatNumber(v)}%`);
  return [
    {
      id: `adherence_drop:${ADHERENCE_KEY}`,
      ruleId: "adherence_drop",
      tone: "attention",
      text: `Aderência caiu de ${shown(first.value)} para ${shown(last.value)}${isScale ? " (escala de 1 a 5)" : ""} nas últimas ${pts.length} semanas com registro (semanas ${first.weekNumber} a ${last.weekNumber}).`,
      evidence: { metricKey: ADHERENCE_KEY, weeks: pts.map((p) => p.weekNumber), points: pts, threshold: minDrop },
    },
  ];
};

/** Semanas concluídas recentes sem check-in enviado. */
export const missedCheckinsRule: InsightRule = (input) => {
  if (input.currentWeek == null) return [];
  const from = Math.max(1, input.currentWeek - MISSED_WINDOW_WEEKS);
  const to = input.currentWeek - 1; // a semana corrente ainda está aberta: não conta como falta
  if (to < from) return [];

  const submitted = new Set(input.weeks.filter((w) => w.submitted).map((w) => w.weekNumber));
  const missed: number[] = [];
  for (let w = from; w <= to; w++) if (!submitted.has(w)) missed.push(w);
  if (missed.length < MISSED_MIN) return [];

  const total = to - from + 1;
  return [
    {
      id: "missed_checkins:checkin",
      ruleId: "missed_checkins",
      tone: "attention",
      text: `Sem check-in enviado em ${missed.length} das últimas ${total} semanas concluídas (${plural(missed.length, "semana", "semanas")} ${joinWeeks(missed)}).`,
      evidence: { metricKey: null, weeks: missed, points: [], threshold: MISSED_MIN },
    },
  ];
};

type GoalGroup = { key: string; label: string; rows: InsightGoal[] };

/** Metas das últimas `GOAL_WINDOW_WEEKS` semanas-com-meta, agrupadas por indicador. */
function goalGroupsInWindow(goals: InsightGoal[]): GoalGroup[] {
  const goalWeeks = [...new Set(goals.map((g) => g.weekNumber))].sort((a, b) => a - b).slice(-GOAL_WINDOW_WEEKS);
  const inWindow = new Set(goalWeeks);
  const groups = new Map<string, GoalGroup>();
  for (const g of [...goals].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (!inWindow.has(g.weekNumber)) continue;
    const group = groups.get(g.metricKey) ?? { key: g.metricKey, label: g.label, rows: [] };
    group.label = g.label; // o rótulo mais recente vence
    group.rows.push(g);
    groups.set(g.metricKey, group);
  }
  return [...groups.values()];
}

/** Meta que se repete nas últimas semanas-com-meta sem ser atingida (ou atingida em todas). */
export const recurringGoalRule: InsightRule = (input) => {
  const insights: Insight[] = [];
  for (const group of goalGroupsInWindow(input.goals)) {
    // Só semanas com resultado registrado (`pending` ainda não é fato). Uma linha por semana.
    const byWeek = new Map<number, boolean>(); // semana -> atingida por completo?
    for (const g of group.rows) {
      if (g.resultStatus === "pending") continue;
      byWeek.set(g.weekNumber, (byWeek.get(g.weekNumber) ?? true) && g.resultStatus === "success");
    }
    if (byWeek.size < GOAL_MIN_WEEKS) continue;

    const weeks = [...byWeek.keys()].sort((a, b) => a - b);
    const unmetWeeks = weeks.filter((w) => byWeek.get(w) === false);

    if (unmetWeeks.length >= GOAL_MIN_UNMET) {
      insights.push({
        id: `recurring_goal:${group.key}`,
        ruleId: "recurring_goal",
        tone: "attention",
        text: `A meta “${group.label}” não foi atingida por completo em ${unmetWeeks.length} das últimas ${weeks.length} semanas em que foi avaliada (semanas ${joinWeeks(unmetWeeks)}).`,
        evidence: { metricKey: group.key, weeks: unmetWeeks, points: [], threshold: GOAL_MIN_UNMET },
      });
    } else if (unmetWeeks.length === 0) {
      insights.push({
        id: `recurring_goal:${group.key}`,
        ruleId: "recurring_goal",
        tone: "info",
        text: `A meta “${group.label}” foi atingida nas últimas ${weeks.length} semanas em que foi avaliada (semanas ${joinWeeks(weeks)}).`,
        evidence: { metricKey: group.key, weeks, points: [], threshold: GOAL_MIN_WEEKS },
      });
    }
  }
  return insights;
};

/** Valor-alvo de uma meta que mudou entre as duas semanas-com-meta mais recentes do mesmo indicador. */
export const goalChangedRule: InsightRule = (input) => {
  if (input.goals.length === 0) return [];
  const latestGoalWeek = Math.max(...input.goals.map((g) => g.weekNumber));
  const insights: Insight[] = [];

  const byKey = new Map<string, InsightGoal[]>();
  for (const g of input.goals) byKey.set(g.metricKey, [...(byKey.get(g.metricKey) ?? []), g]);

  for (const [key, rows] of byKey) {
    const weeks = [...new Set(rows.map((g) => g.weekNumber))].sort((a, b) => a - b);
    if (weeks.length < 2) continue;
    const currentWeek = weeks[weeks.length - 1];
    if (currentWeek !== latestGoalWeek) continue; // mudança antiga: já está no Histórico, não aqui
    const previousWeek = weeks[weeks.length - 2];
    // Uma meta por indicador e semana é o normal; se houver mais, a última criada vale (ordem da entrada).
    const at = (w: number) => [...rows].reverse().find((g) => g.weekNumber === w) as InsightGoal;
    const current = at(currentWeek);
    const previous = at(previousWeek);
    if (round2(current.targetValue) === round2(previous.targetValue)) continue;

    insights.push({
      id: `goal_changed:${key}`,
      ruleId: "goal_changed",
      tone: "info",
      text: `A meta “${current.label}” passou de ${fmt(previous.unit, previous.targetValue)} (semana ${previousWeek}) para ${fmt(current.unit, current.targetValue)} (semana ${currentWeek}).`,
      evidence: {
        metricKey: key,
        weeks: [previousWeek, currentWeek],
        points: [
          { weekNumber: previousWeek, value: previous.targetValue },
          { weekNumber: currentWeek, value: current.targetValue },
        ],
        threshold: null,
      },
    });
  }
  return insights;
};

/** Ordem = ordem de exibição dentro do mesmo tom. Regra nova = função nova + uma linha aqui. */
export const INSIGHT_RULES: readonly InsightRule[] = [
  adherenceDropRule,
  missedCheckinsRule,
  recurringGoalRule,
  metricChangeRule,
  metricStableRule,
  goalChangedRule,
];

// ============================================================================
// API
// ============================================================================

/** Há semanas com dado suficientes pra qualquer regra falar de padrão? */
export function hasEnoughHistory(input: InsightInput): boolean {
  const withData = input.weeks.filter((w) => w.submitted || Object.keys(w.values).length > 0);
  return withData.length >= MIN_HISTORY_WEEKS;
}

/**
 * Roda todas as regras. Dados insuficientes -> `[]`. Atenção antes de informação; dentro do mesmo
 * tom, a ordem de `INSIGHT_RULES` (a ordenação é estável).
 */
export function deriveInsights(input: InsightInput): Insight[] {
  if (!hasEnoughHistory(input)) return [];
  const all = INSIGHT_RULES.flatMap((rule) => rule(input));
  return [...all.filter((i) => i.tone === "attention"), ...all.filter((i) => i.tone !== "attention")];
}
