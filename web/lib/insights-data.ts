import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { computeWeekInfo } from "@/lib/repository";
import { getStudentEvolution } from "@/lib/evolution";
import {
  ADHERENCE_KEY,
  deriveInsights,
  hasEnoughHistory,
  type Insight,
  type InsightGoal,
  type InsightInput,
  type InsightWeek,
} from "@/lib/insights";

/**
 * Carrega o histórico de UM aluno e passa pelas regras puras de `lib/insights.ts` (item 31).
 * Só LEITURA, com o client do coach (RLS: `is_coach_of_client` já isola por conta) — nada aqui
 * grava, e nada é persistido: o insight é sempre recalculado do dado bruto, então corrigir um
 * limiar ou uma regra vale retroativamente pra todo o histórico, sem migração.
 *
 * Fontes (todas amarradas à semana do ciclo, item 30):
 *  - `getStudentEvolution` (item 15): só as métricas ACOMPANHADAS agora (item 17) e seus valores
 *    por semana (`metrics`);
 *  - `checkin_instances`: quais semanas tiveram check-in enviado (`submitted`/`reviewed`);
 *  - `checkin_answers` (`adherence_pct`) de check-ins JÁ ENVIADOS — a aderência não vira linha em
 *    `metrics` (é uma escala, ver `METRIC_KEYS_FROM_ANSWERS` em repository.ts) e rascunhos de
 *    check-in pendente também moram em `checkin_answers`, por isso o filtro por status;
 *  - `goals`: metas por semana com o resultado registrado.
 */

export type InsightReport = {
  /** Havia semanas com dado suficientes pra as regras falarem de padrão? Decide a mensagem do estado vazio. */
  enoughData: boolean;
  insights: Insight[];
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** `null` = aluno inexistente / de outra conta (RLS) — quem chama responde 404 ou esconde o bloco. */
export async function getStudentInsightReport(
  clientId: string,
  startDate: string | null
): Promise<InsightReport | null> {
  const evolution = await getStudentEvolution(clientId);
  if (!evolution) return null;

  const supabase = await createSupabaseServerClient();
  const [instancesRes, goalsRes] = await Promise.all([
    supabase.from("checkin_instances").select("id, week_number, status").eq("client_id", clientId),
    supabase
      .from("goals")
      .select("week_number, metric_key, label, unit, target_value, result_status")
      .eq("client_id", clientId)
      .order("week_number", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  for (const res of [instancesRes, goalsRes]) {
    if (res.error) throw new Error(`Não foi possível carregar os padrões do aluno: ${res.error.message}`);
  }

  const submittedInstances = ((instancesRes.data ?? []) as { id: string; week_number: number; status: string }[]).filter(
    (i) => i.status === "submitted" || i.status === "reviewed"
  );

  const adherenceByWeek = new Map<number, number>();
  if (submittedInstances.length > 0) {
    const { data, error } = await supabase
      .from("checkin_answers")
      .select("checkin_id, value")
      .eq("question_key", ADHERENCE_KEY)
      .in(
        "checkin_id",
        submittedInstances.map((i) => i.id)
      );
    if (error) throw new Error(`Não foi possível carregar os padrões do aluno: ${error.message}`);
    const weekByInstance = new Map(submittedInstances.map((i) => [i.id, i.week_number]));
    for (const row of (data ?? []) as { checkin_id: string; value: string | null }[]) {
      const week = weekByInstance.get(row.checkin_id);
      const value = toNumber(row.value);
      if (week != null && value != null) adherenceByWeek.set(week, value);
    }
  }

  // Uma linha por semana: valores das métricas acompanhadas + aderência + "check-in enviado?".
  const submittedWeeks = new Set(submittedInstances.map((i) => i.week_number));
  const weekMap = new Map<number, InsightWeek>();
  const ensure = (weekNumber: number): InsightWeek => {
    const existing = weekMap.get(weekNumber);
    if (existing) return existing;
    const created: InsightWeek = { weekNumber, submitted: submittedWeeks.has(weekNumber), values: {} };
    weekMap.set(weekNumber, created);
    return created;
  };
  for (const w of evolution.weeks) Object.assign(ensure(w.weekNumber).values, w.values);
  for (const week of submittedWeeks) ensure(week);
  for (const [week, value] of adherenceByWeek) ensure(week).values[ADHERENCE_KEY] = value;

  const goals: InsightGoal[] = (
    (goalsRes.data ?? []) as {
      week_number: number;
      metric_key: string;
      label: string;
      unit: string | null;
      target_value: number | string;
      result_status: InsightGoal["resultStatus"];
    }[]
  ).flatMap((g) => {
    const target = toNumber(g.target_value);
    return target == null
      ? []
      : [
          {
            weekNumber: g.week_number,
            metricKey: g.metric_key,
            label: g.label,
            unit: g.unit,
            targetValue: target,
            resultStatus: g.result_status,
          },
        ];
  });

  const input: InsightInput = {
    currentWeek: startDate ? computeWeekInfo(startDate).weekNumber : null,
    metrics: evolution.metrics.map((m) => ({
      key: m.key,
      label: m.label,
      unit: m.unit,
      goalDirection: m.goalDirection,
    })),
    weeks: [...weekMap.values()].sort((a, b) => a.weekNumber - b.weekNumber),
    goals,
  };

  return { enoughData: hasEnoughHistory(input), insights: deriveInsights(input) };
}
