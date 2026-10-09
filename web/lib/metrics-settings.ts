import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import {
  METRIC_CATALOG,
  METRIC_CATALOG_KEYS,
  slugifyMetricKey,
  type MetricDirection,
} from "@/lib/metrics-catalog";
import type { CheckinQuestion } from "@/lib/repository";

/**
 * Configuração de métricas POR ALUNO (item 17 do master TODO) — camada sobre
 * `supabase/migrations/0005_client_metric_settings.sql`. O catálogo padrão (peso/cintura/
 * quadril/energia) vive em `lib/metrics-catalog.ts`; esta tabela só guarda o OVERRIDE por aluno:
 * acompanha/não acompanha, meta (valor-alvo + direção), e as métricas CUSTOM (que não existem em
 * nenhum catálogo de código — label/unidade moram na própria linha).
 *
 * Sem nenhuma linha pra um `client_id`, todo o catálogo padrão é tratado como acompanhado — o
 * MESMO comportamento de antes desta feature existir (nenhum aluno "perde" peso/cintura/etc. só
 * por essa tabela existir vazia). Ver `resolveEffectiveMetrics`.
 */

export type ClientMetricSettingRow = {
  id: string;
  client_id: string;
  metric_key: string;
  source: "catalog" | "custom";
  label: string | null;
  unit: string | null;
  tracked: boolean;
  target_value: number | null;
  goal_direction: MetricDirection | null;
  created_at: string;
};

export type EffectiveMetric = {
  key: string;
  label: string;
  unit: string | null;
  source: "catalog" | "custom";
  tracked: boolean;
  targetValue: number | null;
  goalDirection: MetricDirection | null;
  /** `null` = catálogo ainda sem linha própria (comportamento padrão implícito). */
  settingId: string | null;
};

/**
 * Lê as linhas de configuração do aluno. RLS (0005): coach da conta tem acesso total; o próprio
 * aluno só lê as dele. Erro de leitura (inclui a tabela ainda não existir, se a 0005 não tiver
 * rodado nesta base) degrada pro catálogo padrão em vez de quebrar check-in/home/resumo — a
 * mesma decisão de robustez de `countPendingEvaluations` (lib/evaluations.ts).
 */
export async function getClientMetricSettings(clientId: string): Promise<ClientMetricSettingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_metric_settings")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Não foi possível carregar as métricas do aluno:", error.message);
    return [];
  }
  return (data ?? []) as ClientMetricSettingRow[];
}

/** Junta o catálogo padrão (código) com o override por aluno (banco) — ver comentário do módulo. */
export function resolveEffectiveMetrics(rows: ClientMetricSettingRow[]): EffectiveMetric[] {
  const byKey = new Map(rows.map((r) => [r.metric_key, r]));
  const catalog: EffectiveMetric[] = METRIC_CATALOG.map((item) => {
    const row = byKey.get(item.key);
    return {
      key: item.key,
      label: item.label,
      unit: item.unit,
      source: "catalog",
      tracked: row ? row.tracked : true,
      targetValue: row?.target_value ?? null,
      goalDirection: row?.goal_direction ?? null,
      settingId: row?.id ?? null,
    };
  });
  const custom: EffectiveMetric[] = rows
    .filter((r) => r.source === "custom")
    .map((r) => ({
      key: r.metric_key,
      label: r.label ?? r.metric_key,
      unit: r.unit,
      source: "custom",
      tracked: r.tracked,
      targetValue: r.target_value,
      goalDirection: r.goal_direction,
      settingId: r.id,
    }));
  return [...catalog, ...custom];
}

export async function getEffectiveClientMetrics(clientId: string): Promise<EffectiveMetric[]> {
  return resolveEffectiveMetrics(await getClientMetricSettings(clientId));
}

/** Peso está sendo acompanhado por ESTE aluno? Único uso hoje: gate da Home do portal (item 17). */
export function isWeightTracked(metrics: EffectiveMetric[]): boolean {
  return metrics.find((m) => m.key === "weight_kg")?.tracked ?? true;
}

/**
 * Perguntas do check-in ajustadas à configuração do aluno: some com a pergunta de uma métrica de
 * CATÁLOGO desacompanhada (não aparece nem como campo vazio) e acrescenta uma pergunta SINTÉTICA
 * (não existe em `checkin_questions` — só deste aluno) pra cada métrica CUSTOM acompanhada.
 * `tracks: "measures"`: `lib/checkin-steps.ts` já roteia esse token pro passo 1 (Peso e fotos),
 * junto das outras medidas corporais — sem precisar ensinar `checkin-steps.ts` sobre chaves custom.
 */
export function applyMetricSettingsToQuestions(
  questions: CheckinQuestion[],
  metrics: EffectiveMetric[],
  templateId: string
): CheckinQuestion[] {
  const trackedByKey = new Map(metrics.map((m) => [m.key, m.tracked]));
  const filtered = questions.filter(
    (q) => !METRIC_CATALOG_KEYS.has(q.key) || (trackedByKey.get(q.key) ?? true)
  );
  const existingKeys = new Set(questions.map((q) => q.key));
  const maxSort = questions.reduce((max, q) => Math.max(max, q.sort_order), 0);
  const custom: CheckinQuestion[] = metrics
    .filter((m) => m.source === "custom" && m.tracked && !existingKeys.has(m.key))
    .map((m, i) => ({
      id: `custom:${m.key}`,
      template_id: templateId,
      key: m.key,
      label: m.label,
      type: "number",
      unit: m.unit,
      step: 1,
      tracks: "measures",
      required: false,
      active: true,
      sort_order: maxSort + i + 1,
    }));
  return [...filtered, ...custom];
}

/** Chaves de métrica CUSTOM que este aluno pode gravar em `metrics` agora (tracked = true). */
export function trackedCustomMetricKeys(metrics: EffectiveMetric[]): Set<string> {
  return new Set(metrics.filter((m) => m.source === "custom" && m.tracked).map((m) => m.key));
}

// ============================================================================
// Escrita (coach) — sessão autenticada normal; RLS (0005) garante "só os próprios alunos".
// ============================================================================

/**
 * Cria uma métrica CUSTOM pro aluno (tracked = true). A chave é derivada do label
 * (`slugifyMetricKey`) e nunca colide com o catálogo padrão nem com outra métrica já existente
 * deste aluno — em caso de colisão, acrescenta um sufixo numérico (`_2`, `_3`, ...).
 */
export async function addCustomMetric(
  clientId: string,
  input: { label: string; unit: string | null }
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const existing = await getClientMetricSettings(clientId);
  const used = new Set<string>([...METRIC_CATALOG_KEYS, ...existing.map((r) => r.metric_key)]);

  let key = slugifyMetricKey(input.label);
  if (used.has(key)) {
    let n = 2;
    while (used.has(`${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }

  const { error } = await supabase.from("client_metric_settings").insert({
    client_id: clientId,
    metric_key: key,
    source: "custom",
    label: input.label,
    unit: input.unit,
    tracked: true,
  });
  if (error) {
    throw new Error(`Não foi possível criar a métrica: ${error.message}`);
  }
}

/**
 * Acompanhar/ocultar uma métrica pro aluno — SOFT: nunca apaga a linha nem o histórico em
 * `metrics`, só troca `tracked`. Cria a linha se ainda não existir (caso comum: catálogo sendo
 * ocultado pela primeira vez, sem override prévio). Colunas fora do payload (meta, label...)
 * ficam intocadas quando a linha já existe (upsert do PostgREST só atualiza o que é enviado).
 */
export async function setMetricTracked(
  clientId: string,
  metricKey: string,
  tracked: boolean
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const isCatalog = METRIC_CATALOG_KEYS.has(metricKey);
  const { error } = await supabase.from("client_metric_settings").upsert(
    { client_id: clientId, metric_key: metricKey, source: isCatalog ? "catalog" : "custom", tracked },
    { onConflict: "client_id,metric_key" }
  );
  if (error) {
    throw new Error(`Não foi possível atualizar a métrica: ${error.message}`);
  }
}

/** Define a meta (valor-alvo + direção) de uma métrica pro aluno — mesma lógica de upsert acima. */
export async function setMetricGoal(
  clientId: string,
  metricKey: string,
  input: { targetValue: number | null; goalDirection: MetricDirection | null }
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const isCatalog = METRIC_CATALOG_KEYS.has(metricKey);
  const { error } = await supabase.from("client_metric_settings").upsert(
    {
      client_id: clientId,
      metric_key: metricKey,
      source: isCatalog ? "catalog" : "custom",
      target_value: input.targetValue,
      goal_direction: input.goalDirection,
    },
    { onConflict: "client_id,metric_key" }
  );
  if (error) {
    throw new Error(`Não foi possível salvar a meta: ${error.message}`);
  }
}
