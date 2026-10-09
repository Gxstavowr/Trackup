import type { PhotoAngle } from "@/lib/storage/buckets";

/**
 * Comparação entre semanas (item 14) — tipos e formatação PUROS (sem I/O, sem `server-only`):
 * usados pelo servidor (`lib/week-comparison.ts`) e pelo componente de cliente. A variação é
 * sempre a diferença numérica crua (semana atual − semana comparativa), com unidade e sinal;
 * nada aqui julga se a variação é boa ou ruim (subir ou descer depende do objetivo do aluno).
 */

/** Uma semana do aluno que existe (tem check-in enviado, métrica ou foto) — atual ou comparável. */
export type ComparisonWeek = {
  weekNumber: number;
  /** AAAA-MM-DD (início do período da semana). */
  periodStart: string;
  periodEnd: string;
  /** Havia check-in enviado/avaliado nessa semana? */
  hasCheckin: boolean;
  /** Valores por `MetricKey` (só o que existe naquela semana). */
  metrics: Partial<Record<MetricKey, number>>;
  /** Posições que têm foto registrada nessa semana (a URL vem sob demanda). */
  photoAngles: PhotoAngle[];
};

export type MetricKey =
  | "weight_kg"
  | "adherence"
  | "energy"
  | "waist_cm"
  | "hip_cm"
  | "body_fat_pct"
  | "workouts_count"
  | "cardio_count"
  | "water_l"
  | "sleep_h"
  | "hunger";

type Unit = { one: string; many: string };

export type MetricDef = {
  key: MetricKey;
  label: string;
  /** Sufixo do valor ("kg", "de 5"...); vazio = só o número. */
  suffix: string;
  /** Unidade da variação ("kg", "ponto"/"pontos"). */
  deltaUnit: Unit;
  /** Sempre listado (mesmo sem valor); os demais só aparecem se alguma das duas semanas tem valor. */
  core: boolean;
};

const same = (u: string): Unit => ({ one: u, many: u });

/** Ordem de exibição. `adherence` ganha "de 5" quando a pergunta é uma escala (ver `metricDefs`). */
const BASE_DEFS: MetricDef[] = [
  { key: "weight_kg", label: "Peso", suffix: "kg", deltaUnit: same("kg"), core: true },
  { key: "adherence", label: "Aderência", suffix: "de 5", deltaUnit: { one: "ponto", many: "pontos" }, core: true },
  { key: "energy", label: "Energia", suffix: "de 5", deltaUnit: { one: "ponto", many: "pontos" }, core: true },
  { key: "waist_cm", label: "Cintura", suffix: "cm", deltaUnit: same("cm"), core: false },
  { key: "hip_cm", label: "Quadril", suffix: "cm", deltaUnit: same("cm"), core: false },
  { key: "body_fat_pct", label: "Gordura corporal", suffix: "%", deltaUnit: same("p.p."), core: false },
  { key: "workouts_count", label: "Treinos", suffix: "", deltaUnit: { one: "treino", many: "treinos" }, core: false },
  { key: "cardio_count", label: "Cardio", suffix: "", deltaUnit: { one: "sessão", many: "sessões" }, core: false },
  { key: "water_l", label: "Água (média/dia)", suffix: "L", deltaUnit: same("L"), core: false },
  { key: "sleep_h", label: "Sono (média/noite)", suffix: "h", deltaUnit: same("h"), core: false },
  { key: "hunger", label: "Fome", suffix: "", deltaUnit: { one: "ponto", many: "pontos" }, core: false },
];

export function metricDefs(adherenceIsScale: boolean): MetricDef[] {
  return BASE_DEFS.map((d) =>
    d.key === "adherence" && !adherenceIsScale ? { ...d, suffix: "" } : d
  );
}

/** Chaves de `metrics`/respostas que a comparação lê (adherence é tratada à parte). */
export const COMPARISON_METRIC_TABLE_KEYS = [
  "weight_kg",
  "waist_cm",
  "hip_cm",
  "body_fat_pct",
  "adherence_pct",
  "workouts_count",
  "cardio_count",
  "water_l",
  "sleep_h",
  "energy",
  "hunger",
] as const;

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatMetricValue(def: MetricDef, value: number): string {
  return def.suffix ? `${formatNumber(value)} ${def.suffix}` : formatNumber(value);
}

/** Diferença numérica (atual − comparativa), arredondada a 2 casas pra não vazar ruído de ponto flutuante. */
export function metricDelta(comparative: number, current: number): number {
  return Math.round((current - comparative) * 100) / 100;
}

/** "−1,6 kg", "+2 pontos", "Sem variação". Sinal com o menos tipográfico (U+2212). */
export function formatMetricDelta(def: MetricDef, delta: number): string {
  if (delta === 0) return "Sem variação";
  const abs = Math.abs(delta);
  const unit = abs === 1 ? def.deltaUnit.one : def.deltaUnit.many;
  return `${delta > 0 ? "+" : "−"}${formatNumber(abs)} ${unit}`;
}

/** AAAA-MM-DD -> dd/mm (sem passar por Date, pra não deslocar o dia por fuso). */
export function dateShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
}

/** Rótulo fixo de uma semana, sempre igual nas fotos, nos seletores e nas métricas. */
export function weekLabel(week: Pick<ComparisonWeek, "weekNumber" | "periodStart">): string {
  return `Semana ${week.weekNumber} · ${dateShort(week.periodStart)}`;
}

export const ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: "Frente",
  back: "Costas",
  side: "Lateral",
};

/** Como o ângulo entra numa frase: "Sem foto de frente na semana 5". */
export const ANGLE_PHRASE: Record<PhotoAngle, string> = {
  front: "de frente",
  back: "de costas",
  side: "lateral",
};

export const COMPARISON_ANGLES: readonly PhotoAngle[] = ["front", "back", "side"];

/** Semana anterior mais próxima (com registro) e a primeira semana do aluno, entre as comparáveis. */
export function comparableWeeks(weeks: ComparisonWeek[], currentWeek: number): ComparisonWeek[] {
  return weeks.filter((w) => w.weekNumber < currentWeek).sort((a, b) => a.weekNumber - b.weekNumber);
}
