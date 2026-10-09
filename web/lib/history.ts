import "server-only";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getClient, type Client, type CheckinInstance, type CheckinInstanceStatus } from "@/lib/repository";

/**
 * HISTÓRICO LONGITUDINAL DO ALUNO (item 16 do master TODO) — visão do COACH da evolução da
 * relação ao longo das semanas/meses: check-ins, avaliações, orientações, metas e eventos
 * importantes, numa timeline agrupada por semana.
 *
 * Fontes de dado (todas por `client_id`, RLS `is_coach_of_client` — mesma isolação das outras
 * abas do aluno): `checkin_instances`, `orientations` (só enviadas — nunca rascunho, mesma regra
 * de `getLastSentOrientation`), `goals` e `history_events`. NENHUMA leitura toca em
 * `workout_plans`/`nutrition_plans` (planos ATUAIS, mutáveis) — a timeline não depende de dado
 * que desaparece quando o coach reescreve o plano de treino/nutrição; check-ins, orientações,
 * metas e eventos passados continuam intactos depois de qualquer edição do plano corrente.
 *
 * NUTRIÇÃO (`meal_logs`/`water_logs`, item 21): entram na timeline como um resumo por semana
 * (quantas refeições o aluno registrou e em quantos dias registrou água) — contagem simples de
 * atividade, não uma taxa de aderência (isso exigiria decidir o que "conta" como aderido, uma
 * regra de negócio nova; a contagem não julga, só mostra que o aluno usou a tela). Só aparece em
 * semanas que já existem na timeline por outro motivo (check-in, orientação, meta ou evento) —
 * registros de refeição/água fora de qualquer período de check-in não criam uma semana nova.
 *
 * LIMITAÇÃO CONHECIDA (metas): `goals` não tem uma tabela de histórico de alteração — cada linha
 * é a(s) meta(s) de UMA semana (client_id, week_number, metric_key), sem "editado em"/"valor
 * anterior". Não existe como saber a partir do schema QUANDO ou QUEM alterou uma meta dentro da
 * mesma semana (upsert por cima não deixa rastro). O que É possível, e é o que `deriveGoalChanges`
 * faz: comparar, para a MESMA `metric_key`, o `target_value` da semana atual com o da semana mais
 * recente anterior em que essa métrica também tinha meta — se o valor mudou, marca como "meta
 * alterada" (com o valor/semana anterior); a primeira semana em que uma métrica aparece é só
 * "meta definida" (não há "antes" pra comparar). Isso é um dado DERIVADO da granularidade
 * semanal que já existe, não um evento gravado — documentado aqui e na tela em vez de inventar
 * um "log de alteração" que o schema não guarda.
 */

// ============================================================================
// Tipos
// ============================================================================

export type TimelineGoal = {
  id: string;
  metricKey: string;
  label: string;
  targetValue: number;
  unit: string | null;
  resultValue: number | null;
  resultStatus: "success" | "partial" | "fail" | "pending";
  /** Meta derivada (ver limitação no cabeçalho do arquivo): não-nulo quando o valor-alvo mudou
   *  em relação à semana anterior mais recente com a mesma `metric_key`. */
  change: { previousTargetValue: number; previousWeekNumber: number } | null;
};

export type TimelineEventType = "join" | "checkin" | "goal_set" | "goal_result" | "note" | "milestone";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string | null;
  date: string;
};

/** Contagem simples de atividade de nutrição na semana (ver nota no cabeçalho do arquivo) —
 *  `null` quando não houve nenhum registro de refeição nem de água nesse período. */
export type TimelineNutrition = {
  mealLogsCount: number;
  waterLoggedDays: number;
};

export type TimelineWeek = {
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  checkin: { status: CheckinInstanceStatus; submittedAt: string | null } | null;
  evaluation: { reviewedAt: string; reviewOpenedAt: string | null } | null;
  orientation: { text: string; focus: string | null; sentAt: string } | null;
  goals: TimelineGoal[];
  events: TimelineEvent[];
  nutrition: TimelineNutrition | null;
};

export type StudentTimeline = {
  clientName: string;
  /** Mais recente primeiro. */
  weeks: TimelineWeek[];
  /** Eventos de `history_events` que não deu pra amarrar a nenhuma semana (ver `matchEventWeek`) —
   *  raro na prática (só acontece sem nenhum check-in ainda), mostrado à parte, mais recente primeiro. */
  unmatchedEvents: TimelineEvent[];
  /** Real (`clients.start_date`), não um evento de `history_events` — marca o início do
   *  acompanhamento no fim da timeline. `null` se o aluno ainda não tem `start_date`. */
  joinedAt: string | null;
};

// ============================================================================
// Internos
// ============================================================================

type GoalRow = {
  id: string;
  client_id: string;
  week_number: number;
  metric_key: string;
  label: string;
  target_value: number | string;
  unit: string | null;
  result_value: number | string | null;
  result_status: "success" | "partial" | "fail" | "pending";
  created_at: string;
};

type OrientationRow = {
  id: string;
  client_id: string;
  week_number: number;
  text: string;
  focus_override: string | null;
  sent_at: string;
};

type HistoryEventRow = {
  id: string;
  client_id: string;
  event_date: string;
  type: TimelineEventType;
  title: string;
  description: string | null;
};

/** Marcador interno de "refeição realizada" (ver `lib/repository.ts` `markMealRealized`) — nunca
 *  foi pensado pra aparecer no histórico do coach como um "evento importante" (é ruído: uma linha
 *  por refeição marcada, sem sinal nenhum sobre a relação coach-aluno). Filtrado aqui, não no
 *  banco (a tabela continua sendo o log bruto). */
function isMealMarkerNoise(row: HistoryEventRow): boolean {
  return row.type === "note" && (row.description ?? "").startsWith("MEAL_REALIZED:");
}

/** Deriva "meta alterada" comparando, por `metric_key`, o valor-alvo da semana com o da semana
 *  anterior mais recente que tinha essa métrica (ver limitação no cabeçalho do arquivo). */
function deriveGoalChanges(goalsByWeekAsc: [number, GoalRow[]][]): Map<string, TimelineGoal["change"]> {
  const lastSeen = new Map<string, { week: number; target: number }>(); // metric_key -> última meta vista
  const changeByGoalId = new Map<string, TimelineGoal["change"]>();

  for (const [week, goals] of goalsByWeekAsc) {
    for (const g of goals) {
      const target = Number(g.target_value);
      const prev = lastSeen.get(g.metric_key);
      if (prev && prev.target !== target) {
        changeByGoalId.set(g.id, { previousTargetValue: prev.target, previousWeekNumber: prev.week });
      } else {
        changeByGoalId.set(g.id, null);
      }
      lastSeen.set(g.metric_key, { week, target });
    }
  }
  return changeByGoalId;
}

/** Data (AAAA-MM-DD, UTC) de um timestamp — pra comparar com colunas `date` sem deslocar dia. */
function dateOnlyUtc(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Amarra um evento de `history_events` (só tem `event_date`, sem `week_number`) a uma semana:
 * 1) a data cai dentro de `[period_start, period_end]` de alguma instância;
 * 2) senão, pra eventos de avaliação concluída (`type === 'checkin'`, único tipo gravado hoje —
 *    `sendOrientation` em lib/evaluations.ts, no mesmo instante que `reviewed_at`), a instância
 *    `reviewed_at` mais próxima da data do evento (até 1 dia de diferença — cobre avaliação feita
 *    depois do fim do período);
 * 3) senão, `null` (evento fica em `unmatchedEvents`).
 */
/** Amarra uma data (`log_date`, coluna `date`, já `AAAA-MM-DD` local do aluno — ver
 *  `upsertMealLog`/`upsertWaterLog`) ao período `[period_start, period_end]` da instância de
 *  check-in em que ela cai. Sem o fallback por proximidade de `matchEventWeek`: um registro de
 *  refeição/água fora de qualquer período conhecido simplesmente não conta em nenhuma semana. */
function matchLogWeek(logDate: string, instances: CheckinInstance[]): number | null {
  const instance = instances.find((i) => i.period_start <= logDate && logDate <= i.period_end);
  return instance?.week_number ?? null;
}

/** Conta refeições e dias com água registrada por semana (só nas semanas que a instância de
 *  check-in já cobre — ver nota de escopo no cabeçalho do arquivo). */
function countNutritionByWeek(
  mealLogDates: string[],
  waterLogDates: string[],
  instances: CheckinInstance[]
): Map<number, TimelineNutrition> {
  const byWeek = new Map<number, TimelineNutrition>();
  const get = (week: number) => {
    const existing = byWeek.get(week);
    if (existing) return existing;
    const created = { mealLogsCount: 0, waterLoggedDays: 0 };
    byWeek.set(week, created);
    return created;
  };

  for (const date of mealLogDates) {
    const week = matchLogWeek(date, instances);
    if (week != null) get(week).mealLogsCount += 1;
  }
  for (const date of waterLogDates) {
    const week = matchLogWeek(date, instances);
    if (week != null) get(week).waterLoggedDays += 1;
  }
  return byWeek;
}

function matchEventWeek(event: HistoryEventRow, instances: CheckinInstance[]): number | null {
  const eventDay = dateOnlyUtc(event.event_date);
  const byPeriod = instances.find((i) => i.period_start <= eventDay && eventDay <= i.period_end);
  if (byPeriod) return byPeriod.week_number;

  if (event.type === "checkin") {
    const eventMs = new Date(event.event_date).getTime();
    let best: { week: number; diff: number } | null = null;
    for (const i of instances) {
      if (!i.reviewed_at) continue;
      const diff = Math.abs(new Date(i.reviewed_at).getTime() - eventMs);
      if (diff <= 86_400_000 && (!best || diff < best.diff)) best = { week: i.week_number, diff };
    }
    if (best) return best.week;
  }
  return null;
}

// ============================================================================
// Leitura
// ============================================================================

/**
 * Monta a timeline completa de UM aluno. Devolve `null` se o aluno não existe ou não pertence à
 * conta do coach autenticado (mesma checagem — RLS via `getClient` — das outras abas: quem chama
 * responde 404, sem distinguir os dois casos).
 */
export async function getStudentTimeline(clientId: string): Promise<StudentTimeline | null> {
  const client = await getClient(clientId);
  if (!client) return null;

  const supabase = await createSupabaseServerClient();

  const [checkinsRes, orientationsRes, goalsRes, eventsRes, mealLogsRes, waterLogsRes] = await Promise.all([
    supabase
      .from("checkin_instances")
      .select("*")
      .eq("client_id", clientId)
      .order("week_number", { ascending: true }),
    supabase
      .from("orientations")
      .select("id, client_id, week_number, text, focus_override, sent_at")
      .eq("client_id", clientId)
      .eq("is_draft", false)
      .not("sent_at", "is", null)
      .order("week_number", { ascending: true }),
    supabase
      .from("goals")
      .select("*")
      .eq("client_id", clientId)
      .order("week_number", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("history_events")
      .select("*")
      .eq("client_id", clientId)
      .order("event_date", { ascending: true }),
    supabase.from("meal_logs").select("log_date").eq("client_id", clientId),
    supabase.from("water_logs").select("log_date").eq("client_id", clientId),
  ]);
  for (const res of [checkinsRes, orientationsRes, goalsRes, eventsRes, mealLogsRes, waterLogsRes]) {
    if (res.error) {
      throw new Error(`Não foi possível carregar o histórico do aluno: ${res.error.message}`);
    }
  }

  const checkins = (checkinsRes.data ?? []) as CheckinInstance[];
  const orientations = (orientationsRes.data ?? []) as OrientationRow[];
  const goals = (goalsRes.data ?? []) as GoalRow[];
  const events = ((eventsRes.data ?? []) as HistoryEventRow[]).filter((e) => !isMealMarkerNoise(e));
  const nutritionByWeek = countNutritionByWeek(
    ((mealLogsRes.data ?? []) as { log_date: string }[]).map((r) => r.log_date),
    ((waterLogsRes.data ?? []) as { log_date: string }[]).map((r) => r.log_date),
    checkins
  );

  // Metas agrupadas por semana (ascendente, pra derivar mudança) e mapa de mudança por id.
  const goalsByWeekAsc = new Map<number, GoalRow[]>();
  for (const g of goals) goalsByWeekAsc.set(g.week_number, [...(goalsByWeekAsc.get(g.week_number) ?? []), g]);
  const changeByGoalId = deriveGoalChanges([...goalsByWeekAsc.entries()].sort((a, b) => a[0] - b[0]));

  // Eventos amarrados a semana vs. não-amarrados.
  const eventsByWeek = new Map<number, TimelineEvent[]>();
  const unmatchedEvents: TimelineEvent[] = [];
  for (const e of events) {
    const asTimelineEvent: TimelineEvent = {
      id: e.id,
      type: e.type,
      title: e.title,
      description: e.description,
      date: e.event_date,
    };
    const week = matchEventWeek(e, checkins);
    if (week == null) {
      unmatchedEvents.push(asTimelineEvent);
    } else {
      eventsByWeek.set(week, [...(eventsByWeek.get(week) ?? []), asTimelineEvent]);
    }
  }

  const orientationByWeek = new Map(orientations.map((o) => [o.week_number, o]));

  // União de todas as semanas com QUALQUER sinal (check-in, orientação, meta ou evento).
  const weekNumbers = new Set<number>([
    ...checkins.map((c) => c.week_number),
    ...orientations.map((o) => o.week_number),
    ...goalsByWeekAsc.keys(),
    ...eventsByWeek.keys(),
  ]);

  const weeks: TimelineWeek[] = [...weekNumbers]
    .sort((a, b) => b - a) // mais recente primeiro
    .map((weekNumber) => {
      const instance = checkins.find((c) => c.week_number === weekNumber) ?? null;
      const orientation = orientationByWeek.get(weekNumber) ?? null;
      const weekGoals = goalsByWeekAsc.get(weekNumber) ?? [];

      return {
        weekNumber,
        periodStart: instance?.period_start ?? "",
        periodEnd: instance?.period_end ?? "",
        checkin: instance ? { status: instance.status, submittedAt: instance.submitted_at } : null,
        evaluation:
          instance?.status === "reviewed" && instance.reviewed_at
            ? { reviewedAt: instance.reviewed_at, reviewOpenedAt: instance.review_opened_at }
            : null,
        orientation: orientation
          ? { text: orientation.text, focus: orientation.focus_override, sentAt: orientation.sent_at }
          : null,
        goals: weekGoals.map((g) => ({
          id: g.id,
          metricKey: g.metric_key,
          label: g.label,
          targetValue: Number(g.target_value),
          unit: g.unit,
          resultValue: g.result_value == null ? null : Number(g.result_value),
          resultStatus: g.result_status,
          change: changeByGoalId.get(g.id) ?? null,
        })),
        events: (eventsByWeek.get(weekNumber) ?? []).sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        nutrition: nutritionByWeek.get(weekNumber) ?? null,
      };
    });

  unmatchedEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    clientName: (client as Client).name,
    weeks,
    unmatchedEvents,
    joinedAt: (client as Client).start_date,
  };
}
