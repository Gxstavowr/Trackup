import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getClient, type Client } from "@/lib/repository";
import { getEffectiveClientMetrics } from "@/lib/metrics-settings";
import type { EvolutionData, EvolutionMetricDef, EvolutionWeekPoint } from "@/lib/evolution-format";

/**
 * EVOLUÇÃO DO ALUNO (item 15 do master TODO) — aba "Evolução" do workspace do aluno: tendência
 * numérica das métricas ao longo das semanas (gráfico principal de peso + cards compactos das
 * demais), sempre respeitando a configuração de métricas POR ALUNO do item 17
 * (`getEffectiveClientMetrics`, `lib/metrics-settings.ts`) — uma métrica desativada NUNCA aparece
 * aqui, mesmo que tenha histórico gravado em `metrics`; uma métrica CUSTOM acompanhada aparece
 * como card normalmente.
 *
 * Diferente de `lib/history.ts` (item 16, timeline de EVENTOS): aqui não há check-in/orientação/
 * meta/evento — só a série de valores numéricos por semana, por métrica.
 *
 * Fonte: `metrics` (client_id, week_number, key, value) + `checkin_instances` (pra data real do
 * início de cada semana, mesma fonte que `lib/week-comparison.ts` usa). RLS (`is_coach_of_client`)
 * garante o isolamento — mesmo padrão das outras abas do aluno.
 */

function toNumber(value: number | string | null): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Monta a evolução completa (todas as semanas com dado) de UM aluno — o recorte por período
 * (4/8/12 semanas ou completo) é feito no cliente, sobre este mesmo array, pra gráfico e cards
 * nunca divergirem ao trocar o período (`selectPeriodWeeks`/`computeMetricTrend`,
 * `lib/evolution-format.ts`). Devolve `null` se o aluno não existe ou não pertence à conta do
 * coach autenticado (mesma checagem — RLS via `getClient` — das outras abas: quem chama responde
 * 404, sem distinguir os dois casos).
 */
export async function getStudentEvolution(clientId: string): Promise<EvolutionData | null> {
  const client = await getClient(clientId);
  if (!client) return null;
  const clientName = (client as Client).name;

  // Item 17: só as métricas que ESTE aluno está acompanhando agora — funciona igual com ou sem a
  // migration 0005 aplicada (sem linha nenhuma, todo o catálogo padrão entra como acompanhado; ver
  // `resolveEffectiveMetrics`).
  const effective = await getEffectiveClientMetrics(clientId);
  const tracked = effective.filter((m) => m.tracked);
  const metrics: EvolutionMetricDef[] = tracked.map((m) => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    source: m.source,
    goalDirection: m.goalDirection,
    targetValue: m.targetValue,
  }));

  if (metrics.length === 0) {
    // Nenhuma métrica acompanhada pra este aluno — a página mostra o estado vazio próprio, sem ir
    // ao banco buscar `metrics` (não há chave nenhuma pra filtrar).
    return { clientName, metrics: [], weeks: [] };
  }

  const supabase = await createSupabaseServerClient();
  const keys = metrics.map((m) => m.key);

  const [metricsRes, instancesRes] = await Promise.all([
    supabase.from("metrics").select("week_number, key, value").eq("client_id", clientId).in("key", keys),
    supabase.from("checkin_instances").select("week_number, period_start").eq("client_id", clientId),
  ]);
  for (const res of [metricsRes, instancesRes]) {
    if (res.error) {
      throw new Error(`Não foi possível carregar a evolução do aluno: ${res.error.message}`);
    }
  }

  const periodStartByWeek = new Map<number, string>();
  for (const row of (instancesRes.data ?? []) as { week_number: number; period_start: string }[]) {
    periodStartByWeek.set(row.week_number, row.period_start);
  }

  const valuesByWeek = new Map<number, Record<string, number>>();
  for (const row of (metricsRes.data ?? []) as { week_number: number; key: string; value: number | string | null }[]) {
    const value = toNumber(row.value);
    if (value == null) continue;
    // Mesma guarda de `metrics` em `lib/repository.ts`/`lib/week-comparison.ts`: peso <= 0 é lixo
    // de digitação, não um registro válido — não deve virar ponto no gráfico.
    if (row.key === "weight_kg" && value <= 0) continue;
    const bucket = valuesByWeek.get(row.week_number) ?? {};
    bucket[row.key] = value;
    valuesByWeek.set(row.week_number, bucket);
  }

  const weeks: EvolutionWeekPoint[] = [...valuesByWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, values]) => ({
      weekNumber,
      periodStart: periodStartByWeek.get(weekNumber) ?? null,
      values,
    }));

  return { clientName, metrics, weeks };
}
