import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeWeekInfo } from "@/lib/checkin-week";
import { getStudentEvolution } from "@/lib/evolution";
import { getWeekComparisonData } from "@/lib/week-comparison";
import { listClientPhotos, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import type { EvolutionData } from "@/lib/evolution-format";
import type { ComparisonWeek } from "@/lib/week-comparison-format";
import { buildProgressSummary, type ProgressSummary } from "@/lib/progress-summary";

/**
 * Dados da área Progresso do aluno (`/portal/progresso`). SÓ leitura, SEMPRE com a sessão do aluno
 * (RLS ligado) — exceto a assinatura das URLs de foto dentro de `listClientPhotos` (que checa
 * antes que o aluno é o dono) e `orientations` (client admin, só enviadas e só colunas seguras —
 * o aluno não tem policy de leitura nessa tabela desde a 0004). Tabelas lidas e a policy que
 * libera: `metrics`/`goals`/`history_events`/`checkin_instances`/`photos` (`*_client_read`),
 * `client_metric_settings` (`client_metric_settings_client_read`).
 *
 * `orientations.coach_note` NUNCA é selecionado (a RLS é por linha; a coluna é só do coach).
 */

export type ProgressOrientation = {
  weekNumber: number;
  text: string;
  focus: string | null;
  sentAt: string | null;
};

export type ProgressGoal = {
  id: string;
  weekNumber: number;
  label: string;
  targetValue: number;
  unit: string | null;
  resultValue: number | null;
  resultStatus: "success" | "partial" | "fail" | "pending";
};

export type ProgressEvent = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  date: string;
};

export type ProgressCheckin = {
  weekNumber: number;
  status: string;
  submittedAt: string | null;
};

export type PortalProgress = {
  currentWeek: number | null;
  evolution: EvolutionData | null;
  /** Semanas que existem (check-in enviado, medida ou foto, mais a corrente), ascendente. */
  weeks: ComparisonWeek[];
  photos: CheckinPhoto[];
  orientations: ProgressOrientation[];
  goals: ProgressGoal[];
  events: ProgressEvent[];
  checkins: ProgressCheckin[];
  summary: ProgressSummary;
};

/** Tipos de `history_events` que o aluno vê como "mudança relevante" ("note" é anotação interna
 *  do coach e "checkin" repete a jornada — ficam de fora). */
const STUDENT_EVENT_TYPES = ["milestone", "goal_set", "goal_result"];

export async function loadPortalProgress(client: {
  id: string;
  start_date: string | null;
}): Promise<PortalProgress> {
  const supabase = await createClient();
  const currentWeek = client.start_date ? computeWeekInfo(client.start_date).weekNumber : null;

  const [evolution, weeks, photos, orientationsRes, goalsRes, eventsRes, checkinsRes] = await Promise.all([
    getStudentEvolution(client.id).catch((err) => {
      console.error("Progresso: evolução indisponível:", err);
      return null;
    }),
    currentWeek
      ? getWeekComparisonData(client, currentWeek).catch((err) => {
          console.error("Progresso: semanas indisponíveis:", err);
          return [] as ComparisonWeek[];
        })
      : Promise.resolve([] as ComparisonWeek[]),
    listClientPhotos(client.id).catch((err) => {
      console.error("Progresso: fotos indisponíveis:", err);
      return null;
    }),
    // Admin de propósito (mesmo padrão de `getMyLatestSentOrientation`): a policy de leitura do
    // aluno em `orientations` foi removida (0004) pra não expor `coach_note`/`author_id`. O
    // `client.id` vem da sessão (`requireClient`), nunca de input; só colunas seguras.
    createAdminClient()
      .from("orientations")
      .select("week_number, text, focus_override, sent_at")
      .eq("client_id", client.id)
      .eq("is_draft", false)
      .not("sent_at", "is", null)
      .order("week_number", { ascending: false }),
    supabase
      .from("goals")
      .select("id, week_number, label, target_value, unit, result_value, result_status")
      .eq("client_id", client.id)
      .order("week_number", { ascending: false }),
    supabase
      .from("history_events")
      .select("id, type, title, description, event_date")
      .eq("client_id", client.id)
      .in("type", STUDENT_EVENT_TYPES)
      .order("event_date", { ascending: false })
      .limit(20),
    supabase
      .from("checkin_instances")
      .select("week_number, status, submitted_at")
      .eq("client_id", client.id),
  ]);

  const orientations: ProgressOrientation[] = (orientationsRes.data ?? []).map((o) => ({
    weekNumber: o.week_number as number,
    text: o.text as string,
    focus: (o.focus_override as string | null) ?? null,
    sentAt: (o.sent_at as string | null) ?? null,
  }));

  const goals: ProgressGoal[] = (goalsRes.data ?? []).map((g) => ({
    id: g.id as string,
    weekNumber: g.week_number as number,
    label: g.label as string,
    targetValue: Number(g.target_value),
    unit: (g.unit as string | null) ?? null,
    resultValue: g.result_value == null ? null : Number(g.result_value),
    resultStatus: g.result_status as ProgressGoal["resultStatus"],
  }));

  const events: ProgressEvent[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id as string,
    type: e.type as string,
    title: e.title as string,
    description: (e.description as string | null) ?? null,
    date: e.event_date as string,
  }));

  const checkins: ProgressCheckin[] = (checkinsRes.data ?? []).map((c) => ({
    weekNumber: c.week_number as number,
    status: c.status as string,
    submittedAt: (c.submitted_at as string | null) ?? null,
  }));

  const summary = buildProgressSummary({
    evolution,
    checkins,
    goals,
    currentWeek,
  });

  return {
    currentWeek,
    evolution,
    weeks,
    photos: photos ?? [],
    orientations,
    goals,
    events,
    checkins,
    summary,
  };
}
