import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { unitForValue } from "@/lib/week-comparison-format";
import { getClientMetricSettings, resolveEffectiveMetrics } from "@/lib/metrics-settings";
import type { CheckinInstanceStatus } from "@/lib/repository";
import type { EvaluationGoal, OrientationRecord } from "@/lib/evaluations";
import type { CoachAnswer } from "@/lib/evaluation-answers";
import { formatCheckinAnswer, getCatalogQuestion } from "@/lib/checkin-catalog";

/**
 * O REGISTRO de UMA semana do aluno, exatamente como ficou gravado (V3, tarefas 16/17): check-in
 * (status + data/hora de envio), respostas com rótulo, metas, orientação (enviada ou rascunho),
 * sessões de treino concluídas. Alimenta a área "Recebido nesta semana" da avaliação atual e a
 * visão SOMENTE LEITURA de uma semana passada (`/coach/alunos/[id]/avaliacao?semana=N`).
 *
 * Só leitura, client autenticado (RLS ligado): `checkin_instances`, `checkin_answers`,
 * `checkin_questions`, `goals`, `orientations` e `workout_sessions` já isolam por conta — aluno de
 * outra conta devolve tudo vazio. Nada aqui inventa valor: o que não foi registrado fica ausente.
 * Fotos e métricas numéricas vêm de `getWeekComparisonData`/`listClientPhotos` (mesma fonte da
 * comparação), não daqui.
 */

export type WeekRecord = {
  weekNumber: number;
  checkin: {
    id: string;
    status: CheckinInstanceStatus;
    periodStart: string;
    periodEnd: string;
    submittedAt: string | null;
    reviewOpenedAt: string | null;
    reviewedAt: string | null;
  } | null;
  /** Respostas do check-in desta semana (ordem do modelo; extras no fim). Vazio sem check-in. */
  answers: CoachAnswer[];
  /** `adherence_pct` é escala 1–5 neste modelo? */
  adherenceIsScale: boolean;
  goals: EvaluationGoal[];
  /** Orientação desta semana (enviada ou rascunho), se houver. */
  orientation: OrientationRecord | null;
  /** Sessões de treino concluídas no app; `null` se a leitura falhou. */
  sessionsDone: number | null;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Mesma regra de `formatAnswer` em `lib/evaluations.ts`: chaves do catálogo usam o formatador do
 * catálogo (rótulo das opções, Sim/Não, data dd/mm/aaaa); o resto, escala/número com unidade.
 */
function formatByType(
  value: string,
  type: string | undefined,
  unit: string | null | undefined,
  key?: string
): string {
  // Sim/Não ("boolean", inclusive criadas pelo coach): grava yes/no, exibe "Sim"/"Não".
  if ((key && getCatalogQuestion(key)) || type === "boolean") {
    return formatCheckinAnswer({ key: key ?? "", type: type ?? "text", unit }, value);
  }
  if (type === "scale") return `${value} de 5`;
  if (type === "number" || type === "number+text") {
    const n = toNumber(value);
    if (n != null) {
      const u = unitForValue(unit, n);
      return `${n.toLocaleString("pt-BR")}${u ? ` ${u}` : ""}`;
    }
  }
  return value;
}

export async function getWeekRecord(clientId: string, weekNumber: number): Promise<WeekRecord> {
  const supabase = await createSupabaseServerClient();

  const [instanceRes, goalsRes, orientationRes, sessionsRes] = await Promise.all([
    supabase
      .from("checkin_instances")
      .select("id, template_id, status, period_start, period_end, submitted_at, review_opened_at, reviewed_at")
      .eq("client_id", clientId)
      .eq("week_number", weekNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("id, label, target_value, unit, result_value, result_status")
      .eq("client_id", clientId)
      .eq("week_number", weekNumber)
      .order("created_at", { ascending: true }),
    supabase
      .from("orientations")
      .select("*")
      .eq("client_id", clientId)
      .eq("week_number", weekNumber)
      .order("created_at", { ascending: false }),
    supabase
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("week_number", weekNumber)
      .eq("status", "completed"),
  ]);
  for (const res of [instanceRes, goalsRes, orientationRes]) {
    if (res.error) throw new Error(`Não foi possível carregar a semana ${weekNumber}: ${res.error.message}`);
  }

  const inst = instanceRes.data as {
    id: string;
    template_id: string | null;
    status: CheckinInstanceStatus;
    period_start: string;
    period_end: string;
    submitted_at: string | null;
    review_opened_at: string | null;
    reviewed_at: string | null;
  } | null;

  // Orientação: a ENVIADA tem prioridade sobre um rascunho que tenha sobrado (duplicata por corrida).
  const orientations = (orientationRes.data ?? []) as OrientationRecord[];
  const orientation = orientations.find((o) => !o.is_draft && o.sent_at) ?? orientations[0] ?? null;

  const answers: CoachAnswer[] = [];
  let adherenceIsScale = true;
  const sent = inst && (inst.status === "submitted" || inst.status === "reviewed");
  if (inst && sent) {
    let templateId = inst.template_id;
    if (!templateId) {
      const { data: clientRow } = await supabase.from("clients").select("account_id").eq("id", clientId).maybeSingle();
      if (clientRow?.account_id) {
        const { data: tpl } = await supabase
          .from("checkin_templates")
          .select("id")
          .eq("account_id", clientRow.account_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        templateId = (tpl?.id as string | undefined) ?? null;
      }
    }
    const [answersRes, questionsRes] = await Promise.all([
      supabase.from("checkin_answers").select("question_key, value").eq("checkin_id", inst.id),
      templateId
        ? supabase
            .from("checkin_questions")
            .select("key, label, type, unit, sort_order")
            .eq("template_id", templateId)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (answersRes.error) {
      throw new Error(`Não foi possível carregar as respostas da semana ${weekNumber}: ${answersRes.error.message}`);
    }
    const values: Record<string, string> = {};
    for (const a of (answersRes.data ?? []) as { question_key: string; value: string | null }[]) {
      if (a.value != null && a.value.trim() !== "") values[a.question_key] = a.value;
    }
    const questions = (questionsRes.data ?? []) as { key: string; label: string; type: string; unit: string | null }[];
    const adherenceQuestion = questions.find((q) => q.key === "adherence_pct");
    if (adherenceQuestion) adherenceIsScale = adherenceQuestion.type === "scale";
    const seen = new Set<string>();
    for (const q of questions) {
      if (q.type === "photos") continue;
      const raw = values[q.key];
      if (raw == null || seen.has(q.key)) continue;
      seen.add(q.key);
      answers.push({ key: q.key, label: q.label, display: formatByType(raw, q.type, q.unit, q.key), raw });
    }
    const extra = Object.entries(values).filter(([key]) => !seen.has(key));
    if (extra.length > 0) {
      const metricByKey = new Map(resolveEffectiveMetrics(await getClientMetricSettings(clientId)).map((m) => [m.key, m]));
      for (const [key, raw] of extra) {
        const metric = metricByKey.get(key);
        answers.push(
          metric
            ? { key, label: metric.label, display: formatByType(raw, "number", metric.unit, key), raw }
            : { key, label: key, display: formatByType(raw, undefined, null, key), raw }
        );
      }
    }
  }

  return {
    weekNumber,
    checkin: inst
      ? {
          id: inst.id,
          status: inst.status,
          periodStart: inst.period_start,
          periodEnd: inst.period_end,
          submittedAt: inst.submitted_at,
          reviewOpenedAt: inst.review_opened_at,
          reviewedAt: inst.reviewed_at,
        }
      : null,
    answers,
    adherenceIsScale,
    goals: ((goalsRes.data ?? []) as EvaluationGoal[]).map((g) => ({ ...g, target_value: Number(g.target_value) })),
    orientation,
    sessionsDone: sessionsRes.error ? null : (sessionsRes.count ?? 0),
  };
}
