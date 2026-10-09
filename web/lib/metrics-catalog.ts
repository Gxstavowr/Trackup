/**
 * Catálogo de métricas + regra de meta (item 17 do master TODO — "Criar métricas individuais por
 * aluno"). Puro (sem I/O, sem "server-only"): usado tanto no servidor (`lib/metrics-settings.ts`)
 * quanto em componentes client (rótulos/opções da tela de configuração).
 */

export type MetricDirection = "increase" | "decrease" | "maintain";

export type MetricCatalogItem = {
  key: string;
  label: string;
  unit: string | null;
};

/**
 * Catálogo padrão pré-cadastrado: peso é óbvio; cintura, quadril e energia já existem no schema
 * (`metrics.key`, `supabase/migrations/0001_init.sql`) e no template padrão de check-in — por
 * isso entram como catálogo inicial em vez de ficarem escondidas atrás de uma métrica custom.
 * Label/unidade vivem AQUI, não no banco (`client_metric_settings`, 0005): trocar o rótulo de uma
 * métrica de catálogo é uma decisão de produto pra TODOS os alunos, não por aluno — o banco só
 * guarda o override por aluno (acompanha/não acompanha + meta).
 */
export const METRIC_CATALOG: MetricCatalogItem[] = [
  { key: "weight_kg", label: "Peso", unit: "kg" },
  { key: "waist_cm", label: "Cintura", unit: "cm" },
  { key: "hip_cm", label: "Quadril", unit: "cm" },
  { key: "energy", label: "Energia", unit: null },
];

export const METRIC_CATALOG_KEYS = new Set(METRIC_CATALOG.map((m) => m.key));

export const GOAL_DIRECTION_LABEL: Record<MetricDirection, string> = {
  increase: "Aumentar",
  decrease: "Diminuir",
  maintain: "Manter",
};

export const GOAL_DIRECTION_OPTIONS: { value: MetricDirection; label: string }[] = [
  { value: "increase", label: "Aumentar" },
  { value: "decrease", label: "Diminuir" },
  { value: "maintain", label: "Manter" },
];

/**
 * Generaliza `Trackly.isGoodWeightDelta` do protótipo (item 22, `prototype/assets/js/data.js`):
 * lá a direção "boa" era sempre inferida do objetivo do aluno, só pra peso. Aqui a direção é
 * explícita por métrica+aluno (`client_metric_settings.goal_direction`) e vale pra qualquer
 * métrica numérica. Sem direção definida (`null`, inclui "maintain"): nenhuma variação é "boa" ou
 * "ruim" por si — `null` de volta (quem chama decide como tratar "neutro").
 */
export function isGoodMetricDelta(direction: MetricDirection | null, delta: number): boolean | null {
  if (direction === "increase") return delta >= 0;
  if (direction === "decrease") return delta <= 0;
  return null;
}

/** "custom_<slug>" a partir do label digitado pelo coach — nunca colide com o catálogo padrão. */
export function slugifyMetricKey(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return `custom_${base || "metrica"}`;
}
