import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { isPhotoAngle, type PhotoAngle } from "@/lib/storage/buckets";
import { periodOfWeek } from "@/lib/checkin-week";
import {
  COMPARISON_METRIC_TABLE_KEYS,
  type ComparisonWeek,
  type MetricKey,
} from "@/lib/week-comparison-format";

/**
 * Dados da comparação visual entre semanas (item 14): TODAS as semanas do aluno até a semana em
 * avaliação, cada uma com período, métricas e as posições que têm foto. NÃO inclui URLs de foto —
 * elas são assinadas sob demanda (`lib/storage/checkin-photos.ts`, com a checagem de acesso do
 * coach) só pras semanas que a tela compara.
 *
 * Só leitura, com o client autenticado (RLS ligado): `checkin_instances`, `metrics`,
 * `checkin_answers` e `photos` já isolam por conta. Uma semana "existe" se tem check-in enviado
 * (`submitted`/`reviewed`), alguma métrica ou alguma foto — ou se é a própria semana avaliada.
 */

/** Período da semana `n` a partir do início do acompanhamento (mesma conta de `computeWeekInfo`). */
function periodOf(startDate: string, weekNumber: number): { start: string; end: string } {
  const { periodStart, periodEnd } = periodOfWeek(startDate, weekNumber);
  return { start: periodStart, end: periodEnd };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Chave de `metrics`/resposta -> chave da comparação (`adherence_pct` vira `adherence`). */
function toMetricKey(key: string): MetricKey | null {
  if (key === "adherence_pct") return "adherence";
  return (COMPARISON_METRIC_TABLE_KEYS as readonly string[]).includes(key) ? (key as MetricKey) : null;
}

export async function getWeekComparisonData(
  client: { id: string; start_date: string | null },
  currentWeek: number
): Promise<ComparisonWeek[]> {
  const supabase = await createSupabaseServerClient();
  const keys = [...COMPARISON_METRIC_TABLE_KEYS];

  const [instancesRes, metricsRes, photosRes] = await Promise.all([
    supabase
      .from("checkin_instances")
      .select("id, week_number, period_start, period_end, status")
      .eq("client_id", client.id)
      .lte("week_number", currentWeek)
      .in("status", ["submitted", "reviewed"]),
    supabase
      .from("metrics")
      .select("week_number, key, value")
      .eq("client_id", client.id)
      .lte("week_number", currentWeek)
      .in("key", keys),
    supabase
      .from("photos")
      .select("week_number, angle")
      .eq("client_id", client.id)
      .lte("week_number", currentWeek),
  ]);
  for (const res of [instancesRes, metricsRes, photosRes]) {
    if (res.error) throw new Error(`Não foi possível carregar a comparação: ${res.error.message}`);
  }

  const instances = (instancesRes.data ?? []) as {
    id: string;
    week_number: number;
    period_start: string;
    period_end: string;
  }[];

  // Respostas do check-in: complementam `metrics` (que só ganha linha pra algumas chaves) e são a
  // fonte da aderência, que no template padrão é uma escala e não vira métrica.
  const answersByWeek = new Map<number, Partial<Record<MetricKey, number>>>();
  if (instances.length > 0) {
    const { data: answerRows, error } = await supabase
      .from("checkin_answers")
      .select("checkin_id, question_key, value")
      .in(
        "checkin_id",
        instances.map((i) => i.id)
      )
      .in("question_key", keys);
    if (error) throw new Error(`Não foi possível carregar a comparação: ${error.message}`);
    const weekByInstance = new Map(instances.map((i) => [i.id, i.week_number]));
    for (const a of (answerRows ?? []) as { checkin_id: string; question_key: string; value: string | null }[]) {
      const week = weekByInstance.get(a.checkin_id);
      const key = toMetricKey(a.question_key);
      const value = toNumber(a.value);
      if (week == null || key == null || value == null) continue;
      if (key === "weight_kg" && value <= 0) continue;
      const bucket = answersByWeek.get(week) ?? {};
      bucket[key] = value;
      answersByWeek.set(week, bucket);
    }
  }

  const metricsByWeek = new Map<number, Partial<Record<MetricKey, number>>>();
  for (const m of (metricsRes.data ?? []) as { week_number: number; key: string; value: number | null }[]) {
    const key = toMetricKey(m.key);
    const value = toNumber(m.value);
    if (key == null || value == null) continue;
    const bucket = metricsByWeek.get(m.week_number) ?? {};
    bucket[key] = value;
    metricsByWeek.set(m.week_number, bucket);
  }

  const anglesByWeek = new Map<number, Set<PhotoAngle>>();
  for (const p of (photosRes.data ?? []) as { week_number: number; angle: string }[]) {
    if (!isPhotoAngle(p.angle)) continue;
    const set = anglesByWeek.get(p.week_number) ?? new Set<PhotoAngle>();
    set.add(p.angle);
    anglesByWeek.set(p.week_number, set);
  }

  const instanceByWeek = new Map(instances.map((i) => [i.week_number, i]));
  const weekNumbers = new Set<number>([currentWeek]);
  for (const w of [
    ...instanceByWeek.keys(),
    ...metricsByWeek.keys(),
    ...anglesByWeek.keys(),
  ]) {
    if (w >= 1 && w <= currentWeek) weekNumbers.add(w);
  }

  return [...weekNumbers]
    .sort((a, b) => a - b)
    .map((weekNumber): ComparisonWeek => {
      const instance = instanceByWeek.get(weekNumber);
      const fallback = client.start_date ? periodOf(client.start_date, weekNumber) : null;
      const periodStart = instance?.period_start ?? fallback?.start ?? "0000-00-00";
      const periodEnd = instance?.period_end ?? fallback?.end ?? "0000-00-00";
      // `metrics` manda; a resposta do check-in preenche o que a tabela não tem (como o peso de
      // check-ins antigos e a aderência).
      const metrics = { ...answersByWeek.get(weekNumber), ...metricsByWeek.get(weekNumber) };
      const answerAdherence = answersByWeek.get(weekNumber)?.adherence;
      if (answerAdherence != null) metrics.adherence = answerAdherence;
      return {
        weekNumber,
        periodStart,
        periodEnd,
        hasCheckin: Boolean(instance),
        metrics,
        photoAngles: [...(anglesByWeek.get(weekNumber) ?? [])],
      };
    });
}
