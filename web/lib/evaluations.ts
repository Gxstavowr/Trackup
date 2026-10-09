import "server-only";
import { cache } from "react";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayDateSP } from "@/lib/portal-today";
import { getClientMetricSettings, resolveEffectiveMetrics } from "@/lib/metrics-settings";
import {
  computeWeekInfo,
  createNotification,
  getClients,
  type CheckinInstance,
  type Client,
} from "@/lib/repository";

/**
 * AVALIAÇÃO (itens 7, 8 e 13 do master TODO, versão essencial) — o centro do ciclo do produto:
 * check-in do aluno -> avaliação do coach -> orientação -> próxima semana.
 *
 * Toda leitura/escrita do COACH aqui usa o client autenticado normal (RLS ligado): as policies
 * `clients_coach_full_access`, `checkin_instances_coach_access`, `orientations_by_client`,
 * `metrics_by_client`, `goals_by_client`, `history_events_by_client` e `checkin_questions_by_template`
 * já isolam por conta. O client ADMIN só aparece em `getMyLatestSentOrientation` (lado do ALUNO),
 * com a justificativa documentada lá.
 *
 * Não existe unique em `orientations(client_id, week_number)` na migration (só um índice comum) —
 * e não criamos migration nova —, então "uma linha por aluno+semana" é garantido aqui, na
 * aplicação (`upsertOrientation`), com auto-cura de duplicata por corrida.
 */

// ============================================================================
// Estado da avaliação (derivado de checkin_instances + orientations)
// ============================================================================

/**
 * Situação de UM aluno na avaliação corrente. Vocabulário de ciclo — nunca mistura com status
 * financeiro (pagamento é outro eixo, ver `status-badges.tsx`).
 *
 *  - `awaiting_checkin`: o aluno ainda não enviou o check-in (não há nada pro coach fazer).
 *  - `pending`: check-in enviado, o coach ainda não abriu a avaliação. -> "Avaliação pendente"
 *  - `in_progress`: coach abriu (`review_opened_at`), sem rascunho nem orientação. -> "Em avaliação"
 *  - `draft`: existe orientação salva como rascunho. -> "Orientação em rascunho"
 *  - `done`: orientação enviada, `status = 'reviewed'`. -> "Ciclo concluído"
 */
export type EvaluationState = "awaiting_checkin" | "pending" | "in_progress" | "draft" | "done";

/** Estados em que o COACH tem algo a fazer agora (alimenta fila e badge da navegação). */
export function isActionable(state: EvaluationState): boolean {
  return state === "pending" || state === "in_progress" || state === "draft";
}

export type EvaluationRow = {
  client: Pick<Client, "id" | "name" | "phone">;
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  state: EvaluationState;
  instanceId: string | null;
  submittedAt: string | null;
  reviewOpenedAt: string | null;
  reviewedAt: string | null;
  /** Só `awaiting_checkin`: o status da instância já foi marcado `late`. */
  late: boolean;
};

type OrientationKey = { client_id: string; week_number: number; is_draft: boolean; sent_at: string | null };

/**
 * Ordem de necessidade: quem exige ação do coach primeiro (o check-in que espera há mais
 * tempo no topo), depois quem aguarda o aluno (atrasados antes), por último os ciclos
 * concluídos. Desempate por nome pra a ordem ser estável entre renders.
 */
function sortRows(rows: EvaluationRow[]): EvaluationRow[] {
  const bucket = (r: EvaluationRow) =>
    isActionable(r.state) ? 0 : r.state === "awaiting_checkin" ? 1 : 2;
  return [...rows].sort((a, b) => {
    const diff = bucket(a) - bucket(b);
    if (diff !== 0) return diff;
    if (bucket(a) === 0) {
      const at = a.submittedAt ?? "";
      const bt = b.submittedAt ?? "";
      if (at !== bt) return at < bt ? -1 : 1;
    }
    if (bucket(a) === 1 && a.late !== b.late) return a.late ? -1 : 1;
    return a.client.name.localeCompare(b.client.name, "pt-BR");
  });
}

/**
 * Fila de avaliações: UMA linha por aluno ativo (convite aceito, acompanhamento ativo, com
 * `start_date`), derivada de `checkin_instances` + `orientations`. Só LÊ — nunca cria instância
 * (isso continua sendo do portal do aluno, `getCurrentCheckin`).
 *
 * Qual instância representa o aluno na linha:
 *  1. a MAIS ANTIGA com `status = 'submitted'` (enviada e ainda sem orientação enviada) — uma
 *     avaliação atrasada de semana passada não pode sumir só porque a semana virou;
 *  2. senão, a da semana corrente;
 *  3. senão (o aluno nem abriu o portal), uma linha "aguardando check-in" sintética.
 *
 * `cache()` do React: layout (badge) e páginas da mesma requisição pagam uma ida ao banco só.
 */
export const getEvaluationQueue = cache(async (): Promise<EvaluationRow[]> => {
  const supabase = await createSupabaseServerClient();
  const clients = await getClients(); // RLS: só a conta do coach

  const active = clients.filter(
    (c) => c.status === "active" && c.invite_status === "active" && c.start_date
  );
  if (active.length === 0) return [];

  const ids = active.map((c) => c.id);
  const todayStr = todayDateSP();

  const [submittedRes, windowRes] = await Promise.all([
    supabase.from("checkin_instances").select("*").in("client_id", ids).eq("status", "submitted"),
    supabase
      .from("checkin_instances")
      .select("*")
      .in("client_id", ids)
      .lte("period_start", todayStr)
      .gte("period_end", todayStr),
  ]);
  if (submittedRes.error) {
    throw new Error(`Não foi possível carregar as avaliações: ${submittedRes.error.message}`);
  }
  if (windowRes.error) {
    throw new Error(`Não foi possível carregar as avaliações: ${windowRes.error.message}`);
  }

  const submittedByClient = new Map<string, CheckinInstance[]>();
  for (const inst of (submittedRes.data ?? []) as CheckinInstance[]) {
    const list = submittedByClient.get(inst.client_id) ?? [];
    list.push(inst);
    submittedByClient.set(inst.client_id, list);
  }
  const windowByClientWeek = new Map<string, CheckinInstance>();
  for (const inst of (windowRes.data ?? []) as CheckinInstance[]) {
    windowByClientWeek.set(`${inst.client_id}:${inst.week_number}`, inst);
  }

  type Pick_ = { client: Client; instance: CheckinInstance | null; weekNumber: number; periodStart: string; periodEnd: string };
  const picked: Pick_[] = active.map((client) => {
    const current = computeWeekInfo(client.start_date as string);
    const oldestSubmitted = (submittedByClient.get(client.id) ?? []).sort(
      (a, b) => a.week_number - b.week_number
    )[0];
    if (oldestSubmitted) {
      return {
        client,
        instance: oldestSubmitted,
        weekNumber: oldestSubmitted.week_number,
        periodStart: oldestSubmitted.period_start,
        periodEnd: oldestSubmitted.period_end,
      };
    }
    const inWindow = windowByClientWeek.get(`${client.id}:${current.weekNumber}`) ?? null;
    return {
      client,
      instance: inWindow,
      weekNumber: current.weekNumber,
      periodStart: current.periodStart,
      periodEnd: current.periodEnd,
    };
  });

  // Orientações das semanas relevantes (rascunho ou enviada).
  const weeks = [...new Set(picked.map((p) => p.weekNumber))];
  const { data: orientationsData, error: orientationsError } = await supabase
    .from("orientations")
    .select("client_id, week_number, is_draft, sent_at")
    .in("client_id", ids)
    .in("week_number", weeks);
  if (orientationsError) {
    throw new Error(`Não foi possível carregar as orientações: ${orientationsError.message}`);
  }
  const orientationKeys = new Set(
    ((orientationsData ?? []) as OrientationKey[]).map((o) => `${o.client_id}:${o.week_number}`)
  );

  const rows: EvaluationRow[] = picked.map(({ client, instance, weekNumber, periodStart, periodEnd }) => {
    let state: EvaluationState;
    if (instance?.status === "reviewed") state = "done";
    else if (instance?.status === "submitted") {
      if (orientationKeys.has(`${client.id}:${weekNumber}`)) state = "draft";
      else if (instance.review_opened_at) state = "in_progress";
      else state = "pending";
    } else state = "awaiting_checkin";

    return {
      client: { id: client.id, name: client.name, phone: client.phone },
      weekNumber,
      periodStart,
      periodEnd,
      state,
      instanceId: instance?.id ?? null,
      submittedAt: instance?.submitted_at ?? null,
      reviewOpenedAt: instance?.review_opened_at ?? null,
      reviewedAt: instance?.reviewed_at ?? null,
      late: state === "awaiting_checkin" && instance?.status === "late",
    };
  });

  return sortRows(rows);
});

export type EvaluationCounts = {
  active: number;
  done: number;
  /** check-in enviado, coach ainda não abriu */
  pending: number;
  inProgress: number;
  /** rascunho de orientação salvo */
  draft: number;
  awaitingCheckin: number;
  /** pending + inProgress + draft — o que exige ação do coach. */
  actionable: number;
};

export function countEvaluations(rows: EvaluationRow[]): EvaluationCounts {
  const n = (s: EvaluationState) => rows.filter((r) => r.state === s).length;
  const pending = n("pending");
  const inProgress = n("in_progress");
  const draft = n("draft");
  return {
    active: rows.length,
    done: n("done"),
    pending,
    inProgress,
    draft,
    awaitingCheckin: n("awaiting_checkin"),
    actionable: pending + inProgress + draft,
  };
}

// ============================================================================
// Detalhe da avaliação de um aluno
// ============================================================================

export type EvaluationAnswer = { key: string; label: string; display: string };

export type OrientationRecord = {
  id: string;
  client_id: string;
  week_number: number;
  author_id: string | null;
  text: string;
  focus_override: string | null;
  coach_note: string | null;
  is_draft: boolean;
  created_at: string;
  sent_at: string | null;
};

export type EvaluationGoal = {
  id: string;
  label: string;
  target_value: number;
  unit: string | null;
  result_value: number | null;
  result_status: "success" | "partial" | "fail" | "pending";
};

export type ContextWeek = {
  weekNumber: number;
  weight: number | null;
  energy: number | null;
  /** Resposta `adherence_pct` do check-in da semana (escala 1–5 no template padrão). */
  adherence: number | null;
  /** Havia check-in enviado/avaliado nessa semana? */
  submitted: boolean;
};

export type EvaluationDetail = {
  row: EvaluationRow;
  answers: EvaluationAnswer[];
  weight: {
    current: number | null;
    previous: { value: number; weekNumber: number } | null;
    delta: number | null;
  };
  goals: EvaluationGoal[];
  context: ContextWeek[];
  /** `adherence_pct` é uma pergunta de escala (mostrar "X de 5") ou um número livre? */
  adherenceIsScale: boolean;
  orientation: OrientationRecord | null;
  previousOrientation: { weekNumber: number; text: string; sentAt: string | null } | null;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatAnswer(value: string, type: string | undefined, unit: string | null | undefined): string {
  if (type === "scale") return `${value} de 5`;
  if (type === "number" || type === "number+text") {
    const n = toNumber(value);
    if (n != null) return `${n.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
  }
  return value;
}

/**
 * Tudo que a tela de avaliação de UM aluno precisa. Devolve `null` se o aluno não está na fila
 * (inexistente, de outra conta — o RLS não devolve a linha —, convite não aceito ou pausado).
 * Isolamento: `getClients()` dentro de `getEvaluationQueue` é filtrado pelo RLS da conta do
 * coach; um `clientId` de outra conta simplesmente não aparece aqui.
 */
export async function getEvaluationDetail(clientId: string): Promise<EvaluationDetail | null> {
  const rows = await getEvaluationQueue();
  const queueRow = rows.find((r) => r.client.id === clientId);
  if (!queueRow) return null;
  let row: EvaluationRow = queueRow;

  const supabase = await createSupabaseServerClient();

  // Ciclo de uma semana ANTERIOR concluído agora há pouco: a fila troca o aluno pra semana
  // corrente ("aguardando check-in") assim que a orientação atrasada é enviada, e a tela da
  // avaliação perderia a confirmação. Se, nesta semana, foi fechado o ciclo de uma semana
  // anterior, mostramos esse ciclo como concluído — só aqui no detalhe; fila, contagens e
  // badge continuam derivados da fila, sem alteração.
  if (row.state === "awaiting_checkin") {
    const { data: closed, error: closedError } = await supabase
      .from("checkin_instances")
      .select("*")
      .eq("client_id", clientId)
      .eq("status", "reviewed")
      .lt("week_number", row.weekNumber)
      .gte("reviewed_at", `${row.periodStart}T00:00:00Z`)
      .order("week_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (closedError) {
      throw new Error(`Não foi possível carregar a avaliação: ${closedError.message}`);
    }
    if (closed) {
      const inst = closed as CheckinInstance;
      row = {
        ...row,
        weekNumber: inst.week_number,
        periodStart: inst.period_start,
        periodEnd: inst.period_end,
        state: "done",
        instanceId: inst.id,
        submittedAt: inst.submitted_at,
        reviewOpenedAt: inst.review_opened_at,
        reviewedAt: inst.reviewed_at,
        late: false,
      };
    }
  }
  const weekNumber = row.weekNumber;

  // Respostas + rótulos das perguntas.
  const answers: EvaluationAnswer[] = [];
  const answerValues: Record<string, string> = {};
  let adherenceIsScale = true; // template padrão: escala 1–5
  if (row.instanceId) {
    const { data: instanceRow } = await supabase
      .from("checkin_instances")
      .select("template_id")
      .eq("id", row.instanceId)
      .maybeSingle();

    const [answersRes, questionsRes] = await Promise.all([
      supabase.from("checkin_answers").select("question_key, value").eq("checkin_id", row.instanceId),
      instanceRow?.template_id
        ? supabase
            .from("checkin_questions")
            .select("key, label, type, unit, sort_order")
            .eq("template_id", instanceRow.template_id)
            .order("sort_order", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (answersRes.error) {
      throw new Error(`Não foi possível carregar as respostas: ${answersRes.error.message}`);
    }
    for (const a of (answersRes.data ?? []) as { question_key: string; value: string | null }[]) {
      if (a.value != null && a.value.trim() !== "") answerValues[a.question_key] = a.value;
    }
    const questions = (questionsRes.data ?? []) as {
      key: string;
      label: string;
      type: string;
      unit: string | null;
    }[];
    const adherenceQuestion = questions.find((q) => q.key === "adherence_pct");
    if (adherenceQuestion) adherenceIsScale = adherenceQuestion.type === "scale";
    const seen = new Set<string>();
    for (const q of questions) {
      if (q.type === "photos") continue; // fotos são de outra fatia (item 14)
      const raw = answerValues[q.key];
      if (raw == null) continue;
      seen.add(q.key);
      answers.push({ key: q.key, label: q.label, display: formatAnswer(raw, q.type, q.unit) });
    }
    // Respostas fora do template: métricas CUSTOM do aluno (perguntas sintéticas do check-in,
    // `applyMetricSettingsToQuestions`) ganham o rótulo/unidade configurados; pergunta que não
    // existe mais em lugar nenhum aparece com a chave, mas não some.
    const extra = Object.entries(answerValues).filter(([key]) => !seen.has(key));
    if (extra.length > 0) {
      const metricByKey = new Map(
        resolveEffectiveMetrics(await getClientMetricSettings(clientId)).map((m) => [m.key, m])
      );
      for (const [key, raw] of extra) {
        const metric = metricByKey.get(key);
        answers.push(
          metric
            ? { key, label: metric.label, display: formatAnswer(raw, "number", metric.unit) }
            : { key, label: key, display: raw }
        );
      }
    }
  }

  // Métricas: contexto das últimas 4 semanas + peso anterior.
  const firstContextWeek = Math.max(1, weekNumber - 3);
  const [metricsRes, prevWeightRes, goalsRes, orientationsRes, submittedRes] = await Promise.all([
    supabase
      .from("metrics")
      .select("week_number, key, value")
      .eq("client_id", clientId)
      .in("key", ["weight_kg", "energy"])
      .gte("week_number", firstContextWeek)
      .lte("week_number", weekNumber),
    supabase
      .from("metrics")
      .select("week_number, value")
      .eq("client_id", clientId)
      .eq("key", "weight_kg")
      .lt("week_number", weekNumber)
      .order("week_number", { ascending: false })
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
      .in("week_number", [weekNumber, weekNumber - 1])
      .order("created_at", { ascending: true }),
    supabase
      .from("checkin_instances")
      .select("id, week_number, status")
      .eq("client_id", clientId)
      .gte("week_number", firstContextWeek)
      .lte("week_number", weekNumber)
      .in("status", ["submitted", "reviewed"]),
  ]);
  for (const res of [metricsRes, prevWeightRes, goalsRes, orientationsRes, submittedRes]) {
    if (res.error) {
      throw new Error(`Não foi possível carregar o contexto da avaliação: ${res.error.message}`);
    }
  }

  // Aderência das últimas semanas: não vira `metrics` (a pergunta é uma escala, não um percentual),
  // então vem direto da resposta `adherence_pct` de cada check-in enviado.
  const submittedInstances = (submittedRes.data ?? []) as { id: string; week_number: number }[];
  const adherenceByWeek = new Map<number, number>();
  if (submittedInstances.length > 0) {
    const { data: adherenceRows, error: adherenceError } = await supabase
      .from("checkin_answers")
      .select("checkin_id, value")
      .eq("question_key", "adherence_pct")
      .in(
        "checkin_id",
        submittedInstances.map((i) => i.id)
      );
    if (adherenceError) {
      throw new Error(`Não foi possível carregar o contexto da avaliação: ${adherenceError.message}`);
    }
    const weekByInstance = new Map(submittedInstances.map((i) => [i.id, i.week_number]));
    for (const a of (adherenceRows ?? []) as { checkin_id: string; value: string | null }[]) {
      const v = toNumber(a.value);
      const w = weekByInstance.get(a.checkin_id);
      if (v != null && w != null) adherenceByWeek.set(w, v);
    }
  }

  const metricMap = new Map<string, number>();
  for (const m of (metricsRes.data ?? []) as { week_number: number; key: string; value: number | null }[]) {
    const v = toNumber(m.value);
    if (v != null) metricMap.set(`${m.week_number}:${m.key}`, v);
  }
  // Peso da semana avaliada: métrica gravada; se check-ins antigos não gravaram métrica,
  // cai na resposta `weight_kg` do check-in.
  const currentWeight = metricMap.get(`${weekNumber}:weight_kg`) ?? toNumber(answerValues["weight_kg"]);
  const prevRow = prevWeightRes.data as { week_number: number; value: number | null } | null;
  const previous =
    prevRow && toNumber(prevRow.value) != null
      ? { value: toNumber(prevRow.value) as number, weekNumber: prevRow.week_number }
      : null;

  const submittedWeeks = new Set(
    ((submittedRes.data ?? []) as { week_number: number }[]).map((s) => s.week_number)
  );
  const context: ContextWeek[] = [];
  for (let w = weekNumber; w >= firstContextWeek; w--) {
    context.push({
      weekNumber: w,
      weight: w === weekNumber ? currentWeight : (metricMap.get(`${w}:weight_kg`) ?? null),
      energy: metricMap.get(`${w}:energy`) ?? toNumber(w === weekNumber ? answerValues["energy"] : null),
      adherence:
        adherenceByWeek.get(w) ?? toNumber(w === weekNumber ? answerValues["adherence_pct"] : null),
      submitted: submittedWeeks.has(w),
    });
  }

  const orientationRows = (orientationsRes.data ?? []) as OrientationRecord[];
  const orientation = orientationRows.find((o) => o.week_number === weekNumber) ?? null;
  const prev = orientationRows.find(
    (o) => o.week_number === weekNumber - 1 && !o.is_draft && o.sent_at
  );

  return {
    row,
    answers,
    weight: {
      current: currentWeight,
      previous,
      delta: currentWeight != null && previous ? currentWeight - previous.value : null,
    },
    goals: ((goalsRes.data ?? []) as EvaluationGoal[]).map((g) => ({
      ...g,
      target_value: Number(g.target_value),
    })),
    context,
    adherenceIsScale,
    orientation,
    previousOrientation: prev
      ? { weekNumber: prev.week_number, text: prev.text, sentAt: prev.sent_at }
      : null,
  };
}

/**
 * Última orientação ENVIADA (não rascunho) do aluno, na visão do COACH — alimenta o Resumo do
 * aluno. Client autenticado (RLS `orientations_by_client`): outro coach nunca a enxerga.
 */
export async function getLastSentOrientation(
  clientId: string
): Promise<{ weekNumber: number; text: string; sentAt: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orientations")
    .select("week_number, text, sent_at")
    .eq("client_id", clientId)
    .eq("is_draft", false)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Não foi possível carregar a última orientação: ${error.message}`);
  }
  if (!data) return null;
  const row = data as { week_number: number; text: string; sent_at: string };
  return { weekNumber: row.week_number, text: row.text, sentAt: row.sent_at };
}

// ============================================================================
// Escrita (coach)
// ============================================================================

export const MAX_ORIENTATION_CHARS = 8000;
export const MAX_COACH_NOTE_CHARS = 4000;

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Coach autenticado + a linha da fila do aluno (RLS: outro coach nunca a enxerga).
 *
 * `expectedWeek` (só nas escritas de orientação): a semana que o coach TINHA NA TELA ao enviar. A
 * fila pode ter avançado (o envio da semana anterior, feito em outra aba ou já concluído, troca o
 * aluno pra próxima semana) e o texto escrito para uma semana nunca pode virar a orientação de
 * outra: se a semana da fila não bate com a da tela, nada é gravado.
 */
async function resolveEvaluationTarget(
  clientId: string,
  expectedWeek?: number
): Promise<{ supabase: ServerClient; userId: string; row: EvaluationRow }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão inválida — faça login novamente.");

  const { data: coach } = await supabase.from("coach_users").select("id").eq("id", user.id).maybeSingle();
  if (!coach) throw new Error("Apenas o coach pode avaliar check-ins.");

  const row = (await getEvaluationQueue()).find((r) => r.client.id === clientId);
  if (!row) throw new Error("Aluno não encontrado.");
  if (expectedWeek !== undefined && row.weekNumber !== expectedWeek) {
    throw new Error(
      `A avaliação deste aluno mudou para a semana ${row.weekNumber}. Recarregue a página antes de escrever ou enviar a orientação.`
    );
  }
  return { supabase, userId: user.id, row };
}

/**
 * Marca `review_opened_at` na primeira abertura da avaliação. Idempotente: o UPDATE só casa se
 * ainda estiver nulo e o check-in continuar `submitted` — abrir de novo não sobrescreve a data.
 */
export async function markReviewOpened(clientId: string): Promise<void> {
  const { supabase, row } = await resolveEvaluationTarget(clientId);
  if (!row.instanceId || row.state !== "pending") return;

  const { error } = await supabase
    .from("checkin_instances")
    .update({ review_opened_at: new Date().toISOString() })
    .eq("id", row.instanceId)
    .eq("client_id", clientId)
    .eq("status", "submitted")
    .is("review_opened_at", null);
  if (error) {
    throw new Error(`Não foi possível iniciar a avaliação: ${error.message}`);
  }
}

/**
 * Grava a orientação da semana garantindo UMA linha por (client_id, week_number): atualiza a
 * existente ou insere. Sem unique no banco, uma corrida (dois envios simultâneos) poderia
 * inserir duas — por isso, depois de inserir, relê e apaga as linhas extras (mantém a ENVIADA, se
 * houver, senão a mais antiga; os dois requests da corrida convergem pro mesmo resultado).
 *
 * Rascunho NUNCA rebaixa uma orientação já enviada: o UPDATE de rascunho só casa com linha que
 * ainda é rascunho (`is_draft = true`, condição avaliada no próprio banco). Assim, "Salvar
 * rascunho" numa aba e "Enviar" em outra quase ao mesmo tempo não desfaz o envio — quem chega
 * depois com o rascunho recebe "Esta orientação já foi enviada".
 */
async function upsertOrientation(
  supabase: ServerClient,
  input: {
    clientId: string;
    weekNumber: number;
    authorId: string;
    text: string;
    coachNote: string;
    isDraft: boolean;
  }
): Promise<OrientationRecord> {
  const fields = {
    author_id: input.authorId,
    text: input.text,
    coach_note: input.coachNote || null,
    is_draft: input.isDraft,
    sent_at: input.isDraft ? null : new Date().toISOString(),
  };

  const select = () =>
    supabase
      .from("orientations")
      .select("*")
      .eq("client_id", input.clientId)
      .eq("week_number", input.weekNumber)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

  const { data: existing, error: existingError } = await select();
  if (existingError) {
    throw new Error(`Não foi possível carregar a orientação: ${existingError.message}`);
  }

  const alreadySent = () => new Error("Esta orientação já foi enviada e não pode mais ser editada.");
  const existingRows = (existing ?? []) as OrientationRecord[];
  if (input.isDraft && existingRows.some((r) => !r.is_draft)) throw alreadySent();

  let writtenId: string;
  if (existingRows.length > 0) {
    writtenId = existingRows[0].id;
    let update = supabase.from("orientations").update(fields).eq("id", writtenId);
    if (input.isDraft) update = update.eq("is_draft", true);
    const { data: updated, error } = await update.select("id");
    if (error) throw new Error(`Não foi possível salvar a orientação: ${error.message}`);
    if (input.isDraft && (!updated || updated.length === 0)) throw alreadySent();
  } else {
    const { data: inserted, error } = await supabase
      .from("orientations")
      .insert({ client_id: input.clientId, week_number: input.weekNumber, ...fields })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`Não foi possível salvar a orientação: ${error?.message ?? "erro desconhecido"}`);
    }
    writtenId = (inserted as { id: string }).id;
  }

  // Auto-cura de duplicata (corrida entre dois requests): mantém a linha mais antiga e remove
  // o resto; se a que escrevemos era uma das removidas, reaplica os campos na que ficou.
  let keepId = writtenId;
  const { data: after } = await select();
  const rows = (after ?? []) as OrientationRecord[];
  if (rows.length > 1) {
    const keep = rows.find((r) => !r.is_draft) ?? rows[0];
    keepId = keep.id;
    const extras = rows.filter((r) => r.id !== keepId).map((r) => r.id);
    await supabase.from("orientations").delete().in("id", extras);
    if (keepId !== writtenId) {
      if (input.isDraft && !keep.is_draft) throw alreadySent();
      await supabase.from("orientations").update(fields).eq("id", keepId);
    }
  }

  const { data: final, error: finalError } = await supabase
    .from("orientations")
    .select("*")
    .eq("id", keepId)
    .single();
  if (finalError || !final) {
    throw new Error("Não foi possível confirmar a orientação salva.");
  }
  return final as OrientationRecord;
}

/** "Salvar rascunho": só faz sentido enquanto o check-in aguarda o coach (`submitted`). */
export async function saveOrientationDraft(
  clientId: string,
  input: { text: string; coachNote: string; expectedWeek?: number }
): Promise<{ weekNumber: number }> {
  const { supabase, userId, row } = await resolveEvaluationTarget(clientId, input.expectedWeek);
  if (row.state === "done") throw new Error("Esta avaliação já foi concluída.");
  if (row.state === "awaiting_checkin" || !row.instanceId) {
    throw new Error("O aluno ainda não enviou o check-in desta semana.");
  }
  await upsertOrientation(supabase, {
    clientId,
    weekNumber: row.weekNumber,
    authorId: userId,
    text: input.text,
    coachNote: input.coachNote,
    isDraft: true,
  });
  return { weekNumber: row.weekNumber };
}

/**
 * "Concluir e enviar orientação". Ordem pensada pra ser segura sem transação:
 *  1. grava a orientação como enviada (`is_draft=false`, `sent_at=now()`) — idempotente;
 *  2. UPDATE condicional do check-in `submitted -> reviewed` — só UMA chamada vence a corrida;
 *  3. só quem venceu (2) registra o evento no histórico e notifica o aluno — clique duplo ou
 *     reenvio não duplica evento nem notificação.
 * Evento e notificação são best-effort DEPOIS do estado principal gravado (mesmo padrão de
 * `submitCheckin`): falha neles é logada, nunca desfaz a orientação já enviada.
 */
export async function sendOrientation(
  clientId: string,
  input: { text: string; coachNote: string; expectedWeek?: number }
): Promise<{ alreadyDone: boolean; weekNumber: number }> {
  const { supabase, userId, row } = await resolveEvaluationTarget(clientId, input.expectedWeek);
  if (row.state === "done") return { alreadyDone: true, weekNumber: row.weekNumber };
  if (row.state === "awaiting_checkin" || !row.instanceId) {
    throw new Error("O aluno ainda não enviou o check-in desta semana.");
  }
  if (!input.text.trim()) {
    throw new Error("Escreva a orientação antes de enviar ao aluno.");
  }

  await upsertOrientation(supabase, {
    clientId,
    weekNumber: row.weekNumber,
    authorId: userId,
    text: input.text,
    coachNote: input.coachNote,
    isDraft: false,
  });

  const now = new Date().toISOString();
  const { data: won, error: reviewError } = await supabase
    .from("checkin_instances")
    .update({
      status: "reviewed",
      reviewed_at: now,
      // Se o coach nunca "abriu" (caso de borda), preserva a coerência do ciclo.
      ...(row.reviewOpenedAt ? {} : { review_opened_at: now }),
    })
    .eq("id", row.instanceId)
    .eq("client_id", clientId)
    .eq("status", "submitted")
    .select("id");
  if (reviewError) {
    throw new Error(`Não foi possível concluir a avaliação: ${reviewError.message}`);
  }
  if (!won || won.length === 0) return { alreadyDone: true, weekNumber: row.weekNumber };

  try {
    const { error } = await supabase.from("history_events").insert({
      client_id: clientId,
      type: "checkin",
      title: `Semana ${row.weekNumber} concluída — orientação enviada`,
      description: "O check-in foi avaliado pelo coach e a orientação da semana foi enviada.",
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Não foi possível registrar o evento de orientação enviada no histórico:", err);
  }

  try {
    await createNotification(clientId, {
      event_type: "orientation_ready",
      recipient: "client",
      message: `Seu coach avaliou seu check-in da semana ${row.weekNumber} e enviou a orientação.`,
    });
  } catch (err) {
    console.error("Não foi possível notificar o aluno sobre a orientação enviada:", err);
  }

  return { alreadyDone: false, weekNumber: row.weekNumber };
}

// ============================================================================
// Contagem pro badge da navegação
// ============================================================================

/**
 * Avaliações que aguardam ação do coach agora: check-in enviado sem orientação enviada
 * (pendente + em avaliação + rascunho) — a mesma definição da fila/página (um por aluno).
 * Falha de leitura não derruba o layout inteiro do coach por causa de um badge: registra e
 * devolve 0.
 */
export async function countPendingEvaluations(): Promise<number> {
  try {
    return countEvaluations(await getEvaluationQueue()).actionable;
  } catch (err) {
    console.error("Não foi possível contar as avaliações pendentes:", err);
    return 0;
  }
}

// ============================================================================
// Lado do ALUNO — orientação enviada (somente leitura)
// ============================================================================

export type SentOrientation = {
  weekNumber: number;
  text: string;
  focus: string | null;
  sentAt: string;
};

/**
 * Última orientação ENVIADA (`is_draft = false` e `sent_at` não nulo) pro aluno logado.
 *
 * Usa o client ADMIN de propósito (padrão aceito no projeto, mesma exceção já documentada em
 * `getTemplateWithQuestions`): a leitura direta de `orientations` pelo aluno não é um caminho
 * que o app deva depender — a policy atual (`orientations_by_client`, `can_access_client`) é
 * ampla demais e também exporia RASCUNHOS e a `coach_note` privada, que o aluno NUNCA deve ver.
 * Por isso a leitura acontece só no servidor, com garantias explícitas antes de tocar no admin:
 *  1. sessão validada por `auth.getUser()` (JWT conferido no Auth server);
 *  2. o `client_id` NÃO vem de parâmetro nenhum: é resolvido a partir da sessão
 *     (`clients.auth_user_id = user.id`, via client autenticado/RLS) — não há como pedir a
 *     orientação de outro aluno por aqui;
 *  3. a query filtra `client_id` desse aluno + `is_draft = false` + `sent_at is not null`, e
 *     seleciona só colunas seguras (nunca `coach_note`, `author_id`).
 * Devolve `null` se não há sessão de aluno ou se ainda não existe orientação enviada.
 */
export async function getMyLatestSentOrientation(): Promise<SentOrientation | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orientations")
    .select("week_number, text, focus_override, sent_at")
    .eq("client_id", (me as { id: string }).id)
    .eq("is_draft", false)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Não foi possível carregar a orientação: ${error.message}`);
  }
  if (!data) return null;

  const row = data as { week_number: number; text: string; focus_override: string | null; sent_at: string };
  return {
    weekNumber: row.week_number,
    text: row.text,
    focus: row.focus_override,
    sentAt: row.sent_at,
  };
}
