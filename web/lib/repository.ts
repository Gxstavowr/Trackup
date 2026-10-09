import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { MAX_TEXT_LENGTH, checkSubmission, commaToDot } from "@/lib/checkin-steps";
import { checkinSubmitGate, todayDateSP } from "@/lib/portal-today";
import { computeWeekInfo } from "@/lib/checkin-week";
import {
  applyMetricSettingsToQuestions,
  getEffectiveClientMetrics,
  trackedCustomMetricKeys,
} from "@/lib/metrics-settings";

/**
 * Camada de dados (ARCHITECTURE.md, seção "Camada de dados" — base do item 33 do TODO
 * master): todo acesso a dado do app real passa por aqui, nunca direto de um componente
 * de UI. Este arquivo cobre só a fatia inicial do item 4 — estrutura de alunos (`clients`).
 *
 * Decisão de padrão: cada função cria seu próprio client de servidor internamente
 * (`createSupabaseServerClient()` de `lib/supabase/server.ts`) em vez de recebê-lo como
 * parâmetro. Justificativa: essas funções só rodam em Server Components/Server Actions
 * (nunca em Client Components — o client de servidor depende de `cookies()`, que só
 * existe nesse contexto), então não há cenário real em que o chamador precise injetar um
 * client diferente; manter a assinatura sem esse parâmetro deixa os call sites mais
 * simples (`await getClients()` em vez de `await getClients(await createClient())`) sem
 * abrir mão de nada — `createClient()` já é barato (não faz round-trip de rede sozinho) e
 * o RLS continua sendo aplicado normalmente porque o client carrega a sessão do usuário
 * logado via cookies. NUNCA usar o client admin (service role) aqui — o isolamento por
 * `account_id` depende inteiramente do RLS das policies em `supabase/migrations/0001_init.sql`.
 */

export type ClientStatus = "active" | "paused";
export type InviteStatus = "pending" | "invited" | "active";

/** Espelha 1:1 as colunas da tabela `clients` (supabase/migrations/0001_init.sql). */
export type Client = {
  id: string;
  account_id: string;
  coach_id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  age: number | null;
  height_cm: number | null;
  objective: string | null;
  start_date: string | null;
  status: ClientStatus;
  color_key: string | null;
  invite_status: InviteStatus;
  invited_at: string | null;
  activated_at: string | null;
  created_at: string;
};

export type CreateClientInput = {
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  age?: number;
  heightCm?: number;
  objective?: string;
};

/**
 * Lista os alunos do coach autenticado. O RLS (`clients_coach_full_access`) já filtra
 * pelo `account_id` do coach logado — não precisa (e não deve) filtrar de novo aqui.
 */
export async function getClients(): Promise<Client[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Não foi possível carregar os alunos: ${error.message}`);
  }

  return (data ?? []) as Client[];
}

/**
 * Busca um aluno específico. Devolve `null` tanto quando não existe quanto quando existe
 * mas pertence a outra conta (o RLS simplesmente não devolve a linha nesse caso — do
 * ponto de vista de quem chama, os dois casos são indistinguíveis, e é assim que deve
 * ser: não vazar a existência de um aluno de outro coach).
 */
export async function getClient(id: string): Promise<Client | null> {
  // Id que não é UUID (ex.: /coach/alunos/123) faria o Postgres estourar "invalid input
  // syntax for type uuid" e virar 500; tratamos como aluno inexistente (-> 404 nas páginas).
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível carregar o aluno: ${error.message}`);
  }

  return (data as Client | null) ?? null;
}

/**
 * Cria um aluno vinculado ao coach autenticado.
 *
 * `account_id` é resolvido lendo `coach_users` pelo `auth.uid()` da sessão atual (não dá
 * pra chamar a função `private.current_account_id()` diretamente por aqui — ela vive no
 * schema `private`, que não é exposto pela API do PostgREST, de propósito). O insert em
 * si passa pelo client autenticado normal (não admin): a policy `clients_coach_full_access`
 * já cobre INSERT (`for all ... with check (account_id = private.current_account_id())`),
 * então o RLS garante que ninguém consiga criar um aluno numa conta que não é a própria.
 */
export async function createClient(input: CreateClientInput): Promise<Client> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão inválida — faça login novamente.");
  }

  const { data: coach, error: coachError } = await supabase
    .from("coach_users")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (coachError || !coach) {
    throw new Error("Perfil de coach não encontrado para o usuário atual.");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Nome do aluno é obrigatório.");
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      account_id: coach.account_id,
      coach_id: user.id,
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      gender: input.gender?.trim() || null,
      age: input.age ?? null,
      height_cm: input.heightCm ?? null,
      objective: input.objective?.trim() || null,
      invite_status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o aluno: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Client;
}

/**
 * Marca que o coach enviou (ou reenviou) o convite pro aluno — igual ao `sendInvite` do
 * protótipo (prototype/assets/js/data.js ~linha 1758): só atualiza o status/timestamp de
 * controle, não dispara e-mail nenhum (isso é o WhatsApp/e-mail automático do item 28/29,
 * fora de escopo aqui). O disparo real do magic link acontece quando o próprio ALUNO abre
 * `/convite?id=<uuid>` e clica em aceitar (`app/convite/actions.ts`).
 */
export async function sendInvite(clientId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("clients")
    .update({ invite_status: "invited", invited_at: new Date().toISOString() })
    .eq("id", clientId);

  if (error) {
    throw new Error(`Não foi possível marcar o convite como enviado: ${error.message}`);
  }
}

// ============================================================================
// CHECK-IN (próxima fatia do item 4 — fiação de dados ponta a ponta, sem a UX
// premium do item 25 nem a tela de revisão do item 13).
// ============================================================================

export type CheckinQuestionType =
  | "number"
  | "scale"
  | "boolean"
  | "select"
  | "text"
  | "photos"
  | "scale+text"
  | "number+text"
  | "stepper";

/** Espelha 1:1 as colunas de `checkin_templates`. */
export type CheckinTemplate = {
  id: string;
  account_id: string;
  name: string;
  created_at: string;
};

/** Espelha 1:1 as colunas de `checkin_questions`. */
export type CheckinQuestion = {
  id: string;
  template_id: string;
  key: string;
  label: string;
  type: CheckinQuestionType;
  unit: string | null;
  step: number;
  tracks: string | null;
  required: boolean;
  active: boolean;
  sort_order: number;
};

export type CheckinInstanceStatus = "pending" | "submitted" | "late" | "reviewed";

/** Espelha 1:1 as colunas de `checkin_instances`. */
export type CheckinInstance = {
  id: string;
  client_id: string;
  template_id: string | null;
  week_number: number;
  period_start: string;
  period_end: string;
  status: CheckinInstanceStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_opened_at: string | null;
  created_at: string;
};

/** Espelha 1:1 as colunas de `checkin_answers`. */
export type CheckinAnswer = {
  id: string;
  checkin_id: string;
  question_key: string;
  value: string | null;
};

/** Visão completa do check-in atual do aluno: instância + perguntas do template + respostas já dadas. */
export type CurrentCheckin = {
  instance: CheckinInstance;
  questions: CheckinQuestion[];
  answers: Record<string, string>;
};

/** Semana corrente do aluno — regra (segunda a domingo, calendário) em `lib/checkin-week.ts`. */
export { computeWeekInfo };

/**
 * Lê o template "ativo" de uma conta (o mais antigo criado — hoje só existe um, o "Padrão"
 * semeado no cadastro do coach, ver `app/(auth)/cadastro/actions.ts`) junto das perguntas
 * ativas, ordenadas.
 *
 * Usa o client ADMIN de propósito, e isso é uma exceção documentada ao padrão do resto
 * deste arquivo: as policies `checkin_templates_by_account` e `checkin_questions_by_template`
 * (supabase/migrations/0001_init.sql) só liberam leitura pra quem tem linha em `coach_users`
 * (via `private.current_account_id()`) — não existe nenhuma policy que deixe o PRÓPRIO ALUNO
 * ler o template/perguntas da conta do coach dele pra montar o formulário de check-in. Essa é
 * uma lacuna real de RLS que a migration original não previu (o aluno só tem policy de
 * leitura na própria linha de `clients` e, via `can_access_client`, nas linhas que já
 * referenciam o `client_id` dele — `checkin_templates`/`checkin_questions` não referenciam
 * `client_id`, só `account_id`/`template_id`). Corrigir isso direito seria uma nova policy de
 * SELECT — fora de escopo aqui (não crio migration nova). A mitigação é restringir o uso do
 * admin só a essa leitura pontual (nunca escreve nada com ele) e documentar o motivo, mesmo
 * padrão já usado em `app/auth/callback/route.ts` e no cadastro do coach.
 */
async function getTemplateWithQuestions(
  accountId: string
): Promise<{ template: CheckinTemplate; questions: CheckinQuestion[] } | null> {
  const admin = createAdminClient();

  const { data: template, error: templateError } = await admin
    .from("checkin_templates")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (templateError) {
    throw new Error(`Não foi possível carregar o modelo de check-in: ${templateError.message}`);
  }
  if (!template) return null;

  const { data: questions, error: questionsError } = await admin
    .from("checkin_questions")
    .select("*")
    .eq("template_id", template.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (questionsError) {
    throw new Error(`Não foi possível carregar as perguntas do check-in: ${questionsError.message}`);
  }

  return {
    template: template as CheckinTemplate,
    questions: (questions ?? []) as CheckinQuestion[],
  };
}

/**
 * Busca (ou cria, se ainda não existir) a instância de check-in pra `(client_id, week_number)`.
 * A constraint `unique(client_id, week_number)` da migration é quem garante a exclusividade —
 * aqui só se trata a corrida (duas chamadas quase simultâneas tentando criar a mesma semana):
 * se o insert falhar por violação de unicidade (código `23505`), reconsulta e devolve a linha
 * que a outra chamada já criou, em vez de propagar o erro.
 */
export async function getOrCreateCheckinInstance(
  clientId: string,
  weekNumber: number,
  periodStart: string,
  periodEnd: string,
  templateId: string | null
): Promise<CheckinInstance> {
  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("checkin_instances")
    .select("*")
    .eq("client_id", clientId)
    .eq("week_number", weekNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Não foi possível carregar o check-in: ${existingError.message}`);
  }
  if (existing) return existing as CheckinInstance;

  const { data: created, error: createError } = await supabase
    .from("checkin_instances")
    .insert({
      client_id: clientId,
      template_id: templateId,
      week_number: weekNumber,
      period_start: periodStart,
      period_end: periodEnd,
      status: "pending",
    })
    .select("*")
    .maybeSingle();

  if (createError) {
    if (createError.code === "23505") {
      const { data: raceExisting } = await supabase
        .from("checkin_instances")
        .select("*")
        .eq("client_id", clientId)
        .eq("week_number", weekNumber)
        .maybeSingle();
      if (raceExisting) return raceExisting as CheckinInstance;
    }
    throw new Error(`Não foi possível criar o check-in: ${createError.message}`);
  }
  if (!created) {
    throw new Error("Não foi possível criar o check-in.");
  }

  return created as CheckinInstance;
}

/**
 * Visão do ALUNO: pega (criando se preciso) a instância de check-in da semana atual do
 * cliente autenticado, junto das perguntas do template e das respostas já dadas (se houver).
 *
 * Devolve `null` em dois casos, ambos tratados pela UI com uma mensagem clara em vez de
 * quebrar: o `clientId` não resolve pra uma linha visível (RLS/inexistente) ou o aluno ainda
 * não tem `start_date` (dado inconsistente/antigo — sem isso não dá pra calcular semana
 * nenhuma, ver decisão sobre `app/auth/callback/route.ts` no relatório da tarefa).
 */
export async function getCurrentCheckin(clientId: string): Promise<CurrentCheckin | null> {
  const supabase = await createSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, account_id, start_date")
    .eq("id", clientId)
    .maybeSingle();

  if (clientError) {
    throw new Error(`Não foi possível carregar o aluno: ${clientError.message}`);
  }
  if (!client || !client.start_date) return null;

  const { weekNumber, periodStart, periodEnd } = computeWeekInfo(client.start_date);

  const templateData = await getTemplateWithQuestions(client.account_id);

  const instance = await getOrCreateCheckinInstance(
    clientId,
    weekNumber,
    periodStart,
    periodEnd,
    templateData?.template.id ?? null
  );

  const { data: answersData, error: answersError } = await supabase
    .from("checkin_answers")
    .select("*")
    .eq("checkin_id", instance.id);

  if (answersError) {
    throw new Error(`Não foi possível carregar as respostas do check-in: ${answersError.message}`);
  }

  const answers: Record<string, string> = {};
  for (const answer of (answersData ?? []) as CheckinAnswer[]) {
    if (answer.value != null) answers[answer.question_key] = answer.value;
  }

  // Item 17: métricas ocultadas/custom pelo COACH pra ESTE aluno (client_metric_settings, 0005)
  // — ver lib/metrics-settings.ts. Sem nenhuma configuração, devolve as perguntas do template
  // intactas (mesmo comportamento de sempre).
  const metrics = await getEffectiveClientMetrics(clientId);
  const questions = applyMetricSettingsToQuestions(
    templateData?.questions ?? [],
    metrics,
    templateData?.template.id ?? ""
  );

  return {
    instance,
    questions,
    answers,
  };
}

/**
 * Respostas de check-in cuja `key` também é uma chave de `metrics` (CHECK da migration) E cuja
 * semântica bate 1:1 com a métrica. `adherence_pct` fica de fora de propósito: no template
 * padrão essa pergunta é uma escala 1–5, não um percentual — gravar isso como `adherence_pct`
 * poluiria gráficos futuros com um valor de outra unidade.
 */
const METRIC_KEYS_FROM_ANSWERS = new Set([
  "weight_kg",
  "waist_cm",
  "hip_cm",
  "body_fat_pct",
  "workouts_count",
  "cardio_count",
  "water_l",
  "sleep_h",
  "energy",
  "hunger",
]);

async function recordMetricsFromAnswers(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clientId: string,
  weekNumber: number,
  answers: Record<string, string>,
  /** Chaves de métrica CUSTOM que este aluno tem acompanhadas agora (item 17) — além das 10 fixas. */
  extraKeys: Set<string> = new Set()
): Promise<void> {
  const rows = Object.entries(answers)
    .filter(([key]) => METRIC_KEYS_FROM_ANSWERS.has(key) || extraKeys.has(key))
    .map(([key, raw]) => ({ key, value: Number(String(raw).trim().replace(",", ".")) }))
    .filter(({ key, value }) => Number.isFinite(value) && (key !== "weight_kg" || value > 0))
    .map(({ key, value }) => ({ client_id: clientId, week_number: weekNumber, key, value }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from("metrics")
    .upsert(rows, { onConflict: "client_id,week_number,key" });
  if (error) throw new Error(error.message);
}

/**
 * Carrega o que as escritas do check-in precisam saber: status atual, dono e as perguntas ativas
 * do template da conta (mesma fonte do formulário — `getTemplateWithQuestions`). RLS: o aluno lê
 * a própria instância e a própria linha de `clients`.
 */
async function loadCheckinForWrite(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string
): Promise<{ status: CheckinInstanceStatus; questions: CheckinQuestion[]; customMetricKeys: Set<string> }> {
  const { data: current, error: currentError } = await supabase
    .from("checkin_instances")
    .select("status, client_id")
    .eq("id", checkinId)
    .maybeSingle();
  if (currentError) {
    throw new Error(`Não foi possível carregar o check-in: ${currentError.message}`);
  }
  if (!current) {
    throw new Error("Check-in não encontrado.");
  }
  const row = current as { status: CheckinInstanceStatus; client_id: string };

  const { data: client } = await supabase
    .from("clients")
    .select("account_id")
    .eq("id", row.client_id)
    .maybeSingle();
  const template = client
    ? await getTemplateWithQuestions((client as { account_id: string }).account_id)
    : null;

  // Item 17: mesma regra de getCurrentCheckin — as perguntas que o formulário viu são as que a
  // gravação (rascunho e envio) deve validar contra, senão uma métrica escondida ficaria
  // "obrigatória mas ausente" ou uma custom seria rejeitada como chave desconhecida.
  const metrics = await getEffectiveClientMetrics(row.client_id);
  const questions = applyMetricSettingsToQuestions(
    template?.questions ?? [],
    metrics,
    template?.template.id ?? ""
  );

  return { status: row.status, questions, customMetricKeys: trackedCustomMetricKeys(metrics) };
}

/**
 * Grava respostas: as preenchidas por upsert (checkin_id, question_key) e as que o aluno
 * ESVAZIOU por update -> `value = null` (só se já existiam, p.ex. vindas de um rascunho). Nunca
 * DELETE: as policies do aluno (0003) só liberam insert/update em `checkin_answers`, e só
 * enquanto o check-in está pending/late. O coach ignora valor nulo/vazio ao listar respostas.
 */
async function writeAnswers(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  checkinId: string,
  filled: Record<string, string>,
  clearedKeys: string[]
): Promise<void> {
  const rows = Object.entries(filled).map(([question_key, value]) => ({
    checkin_id: checkinId,
    question_key,
    value,
  }));
  if (rows.length > 0) {
    const { error } = await supabase
      .from("checkin_answers")
      .upsert(rows, { onConflict: "checkin_id,question_key" });
    if (error) throw new Error(`Não foi possível salvar as respostas: ${error.message}`);
  }
  if (clearedKeys.length > 0) {
    const { error } = await supabase
      .from("checkin_answers")
      .update({ value: null })
      .eq("checkin_id", checkinId)
      .in("question_key", clearedKeys);
    if (error) throw new Error(`Não foi possível salvar as respostas: ${error.message}`);
  }
}

/**
 * Rascunho do check-in (autosave): grava o que o aluno já preencheu em `checkin_answers`, com a
 * sessão dele, ENQUANTO o check-in está pending/late — é a mesma escrita que as policies da
 * 0003 já permitem, e é o que faz o rascunho aparecer em outro aparelho (`getCurrentCheckin`
 * lê essas linhas). Não grava métricas nem muda status: só o envio faz isso. Só chaves de
 * perguntas do template; valor cortado em `MAX_TEXT_LENGTH`; vírgula decimal vira ponto nos
 * campos numéricos. Fora da janela (sex–dom, SP) recusa, como o envio.
 */
export async function saveCheckinDraft(
  checkinId: string,
  answers: Record<string, string>,
  now: Date = new Date()
): Promise<void> {
  const gate = checkinSubmitGate(now);
  if (!gate.ok) throw new Error(gate.message);

  const supabase = await createSupabaseServerClient();
  const { status, questions } = await loadCheckinForWrite(supabase, checkinId);
  if (status !== "pending" && status !== "late") return; // já enviado/avaliado: nada a rascunhar

  const filled: Record<string, string> = {};
  const cleared: string[] = [];
  for (const question of questions) {
    if (question.type === "photos" || !(question.key in answers)) continue;
    let value = String(answers[question.key] ?? "").trim();
    if (question.type === "number") value = commaToDot(value);
    if (value === "") cleared.push(question.key);
    else filled[question.key] = value.slice(0, MAX_TEXT_LENGTH);
  }

  await writeAnswers(supabase, checkinId, filled, cleared);
}

/** Erro de validação de uma pergunta específica (o formulário leva o aluno até ela). */
export class CheckinFieldError extends Error {
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message);
    this.name = "CheckinFieldError";
  }
}

/**
 * Envia o check-in: valida (janela + respostas), grava as respostas, marca a instância como
 * enviada, grava as métricas e notifica o coach. Roda com o client normal (sessão do próprio
 * aluno) — `can_access_client` (0001) / as policies da 0003 cobrem "é o próprio aluno".
 *
 * Ordem deliberada — NADA é escrito antes de as recusas acontecerem:
 *   1. já enviado/avaliado -> no-op (clique duplo, ou reenvio de um `reviewed` que voltaria o
 *      status pra `submitted`; sem notificar o coach de novo);
 *   2. FORA DA JANELA (`checkinSubmitGate`, America/Sao_Paulo) -> erro, sem escrever;
 *   3. respostas inválidas/obrigatórias faltando (`checkSubmission`) -> erro, sem escrever;
 *   4. só então escreve: respostas, MÉTRICAS e por último o status. As métricas vão ANTES de
 *      virar `submitted` porque o banco (`private.client_can_write_metric`, migration 0015) só
 *      deixa o aluno gravar métrica com o check-in ainda aberto (pending/late) — depois de
 *      enviado, ele não reescreve mais o próprio peso/medidas. O `update` de status é condicional
 *      (pending/late): numa corrida de dois envios simultâneos só um "ganha" e só ele notifica
 *      (as métricas dos dois são o mesmo upsert, idempotente).
 */
export async function submitCheckin(
  checkinId: string,
  answers: Record<string, string>,
  now: Date = new Date()
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { status, questions, customMetricKeys } = await loadCheckinForWrite(supabase, checkinId);
  if (status === "submitted" || status === "reviewed") return;

  const gate = checkinSubmitGate(now);
  if (!gate.ok) throw new Error(gate.message);

  const checked = checkSubmission(questions, answers);
  if (!checked.ok) throw new CheckinFieldError(checked.message, checked.field);
  const clean = checked.answers;
  const cleared = questions
    .filter((q) => q.type !== "photos" && !(q.key in clean))
    .map((q) => q.key);

  await writeAnswers(supabase, checkinId, clean, cleared);

  // Best-effort: grava as métricas numéricas da semana (`metrics`) a partir das respostas —
  // é o que a avaliação do coach usa pra mostrar peso atual e variação vs. semana anterior.
  const { data: target } = await supabase
    .from("checkin_instances")
    .select("client_id, week_number")
    .eq("id", checkinId)
    .maybeSingle();
  if (target) {
    try {
      await recordMetricsFromAnswers(
        supabase,
        (target as { client_id: string }).client_id,
        (target as { week_number: number }).week_number,
        clean,
        customMetricKeys
      );
    } catch (err) {
      console.error("Não foi possível gravar as métricas do check-in:", err);
    }
  }

  const { data: instance, error: instanceError } = await supabase
    .from("checkin_instances")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", checkinId)
    .in("status", ["pending", "late"])
    .select("client_id, week_number")
    .maybeSingle();

  if (instanceError) {
    throw new Error(`Não foi possível enviar o check-in: ${instanceError.message}`);
  }
  if (!instance) return; // outro envio simultâneo já concluiu

  // Best-effort: notifica o coach (evento -> notificação real, seção NOTIFICAÇÕES no fim
  // deste arquivo). Roda com o client normal do próprio aluno — `can_access_client` cobre
  // esse `client_id`, não precisa de admin. Nunca deve quebrar o envio do check-in em si,
  // mesmo padrão de best-effort já usado no seed do template de check-in no cadastro do coach.
  try {
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", (instance as { client_id: string }).client_id)
      .maybeSingle();

    await createNotification((instance as { client_id: string }).client_id, {
      event_type: "checkin_received",
      recipient: "coach",
      message: `${(client as { name: string } | null)?.name ?? "Um aluno"} enviou o check-in da semana ${(instance as { week_number: number }).week_number}.`,
    });
  } catch (err) {
    console.error("Não foi possível criar a notificação de check-in recebido:", err);
  }
}

export type CheckinDisplayStatus = "none" | "pending" | "submitted" | "late" | "reviewed";

export type ClientWithCheckinStatus = Client & {
  checkin: {
    weekNumber: number | null;
    status: CheckinDisplayStatus;
    submittedAt: string | null;
  };
};

/**
 * Visão do COACH: mesma lista de `getClients()`, mas com o status do check-in da semana
 * atual de cada aluno anexado. Só faz sentido pra aluno já `invite_status = 'active'` (com
 * `start_date` setado) — pendente/convidado sempre volta `checkin.status = 'none'`, e a UI
 * (`app/coach/client-row.tsx`) nem mostra o badge nesse caso.
 *
 * Deliberadamente só LÊ `checkin_instances` (nunca cria uma aqui) — criar a instância da
 * semana é responsabilidade de `getCurrentCheckin`, disparada quando o próprio aluno abre o
 * portal; um aluno ativo sem instância ainda pra semana atual aparece como "pending" mesmo
 * assim (heurística: ausência de linha == check-in pendente), sem precisar de side-effect
 * numa tela que o coach só está lendo.
 *
 * "Atrasado" é simplificado (heurística, documentada no relatório): `period_end` já passou e
 * o status na linha ainda é `pending` — não precisa ser perfeito.
 */
export async function getClientsWithCheckinStatus(): Promise<ClientWithCheckinStatus[]> {
  const clients = await getClients();
  const supabase = await createSupabaseServerClient();

  const activeClientIds = clients
    .filter((c) => c.invite_status === "active" && c.start_date)
    .map((c) => c.id);

  const instancesByClient = new Map<string, CheckinInstance[]>();
  if (activeClientIds.length > 0) {
    const { data, error } = await supabase
      .from("checkin_instances")
      .select("*")
      .in("client_id", activeClientIds);

    if (error) {
      throw new Error(`Não foi possível carregar os check-ins: ${error.message}`);
    }

    for (const instance of (data ?? []) as CheckinInstance[]) {
      const list = instancesByClient.get(instance.client_id) ?? [];
      list.push(instance);
      instancesByClient.set(instance.client_id, list);
    }
  }

  const today = new Date();

  return clients.map((client) => {
    if (client.invite_status !== "active" || !client.start_date) {
      return { ...client, checkin: { weekNumber: null, status: "none" as const, submittedAt: null } };
    }

    const { weekNumber, periodEnd } = computeWeekInfo(client.start_date, today);
    const instance = (instancesByClient.get(client.id) ?? []).find(
      (i) => i.week_number === weekNumber
    );

    if (!instance) {
      return { ...client, checkin: { weekNumber, status: "pending" as const, submittedAt: null } };
    }

    let status: CheckinDisplayStatus = instance.status;
    if (status === "pending" && periodEnd < todayDateSP(today)) {
      status = "late";
    }

    return { ...client, checkin: { weekNumber, status, submittedAt: instance.submitted_at } };
  });
}

// ============================================================================
// TREINO (item 18 do master TODO — construtor completo: biblioteca com busca/filtros/
// exercício personalizado, dias com todos os campos de prescrição e blocos (aquecimento/
// cardio/superset/circuito), reordenação e duplicação (exercício/dia/plano), substituições,
// ciclo de vida rascunho -> publicado -> versão anterior, templates e histórico de
// alterações (`plan_change_logs`). Construído sobre `supabase/migrations/0003_*.sql` (colunas/
// tabelas) e `0007_training_builder.sql` (funções SQL de ciclo de vida/duplicação/
// reordenação, `security invoker` — o RLS de quem chama continua valendo). Ver
// `lib/workout-builder.ts` pras funções puras (filtro, agrupamento em blocos, validação,
// tradução de erro) usadas tanto aqui quanto pelos componentes de
// `app/coach/alunos/[id]/treino/*`.
// ============================================================================

import {
  insertIdAfter,
  translateTracklyError,
  type WorkoutBlockType,
  type WorkoutGroupKind,
} from "@/lib/workout-builder";
import { groupPreviousPerformance } from "@/lib/workout-session";

export type { WorkoutBlockType, WorkoutGroupKind };

/** Espelha 1:1 as colunas da tabela `exercises` (biblioteca por `account_id`, 0003/0007). */
export type Exercise = {
  id: string;
  account_id: string;
  name: string;
  category: string;
  instruction: string | null;
  video_url: string | null;
  muscle_group: string | null;
  equipment: string | null;
  is_custom: boolean;
  is_archived: boolean;
};

export type CreateExerciseInput = {
  name: string;
  category: string;
  instruction?: string;
  video_url?: string;
  muscle_group?: string;
  equipment?: string;
};

export type UpdateExerciseInput = Partial<CreateExerciseInput>;

export type ExerciseFilters = {
  search?: string;
  category?: string;
  muscleGroup?: string;
  equipment?: string;
  includeArchived?: boolean;
};

/** Espelha 1:1 as colunas da tabela `workout_plans` (0001/0003/0007). `client_id`/`account_id`
 * são mutuamente exclusivos (CHECK `workout_plans_template_shape_check`): plano de aluno tem
 * `client_id` e `account_id` nulo; template tem `account_id` e `client_id` nulo. */
export type WorkoutPlan = {
  id: string;
  client_id: string | null;
  account_id: string | null;
  name: string;
  description: string | null;
  is_draft: boolean;
  is_template: boolean;
  source_template_id: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
};

/** Espelha 1:1 as colunas da tabela `workout_days` (0001/0007: `notes`). */
export type WorkoutDay = {
  id: string;
  plan_id: string;
  name: string;
  duration_min: number | null;
  notes: string | null;
  sort_order: number;
};

/** Espelha 1:1 as colunas da tabela `workout_exercises` (0001/0003 — faixa de reps, carga
 * sugerida, cadência, bloco, superset/circuito, substituto, duração de cardio). */
export type WorkoutExercise = {
  id: string;
  day_id: string;
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  reps_min: number | null;
  reps_max: number | null;
  suggested_load: number | null;
  rest_sec: number | null;
  rir: number | null;
  tempo: string | null;
  block_type: WorkoutBlockType;
  group_kind: WorkoutGroupKind | null;
  group_key: string | null;
  substitute_exercise_id: string | null;
  duration_sec: number | null;
  notes: string | null;
  sort_order: number;
};

/** Entrada de "adicionar/editar exercício no dia" — todos os campos de prescrição são
 * opcionais (um bloco de cardio não usa sets/reps; um aquecimento pode não ter RIR). */
export type WorkoutExerciseInput = {
  sets?: number | null;
  reps?: number | null;
  reps_min?: number | null;
  reps_max?: number | null;
  suggested_load?: number | null;
  rest_sec?: number | null;
  rir?: number | null;
  tempo?: string | null;
  block_type?: WorkoutBlockType;
  group_kind?: WorkoutGroupKind | null;
  group_key?: string | null;
  substitute_exercise_id?: string | null;
  duration_sec?: number | null;
  notes?: string | null;
};

/** @deprecated use {@link WorkoutExerciseInput} — mantido só pelo nome já usado em call sites
 * existentes (mesmo shape, subconjunto de campos). */
export type AddExerciseToDayInput = WorkoutExerciseInput;

/** Espelha 1:1 as colunas da tabela `workout_logs`. */
export type WorkoutLog = {
  id: string;
  client_id: string;
  exercise_id: string;
  week_number: number;
  load: number | null;
  reps: number | null;
  completed_at: string;
};

export type LogWorkoutExerciseInput = {
  load?: number;
  reps?: number;
};

/** `workout_exercises` com o exercício da biblioteca (e o substituto, se houver) resolvidos. */
export type WorkoutExerciseWithDetails = WorkoutExercise & {
  exercise: Exercise;
  substitute: Exercise | null;
};

/** `workout_days` com os exercícios do dia, em ordem. */
export type WorkoutDayWithExercises = WorkoutDay & { exercises: WorkoutExerciseWithDetails[] };

/** `workout_plans` com os dias (e exercícios de cada dia) já aninhados, em ordem. */
export type WorkoutPlanWithDays = WorkoutPlan & { days: WorkoutDayWithExercises[] };

/** Visão do coach: rascunho (editável) + publicado ativo (referência/preview) + quantas
 * versões anteriores existem (arquivadas ao publicar por cima). */
export type WorkoutOverview = {
  draft: WorkoutPlanWithDays | null;
  published: WorkoutPlanWithDays | null;
  archivedCount: number;
};

/** Espelha 1:1 as colunas da tabela `plan_change_logs` (0007) — histórico de alterações,
 * append-only, compartilhado entre treino e nutrição (`plan_kind` diferencia). */
export type PlanChangeLog = {
  id: string;
  account_id: string;
  client_id: string | null;
  plan_kind: "workout" | "nutrition";
  plan_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: "created" | "updated" | "deleted" | "published" | "unpublished" | "template_applied";
  entity: string | null;
  entity_id: string | null;
  summary: string;
  changes: Record<string, unknown>;
  created_at: string;
};

type ServerSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Resolve o `account_id` do coach autenticado — mesma consulta a `coach_users` que
 * `createClient` já fazia inline; extraída aqui só porque as funções novas de treino
 * (`createExercise`) precisam do mesmo dado e não faz sentido duplicar a consulta de novo.
 * `createClient` (alunos) continua com a versão inline original, sem mexer nela.
 */
async function getCurrentCoachAccountId(supabase: ServerSupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão inválida — faça login novamente.");
  }

  const { data: coach, error } = await supabase
    .from("coach_users")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !coach) {
    throw new Error("Perfil de coach não encontrado para o usuário atual.");
  }

  return coach.account_id as string;
}

/**
 * Mesmo dado de `getCurrentCoachAccountId`, mais `id` (auth uid) e `name` — usado pra
 * assinar `plan_change_logs.actor_id`/`actor_name` (histórico de alterações do treino).
 */
async function getCurrentCoach(
  supabase: ServerSupabaseClient
): Promise<{ id: string; accountId: string; name: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sessão inválida — faça login novamente.");
  }

  const { data: coach, error } = await supabase
    .from("coach_users")
    .select("account_id, name")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !coach) {
    throw new Error("Perfil de coach não encontrado para o usuário atual.");
  }

  return { id: user.id, accountId: coach.account_id as string, name: (coach.name as string | null) ?? null };
}

type PlanChangeAction = PlanChangeLog["action"];

/**
 * Registra uma linha em `plan_change_logs` (histórico de alterações do treino, item 18).
 * Best-effort de propósito (mesmo padrão de `createNotification` em `publishWorkoutPlan`):
 * se o log falhar, a ação principal (que já foi commitada) não deve ser desfeita nem
 * reportada como erro pro coach — só logamos no console do servidor.
 */
async function recordWorkoutPlanChange(
  supabase: ServerSupabaseClient,
  params: {
    accountId: string;
    clientId: string | null;
    planId: string;
    actorId: string;
    actorName: string | null;
    action: PlanChangeAction;
    entity?: string;
    entityId?: string;
    summary: string;
    changes?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("plan_change_logs").insert({
    account_id: params.accountId,
    client_id: params.clientId,
    plan_kind: "workout",
    plan_id: params.planId,
    actor_id: params.actorId,
    actor_name: params.actorName,
    action: params.action,
    entity: params.entity ?? null,
    entity_id: params.entityId ?? null,
    summary: params.summary,
    changes: params.changes ?? {},
  });

  if (error) {
    console.error("Não foi possível registrar o histórico de alterações do treino:", error.message);
  }
}

/**
 * Lista a biblioteca de exercícios da conta do coach autenticado, com busca/filtros
 * opcionais (nome, categoria, grupo muscular, equipamento) — aplicados NO BANCO (não é uma
 * biblioteca pequena o suficiente pra sempre trazer tudo e filtrar em JS). `includeArchived`
 * (default false) esconde exercícios arquivados (`archiveExercise`); a linha continua
 * existindo (FK `workout_exercises.exercise_id` é `on delete restrict` — nunca dá pra apagar
 * de verdade um exercício em uso). RLS (`exercises_by_account`) já restringe à própria conta.
 */
export async function getExercises(filters: ExerciseFilters = {}): Promise<Exercise[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("exercises").select("*");

  if (!filters.includeArchived) {
    query = query.eq("is_archived", false);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.muscleGroup) {
    query = query.eq("muscle_group", filters.muscleGroup);
  }
  if (filters.equipment) {
    query = query.eq("equipment", filters.equipment);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os exercícios: ${error.message}`);
  }

  return (data ?? []) as Exercise[];
}

/** Cria um exercício PERSONALIZADO (`is_custom = true`) na biblioteca da conta do coach. */
export async function createExercise(input: CreateExerciseInput): Promise<Exercise> {
  const supabase = await createSupabaseServerClient();
  const accountId = await getCurrentCoachAccountId(supabase);

  const name = input.name.trim();
  const category = input.category.trim();
  if (!name) {
    throw new Error("Nome do exercício é obrigatório.");
  }
  if (!category) {
    throw new Error("Categoria do exercício é obrigatória.");
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      account_id: accountId,
      name,
      category,
      instruction: input.instruction?.trim() || null,
      video_url: input.video_url?.trim() || null,
      muscle_group: input.muscle_group?.trim() || null,
      equipment: input.equipment?.trim() || null,
      is_custom: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o exercício: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Exercise;
}

/** Edita metadado de um exercício da biblioteca (nome/categoria/instrução/vídeo/grupo/equipamento). */
export async function updateExercise(exerciseId: string, input: UpdateExerciseInput): Promise<Exercise> {
  const supabase = await createSupabaseServerClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Nome do exercício é obrigatório.");
    patch.name = name;
  }
  if (input.category !== undefined) {
    const category = input.category.trim();
    if (!category) throw new Error("Categoria do exercício é obrigatória.");
    patch.category = category;
  }
  if (input.instruction !== undefined) patch.instruction = input.instruction.trim() || null;
  if (input.video_url !== undefined) patch.video_url = input.video_url.trim() || null;
  if (input.muscle_group !== undefined) patch.muscle_group = input.muscle_group.trim() || null;
  if (input.equipment !== undefined) patch.equipment = input.equipment.trim() || null;

  const { data, error } = await supabase
    .from("exercises")
    .update(patch)
    .eq("id", exerciseId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível editar o exercício: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Exercise;
}

/** Arquiva um exercício (some da biblioteca por padrão, sem apagar — `workout_exercises`
 * que já o usam continuam válidos e o exibem normalmente). Reversível: `unarchiveExercise`. */
export async function archiveExercise(exerciseId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("exercises").update({ is_archived: true }).eq("id", exerciseId);
  if (error) {
    throw new Error(`Não foi possível arquivar o exercício: ${error.message}`);
  }
}

export async function unarchiveExercise(exerciseId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("exercises").update({ is_archived: false }).eq("id", exerciseId);
  if (error) {
    throw new Error(`Não foi possível reativar o exercício: ${error.message}`);
  }
}

/**
 * Lê as linhas de `exercises` para os ids dados, escolhendo o client certo conforme quem
 * está olhando.
 *
 * Pro COACH, o client normal já resolve: a policy `exercises_by_account` libera qualquer
 * exercício da própria conta.
 *
 * Pro ALUNO é uma exceção documentada, do MESMO tipo da já existente em
 * `getTemplateWithQuestions` (leia o comentário lá pro precedente completo): antes da
 * migration 0003 não havia nenhuma policy que deixasse o próprio aluno ler o nome/instrução/
 * vídeo dos exercícios do treino publicado dele. A 0003 fechou isso com a policy
 * `exercises_client_read` (restrita aos exercícios que aparecem em planos PUBLICADOS do
 * aluno, via `private.client_visible_exercise_ids()`) — o client ADMIN aqui continua sendo
 * usado só por simplicidade/uma via só de leitura (nunca escreve nada com o admin, nunca
 * expõe exercício de outra conta: os ids vêm sempre de `workout_exercises` já lidos com RLS
 * normal antes de chegar aqui), não porque falte RLS.
 */
async function getExercisesByIds(
  ids: string[],
  viewer: "coach" | "client",
  supabase: ServerSupabaseClient
): Promise<Map<string, Exercise>> {
  const map = new Map<string, Exercise>();
  if (ids.length === 0) return map;

  const client = viewer === "client" ? createAdminClient() : supabase;
  const { data, error } = await client.from("exercises").select("*").in("id", ids);

  if (error) {
    throw new Error(`Não foi possível carregar os exercícios do treino: ${error.message}`);
  }

  for (const exercise of (data ?? []) as Exercise[]) {
    map.set(exercise.id, exercise);
  }

  return map;
}

/**
 * Busca UM plano de treino (linha de `workout_plans`) por critério, junto dos dias e
 * exercícios de cada dia (e do exercício substituto de cada um), em ordem (`sort_order`).
 * Função interna compartilhada por `getWorkoutOverview` (rascunho/publicado do coach),
 * `getActiveWorkoutForClient` (visão do aluno) e `getWorkoutTemplates`; `viewer` decide como
 * resolver o join com `exercises` (ver `getExercisesByIds`).
 *
 * Monta o aninhamento com consultas separadas + merge em JS (mesmo padrão já usado em
 * `getClientsWithCheckinStatus`) em vez de embed aninhado de dois níveis do PostgREST —
 * mais previsível de ordenar (`sort_order` em cada nível) do que depender de `foreignTable`
 * aninhado no embed.
 */
async function hydrateWorkoutPlan(
  plan: WorkoutPlan,
  viewer: "coach" | "client",
  supabase: ServerSupabaseClient
): Promise<WorkoutPlanWithDays> {
  const { data: days, error: daysError } = await supabase
    .from("workout_days")
    .select("*")
    .eq("plan_id", plan.id)
    .order("sort_order", { ascending: true });

  if (daysError) {
    throw new Error(`Não foi possível carregar os dias do treino: ${daysError.message}`);
  }

  const dayList = (days ?? []) as WorkoutDay[];
  const dayIds = dayList.map((d) => d.id);

  let workoutExercises: WorkoutExercise[] = [];
  if (dayIds.length > 0) {
    const { data, error } = await supabase
      .from("workout_exercises")
      .select("*")
      .in("day_id", dayIds)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error(`Não foi possível carregar os exercícios do treino: ${error.message}`);
    }
    workoutExercises = (data ?? []) as WorkoutExercise[];
  }

  const exerciseIds = Array.from(
    new Set(
      workoutExercises.flatMap((we) => [we.exercise_id, we.substitute_exercise_id]).filter((id): id is string => !!id)
    )
  );
  const exercisesById = await getExercisesByIds(exerciseIds, viewer, supabase);

  const exercisesByDay = new Map<string, WorkoutExerciseWithDetails[]>();
  for (const we of workoutExercises) {
    const exercise = exercisesById.get(we.exercise_id);
    if (!exercise) continue; // não deveria acontecer — FK garante a linha, RLS já filtrou os ids.
    const substitute = we.substitute_exercise_id ? exercisesById.get(we.substitute_exercise_id) ?? null : null;
    const list = exercisesByDay.get(we.day_id) ?? [];
    list.push({ ...we, exercise, substitute });
    exercisesByDay.set(we.day_id, list);
  }

  return {
    ...plan,
    days: dayList.map((d) => ({ ...d, exercises: exercisesByDay.get(d.id) ?? [] })),
  };
}

async function getWorkoutPlanForClient(
  clientId: string,
  isDraft: boolean | null,
  viewer: "coach" | "client",
  options: { excludeArchived?: boolean } = {}
): Promise<WorkoutPlanWithDays | null> {
  const supabase = await createSupabaseServerClient();

  let planQuery = supabase
    .from("workout_plans")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_template", false);
  if (isDraft !== null) {
    planQuery = planQuery.eq("is_draft", isDraft);
  }
  if (options.excludeArchived) {
    planQuery = planQuery.is("archived_at", null);
  }

  const { data: plan, error: planError } = await planQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    throw new Error(`Não foi possível carregar o plano de treino: ${planError.message}`);
  }
  if (!plan) return null;

  return hydrateWorkoutPlan(plan as WorkoutPlan, viewer, supabase);
}

/**
 * Visão do COACH: o plano de treino do aluno (o mais recente, rascunho ou publicado), com
 * dias e exercícios aninhados. `null` se o aluno ainda não tem nenhum plano.
 *
 * @deprecated pro construtor completo (item 18), use {@link getWorkoutOverview} — que separa
 * rascunho (editável) de publicado (referência), em vez de "o mais recente dos dois" (que fica
 * ambíguo desde que um aluno pode ter as duas linhas ao mesmo tempo, ver 0007). Mantida por
 * compatibilidade — não há mais nenhum call site real no app.
 */
export async function getWorkoutPlan(clientId: string): Promise<WorkoutPlanWithDays | null> {
  return getWorkoutPlanForClient(clientId, null, "coach");
}

/**
 * Visão do ALUNO: o plano de treino PUBLICADO E ATIVO (`is_draft = false`, `archived_at`
 * nulo) mais recente do cliente autenticado, com dias e exercícios aninhados. `null` se o
 * coach ainda não publicou nada (mesmo que exista um rascunho em andamento — rascunho nunca
 * aparece pro aluno) OU se a única versão publicada já foi arquivada (substituída por uma
 * nova publicação). `excludeArchived` é reforço de aplicação: a policy RLS do aluno
 * (`workout_plans_client_read`, 0004) hoje só filtra `is_draft = false` — versões arquivadas
 * de planos já publicados continuam legíveis por RLS (documentado na 0007) — é o app quem
 * garante que só a versão ATIVA chega na tela do aluno.
 */
export async function getActiveWorkoutForClient(clientId: string): Promise<WorkoutPlanWithDays | null> {
  return getWorkoutPlanForClient(clientId, false, "client", { excludeArchived: true });
}

/**
 * Visão do COACH pro construtor: rascunho (editável, no máximo 1 por aluno — 0007) +
 * publicado ATIVO (referência/pré-visualização, no máximo 1) + quantas versões anteriores
 * existem (arquivadas cada vez que um novo rascunho é publicado por cima).
 */
export async function getWorkoutOverview(clientId: string): Promise<WorkoutOverview> {
  const supabase = await createSupabaseServerClient();

  const [draft, published, archivedCountResult] = await Promise.all([
    getWorkoutPlanForClient(clientId, true, "coach"),
    getWorkoutPlanForClient(clientId, false, "coach", { excludeArchived: true }),
    supabase
      .from("workout_plans")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("is_template", false)
      .not("archived_at", "is", null),
  ]);

  if (archivedCountResult.error) {
    throw new Error(`Não foi possível carregar o histórico de versões: ${archivedCountResult.error.message}`);
  }

  return { draft, published, archivedCount: archivedCountResult.count ?? 0 };
}

/** Templates de treino da conta do coach (`is_template = true`, sem aluno), com dias e
 * exercícios aninhados — pra pré-visualizar antes de aplicar a um aluno. */
export async function getWorkoutTemplates(): Promise<WorkoutPlanWithDays[]> {
  const supabase = await createSupabaseServerClient();
  const accountId = await getCurrentCoachAccountId(supabase);

  const { data, error } = await supabase
    .from("workout_plans")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_template", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os templates de treino: ${error.message}`);
  }

  const plans = (data ?? []) as WorkoutPlan[];
  return Promise.all(plans.map((plan) => hydrateWorkoutPlan(plan, "coach", supabase)));
}

/** Exclui um template (só o coach dono da conta consegue — RLS `workout_plans_template_by_account`). */
export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workout_plans")
    .delete()
    .eq("id", templateId)
    .eq("is_template", true);
  if (error) {
    throw new Error(`Não foi possível excluir o template: ${error.message}`);
  }
}

/**
 * Cria um RASCUNHO de treino pro aluno — vazio, ou copiado de um template/de outro plano
 * (`fromPlanId`) via a função SQL `duplicate_workout_plan` (0007, atômica: plano + dias +
 * exercícios numa transação só). Falha com mensagem amigável se o aluno já tiver um rascunho
 * (índice único `workout_plans_one_draft_per_client_uidx`, 0007) — o app deve oferecer
 * "descartar o rascunho atual" antes, nunca criar um segundo silenciosamente.
 */
export async function createWorkoutDraft(
  clientId: string,
  input: { name?: string; description?: string; fromPlanId?: string } = {}
): Promise<WorkoutPlan> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  if (input.fromPlanId) {
    const { data: newId, error } = await supabase.rpc("duplicate_workout_plan", {
      p_source_plan_id: input.fromPlanId,
      p_target_client_id: clientId,
      p_as_template: false,
      p_name: input.name?.trim() || null,
      p_description: input.description?.trim() || null,
    });

    if (error || !newId) {
      throw new Error(translateTracklyError(error?.message ?? "Não foi possível criar o rascunho."));
    }

    const { data: plan, error: fetchError } = await supabase
      .from("workout_plans")
      .select("*")
      .eq("id", newId as string)
      .single();
    if (fetchError || !plan) {
      throw new Error(`Rascunho criado, mas não foi possível recarregá-lo: ${fetchError?.message ?? ""}`);
    }

    await recordWorkoutPlanChange(supabase, {
      accountId: coach.accountId,
      clientId,
      planId: plan.id,
      actorId: coach.id,
      actorName: coach.name,
      action: "created",
      entity: "plan",
      entityId: plan.id,
      summary: `Criou o rascunho "${(plan as WorkoutPlan).name}" a partir de outro plano.`,
    });

    return plan as WorkoutPlan;
  }

  const { data: existing, error: existingError } = await supabase
    .from("workout_plans")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_draft", true)
    .eq("is_template", false)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Não foi possível verificar o rascunho atual: ${existingError.message}`);
  }
  if (existing) {
    throw new Error(translateTracklyError("trackly:draft_exists"));
  }

  const trimmedName = input.name?.trim() || "Treino";

  const { data, error } = await supabase
    .from("workout_plans")
    .insert({
      client_id: clientId,
      name: trimmedName,
      description: input.description?.trim() || null,
      is_draft: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o rascunho de treino: ${error?.message ?? "erro desconhecido"}`);
  }

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId,
    planId: data.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "plan",
    entityId: data.id,
    summary: `Criou o rascunho "${trimmedName}".`,
  });

  return data as WorkoutPlan;
}

/** Descarta o rascunho (delete — cascata apaga dias/exercícios dele). Só age sobre um
 * plano em rascunho; publicado/arquivado nunca é apagado por aqui. */
export async function discardWorkoutDraft(planId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("workout_plans")
    .select("client_id, name, is_draft")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Rascunho não encontrado: ${planError?.message ?? ""}`);
  }
  if (!(plan as { is_draft: boolean }).is_draft) {
    throw new Error("Só é possível descartar um rascunho — este plano já está publicado.");
  }

  const { error } = await supabase.from("workout_plans").delete().eq("id", planId);
  if (error) {
    throw new Error(`Não foi possível descartar o rascunho: ${error.message}`);
  }

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "deleted",
    entity: "plan",
    entityId: planId,
    summary: `Descartou o rascunho "${(plan as { name: string }).name}".`,
  });
}

/**
 * Duplica um plano inteiro (função SQL `duplicate_workout_plan`, 0007 — plano + dias +
 * exercícios, atômico): `asTemplate: true` salva como template da conta (reaproveitável em
 * qualquer aluno); `asTemplate: false` cria um RASCUNHO pro `targetClientId` (aplicar um
 * template a um aluno, ou duplicar o programa de um aluno pra outro — mesma função dos dois
 * lados, só muda o destino).
 */
export async function duplicateWorkoutPlan(input: {
  sourcePlanId: string;
  targetClientId?: string;
  asTemplate: boolean;
  name?: string;
  description?: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: source, error: sourceError } = await supabase
    .from("workout_plans")
    .select("name, is_template")
    .eq("id", input.sourcePlanId)
    .maybeSingle();
  if (sourceError || !source) {
    throw new Error(`Plano de origem não encontrado: ${sourceError?.message ?? ""}`);
  }

  const { data: newId, error } = await supabase.rpc("duplicate_workout_plan", {
    p_source_plan_id: input.sourcePlanId,
    p_target_client_id: input.targetClientId ?? null,
    p_as_template: input.asTemplate,
    p_name: input.name?.trim() || null,
    p_description: input.description?.trim() || null,
  });

  if (error || !newId) {
    throw new Error(translateTracklyError(error?.message ?? "Não foi possível duplicar o plano."));
  }

  const sourceName = (source as { name: string }).name;
  const wasTemplate = (source as { is_template: boolean }).is_template;
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: input.asTemplate ? null : (input.targetClientId ?? null),
    planId: newId as string,
    actorId: coach.id,
    actorName: coach.name,
    action: input.asTemplate ? "created" : wasTemplate ? "template_applied" : "created",
    entity: "plan",
    entityId: newId as string,
    summary: input.asTemplate
      ? `Salvou "${sourceName}" como template.`
      : wasTemplate
        ? `Aplicou o template "${sourceName}" (criou rascunho).`
        : `Duplicou o plano "${sourceName}".`,
  });

  return newId as string;
}

/**
 * Publica o rascunho (função SQL `publish_workout_plan`, 0007 — atômico: arquiva a versão
 * publicada anterior e ativa o rascunho na mesma transação). É isso que faz o treino
 * aparecer pro aluno em `getActiveWorkoutForClient`. Falha (mensagem traduzida) se o plano
 * não é rascunho, é template, ou não tem nenhum exercício ainda.
 */
export async function publishWorkoutPlan(planId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("workout_plans")
    .select("client_id, name")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Plano não encontrado: ${planError?.message ?? ""}`);
  }

  const { data: archivedPlanId, error } = await supabase.rpc("publish_workout_plan", { p_plan_id: planId });

  if (error) {
    throw new Error(translateTracklyError(error.message));
  }

  const clientId = (plan as { client_id: string | null }).client_id;
  const planName = (plan as { name: string }).name;

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "published",
    entity: "plan",
    entityId: planId,
    summary: archivedPlanId
      ? `Publicou "${planName}" (substituiu a versão anterior).`
      : `Publicou "${planName}".`,
  });

  // Best-effort: notifica o aluno (seção NOTIFICAÇÕES no fim deste arquivo). Roda com o
  // client normal do coach — `can_access_client`/`is_coach_of_client` cobre esse `client_id`
  // (mesma conta), não precisa de admin.
  if (clientId) {
    try {
      await createNotification(clientId, {
        event_type: "workout_updated",
        recipient: "client",
        message: "Seu treino foi atualizado.",
      });
    } catch (err) {
      console.error("Não foi possível criar a notificação de treino atualizado:", err);
    }
  }
}

/** Edita nome/duração/observações de um dia (rascunho ou template — nada impede editar um
 * publicado diretamente no banco, mas a UI só oferece isso pra rascunho/template). */
export async function updateWorkoutDay(
  dayId: string,
  input: { name?: string; duration_min?: number | null; notes?: string | null }
): Promise<WorkoutDay> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Nome do dia de treino é obrigatório.");
    patch.name = name;
  }
  if (input.duration_min !== undefined) patch.duration_min = input.duration_min;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("workout_days")
    .update(patch)
    .eq("id", dayId)
    .select("*, workout_plans!inner(client_id, id)")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível editar o dia de treino: ${error?.message ?? "erro desconhecido"}`);
  }

  const row = data as unknown as WorkoutDay & { workout_plans: { client_id: string | null; id: string } };
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_plans.client_id,
    planId: row.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "day",
    entityId: dayId,
    summary: `Editou o dia "${row.name}".`,
  });

  const { workout_plans: _plans, ...day } = row;
  void _plans;
  return day;
}

/** Remove um dia (cascata apaga os exercícios dele). */
export async function deleteWorkoutDay(dayId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: day, error: dayError } = await supabase
    .from("workout_days")
    .select("name, workout_plans!inner(client_id, id)")
    .eq("id", dayId)
    .single();
  if (dayError || !day) {
    throw new Error(`Dia de treino não encontrado: ${dayError?.message ?? ""}`);
  }

  const { error } = await supabase.from("workout_days").delete().eq("id", dayId);
  if (error) {
    throw new Error(`Não foi possível remover o dia de treino: ${error.message}`);
  }

  const row = day as unknown as { name: string; workout_plans: { client_id: string | null; id: string } };
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_plans.client_id,
    planId: row.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "deleted",
    entity: "day",
    entityId: dayId,
    summary: `Removeu o dia "${row.name}".`,
  });
}

/** Adiciona um dia ao plano, no fim da lista (`sort_order` = contagem atual de dias do plano). */
export async function addWorkoutDay(
  planId: string,
  input: { name: string; duration_min?: number | null; notes?: string | null }
): Promise<WorkoutDay> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Nome do dia de treino é obrigatório.");
  }

  const { data: plan, error: planError } = await supabase
    .from("workout_plans")
    .select("client_id")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    throw new Error(`Plano de treino não encontrado: ${planError?.message ?? ""}`);
  }

  const { count, error: countError } = await supabase
    .from("workout_days")
    .select("*", { count: "exact", head: true })
    .eq("plan_id", planId);

  if (countError) {
    throw new Error(`Não foi possível preparar o novo dia: ${countError.message}`);
  }

  const { data, error } = await supabase
    .from("workout_days")
    .insert({
      plan_id: planId,
      name: trimmedName,
      duration_min: input.duration_min ?? null,
      notes: input.notes?.trim() || null,
      sort_order: count ?? 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o dia de treino: ${error?.message ?? "erro desconhecido"}`);
  }

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "day",
    entityId: data.id,
    summary: `Adicionou o dia "${trimmedName}".`,
  });

  return data as WorkoutDay;
}

/** Duplica um dia (função SQL `duplicate_workout_day`, 0007 — dia + exercícios, atômico),
 * inserido logo depois do original na ordem do plano. */
export async function duplicateWorkoutDay(dayId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: day, error: dayError } = await supabase
    .from("workout_days")
    .select("name, workout_plans!inner(client_id, id)")
    .eq("id", dayId)
    .single();
  if (dayError || !day) {
    throw new Error(`Dia de treino não encontrado: ${dayError?.message ?? ""}`);
  }

  const { data: newId, error } = await supabase.rpc("duplicate_workout_day", { p_day_id: dayId });
  if (error || !newId) {
    throw new Error(translateTracklyError(error?.message ?? "Não foi possível duplicar o dia."));
  }

  const row = day as unknown as { name: string; workout_plans: { client_id: string | null; id: string } };
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_plans.client_id,
    planId: row.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "day",
    entityId: newId as string,
    summary: `Duplicou o dia "${row.name}".`,
  });

  return newId as string;
}

/** Aplica uma ordem completa de dias do plano (setas ↑/↓ na UI — ver `lib/workout-builder.ts`
 * `moveItem`/`idsInOrder` — chamam esta função com o array já reordenado). */
export async function reorderWorkoutDays(planId: string, orderedDayIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("workout_plans")
    .select("client_id, name")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    throw new Error(`Plano de treino não encontrado: ${planError?.message ?? ""}`);
  }

  const { error } = await supabase.rpc("reorder_workout_days", { p_plan_id: planId, p_ids: orderedDayIds });
  if (error) {
    throw new Error(translateTracklyError(error.message));
  }

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "plan",
    entityId: planId,
    summary: `Reordenou os dias de "${(plan as { name: string }).name}".`,
  });
}

/**
 * Adiciona um exercício da biblioteca a um dia, no fim da lista (`sort_order` = contagem
 * atual de exercícios do dia) — com todos os campos de prescrição (faixa de reps, carga
 * sugerida, cadência, bloco aquecimento/normal/cardio, superset/circuito, substituto).
 */
export async function addExerciseToDay(
  dayId: string,
  exerciseId: string,
  input: WorkoutExerciseInput
): Promise<WorkoutExercise> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const [dayResult, exerciseResult, countResult] = await Promise.all([
    supabase.from("workout_days").select("name, workout_plans!inner(client_id, id)").eq("id", dayId).single(),
    supabase.from("exercises").select("name").eq("id", exerciseId).single(),
    supabase.from("workout_exercises").select("*", { count: "exact", head: true }).eq("day_id", dayId),
  ]);

  if (dayResult.error || !dayResult.data) {
    throw new Error(`Dia de treino não encontrado: ${dayResult.error?.message ?? ""}`);
  }
  if (exerciseResult.error || !exerciseResult.data) {
    throw new Error(`Exercício não encontrado: ${exerciseResult.error?.message ?? ""}`);
  }
  if (countResult.error) {
    throw new Error(`Não foi possível preparar o exercício: ${countResult.error.message}`);
  }

  const { data, error } = await supabase
    .from("workout_exercises")
    .insert({
      day_id: dayId,
      exercise_id: exerciseId,
      sets: input.sets ?? null,
      reps: input.reps ?? null,
      reps_min: input.reps_min ?? null,
      reps_max: input.reps_max ?? null,
      suggested_load: input.suggested_load ?? null,
      rest_sec: input.rest_sec ?? null,
      rir: input.rir ?? null,
      tempo: input.tempo?.trim() || null,
      block_type: input.block_type ?? "normal",
      group_kind: input.group_kind ?? null,
      group_key: input.group_key?.trim() || null,
      substitute_exercise_id: input.substitute_exercise_id ?? null,
      duration_sec: input.duration_sec ?? null,
      notes: input.notes?.trim() || null,
      sort_order: countResult.count ?? 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível adicionar o exercício: ${error?.message ?? "erro desconhecido"}`);
  }

  const day = dayResult.data as unknown as { name: string; workout_plans: { client_id: string | null; id: string } };
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: day.workout_plans.client_id,
    planId: day.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "exercise",
    entityId: data.id,
    summary: `Adicionou "${(exerciseResult.data as { name: string }).name}" em "${day.name}".`,
  });

  return data as WorkoutExercise;
}

/** Edita a prescrição de um exercício já no dia (sets/reps/carga/descanso/RIR/cadência/
 * bloco/grupo/substituto/observações). `exercise_id` em si não é editável aqui — trocar o
 * exercício é remover e adicionar de novo (mantém o histórico de alterações honesto sobre o
 * que de fato mudou). */
export async function updateWorkoutExercise(
  workoutExerciseId: string,
  input: WorkoutExerciseInput
): Promise<WorkoutExercise> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: current, error: currentError } = await supabase
    .from("workout_exercises")
    .select("exercise_id, workout_days!inner(name, workout_plans!inner(client_id, id))")
    .eq("id", workoutExerciseId)
    .single();
  if (currentError || !current) {
    throw new Error(`Exercício do treino não encontrado: ${currentError?.message ?? ""}`);
  }

  const patch: Record<string, unknown> = {};
  if (input.sets !== undefined) patch.sets = input.sets;
  if (input.reps !== undefined) patch.reps = input.reps;
  if (input.reps_min !== undefined) patch.reps_min = input.reps_min;
  if (input.reps_max !== undefined) patch.reps_max = input.reps_max;
  if (input.suggested_load !== undefined) patch.suggested_load = input.suggested_load;
  if (input.rest_sec !== undefined) patch.rest_sec = input.rest_sec;
  if (input.rir !== undefined) patch.rir = input.rir;
  if (input.tempo !== undefined) patch.tempo = input.tempo?.trim() || null;
  if (input.block_type !== undefined) patch.block_type = input.block_type;
  if (input.group_kind !== undefined) patch.group_kind = input.group_kind;
  if (input.group_key !== undefined) patch.group_key = input.group_key?.trim() || null;
  if (input.substitute_exercise_id !== undefined) patch.substitute_exercise_id = input.substitute_exercise_id;
  if (input.duration_sec !== undefined) patch.duration_sec = input.duration_sec;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("workout_exercises")
    .update(patch)
    .eq("id", workoutExerciseId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível editar o exercício: ${error?.message ?? "erro desconhecido"}`);
  }

  type CurrentRow = {
    exercise_id: string;
    workout_days: { name: string; workout_plans: { client_id: string | null; id: string } };
  };
  const row = current as unknown as CurrentRow;
  const { data: exerciseRow } = await supabase.from("exercises").select("name").eq("id", row.exercise_id).maybeSingle();

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_days.workout_plans.client_id,
    planId: row.workout_days.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "exercise",
    entityId: workoutExerciseId,
    summary: `Editou "${(exerciseRow as { name: string } | null)?.name ?? "exercício"}" em "${row.workout_days.name}".`,
  });

  return data as WorkoutExercise;
}

/** Remove um exercício do dia. */
export async function deleteWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: current, error: currentError } = await supabase
    .from("workout_exercises")
    .select("exercise_id, workout_days!inner(name, workout_plans!inner(client_id, id))")
    .eq("id", workoutExerciseId)
    .single();
  if (currentError || !current) {
    throw new Error(`Exercício do treino não encontrado: ${currentError?.message ?? ""}`);
  }

  const { error } = await supabase.from("workout_exercises").delete().eq("id", workoutExerciseId);
  if (error) {
    throw new Error(`Não foi possível remover o exercício: ${error.message}`);
  }

  type CurrentRow = {
    exercise_id: string;
    workout_days: { name: string; workout_plans: { client_id: string | null; id: string } };
  };
  const row = current as unknown as CurrentRow;
  const { data: exerciseRow } = await supabase.from("exercises").select("name").eq("id", row.exercise_id).maybeSingle();

  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_days.workout_plans.client_id,
    planId: row.workout_days.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "deleted",
    entity: "exercise",
    entityId: workoutExerciseId,
    summary: `Removeu "${(exerciseRow as { name: string } | null)?.name ?? "exercício"}" de "${row.workout_days.name}".`,
  });
}

/**
 * Duplica um exercício-no-dia: insere uma cópia no fim da lista e reordena (função SQL
 * `reorder_workout_exercises`, 0007) pra ela ficar logo depois do original — composição de
 * duas chamadas em vez de uma função SQL nova só pra isso (a reordenação já resolve o
 * posicionamento de forma atômica o bastante: se a segunda chamada falhar, a cópia fica no
 * fim da lista em vez de ao lado do original — nunca perdida ou duplicada).
 */
export async function duplicateWorkoutExercise(workoutExerciseId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: source, error: sourceError } = await supabase
    .from("workout_exercises")
    .select("*, workout_days!inner(name, workout_plans!inner(client_id, id))")
    .eq("id", workoutExerciseId)
    .single();
  if (sourceError || !source) {
    throw new Error(`Exercício do treino não encontrado: ${sourceError?.message ?? ""}`);
  }

  type SourceRow = WorkoutExercise & {
    workout_days: { name: string; workout_plans: { client_id: string | null; id: string } };
  };
  const row = source as unknown as SourceRow;

  const { data: siblings, error: siblingsError } = await supabase
    .from("workout_exercises")
    .select("id, sort_order")
    .eq("day_id", row.day_id)
    .order("sort_order", { ascending: true });
  if (siblingsError) {
    throw new Error(`Não foi possível duplicar o exercício: ${siblingsError.message}`);
  }

  const { data: copy, error: copyError } = await supabase
    .from("workout_exercises")
    .insert({
      day_id: row.day_id,
      exercise_id: row.exercise_id,
      sets: row.sets,
      reps: row.reps,
      reps_min: row.reps_min,
      reps_max: row.reps_max,
      suggested_load: row.suggested_load,
      rest_sec: row.rest_sec,
      rir: row.rir,
      tempo: row.tempo,
      block_type: row.block_type,
      group_kind: row.group_kind,
      group_key: row.group_key,
      substitute_exercise_id: row.substitute_exercise_id,
      duration_sec: row.duration_sec,
      notes: row.notes,
      sort_order: (siblings ?? []).length,
    })
    .select("id")
    .single();
  if (copyError || !copy) {
    throw new Error(`Não foi possível duplicar o exercício: ${copyError?.message ?? "erro desconhecido"}`);
  }

  const orderedIds = insertIdAfter(
    (siblings ?? []).map((s) => (s as { id: string }).id),
    workoutExerciseId,
    copy.id as string
  );
  const { error: reorderError } = await supabase.rpc("reorder_workout_exercises", {
    p_day_id: row.day_id,
    p_ids: orderedIds,
  });
  if (reorderError) {
    // A cópia já existe (no fim da lista) — não desfaz o insert, só reporta que o
    // posicionamento ideal (logo após o original) não foi possível.
    console.error("Não foi possível posicionar a cópia após o original:", reorderError.message);
  }

  const { data: exerciseRow } = await supabase.from("exercises").select("name").eq("id", row.exercise_id).maybeSingle();
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_days.workout_plans.client_id,
    planId: row.workout_days.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "exercise",
    entityId: copy.id as string,
    summary: `Duplicou "${(exerciseRow as { name: string } | null)?.name ?? "exercício"}" em "${row.workout_days.name}".`,
  });

  return copy.id as string;
}

/** Aplica uma ordem completa de exercícios de um dia (setas ↑/↓ na UI). */
export async function reorderWorkoutExercises(dayId: string, orderedExerciseIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: day, error: dayError } = await supabase
    .from("workout_days")
    .select("name, workout_plans!inner(client_id, id)")
    .eq("id", dayId)
    .single();
  if (dayError || !day) {
    throw new Error(`Dia de treino não encontrado: ${dayError?.message ?? ""}`);
  }

  const { error } = await supabase.rpc("reorder_workout_exercises", { p_day_id: dayId, p_ids: orderedExerciseIds });
  if (error) {
    throw new Error(translateTracklyError(error.message));
  }

  const row = day as unknown as { name: string; workout_plans: { client_id: string | null; id: string } };
  await recordWorkoutPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.workout_plans.client_id,
    planId: row.workout_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "exercise",
    entityId: dayId,
    summary: `Reordenou os exercícios de "${row.name}".`,
  });
}

/** Histórico de alterações do treino OU nutrição (`plan_change_logs`, itens 18/20) de um
 * aluno, mais recentes primeiro — abrange todos os planos (rascunhos/publicados/arquivados)
 * dele, não só o atual, porque é auditoria (`plan_id` não tem FK de propósito — sobrevive à
 * exclusão). `planKind` default `"workout"` preserva o comportamento original pros call
 * sites de treino já existentes. */
export async function getPlanChangeLogs(
  clientId: string,
  planKind: "workout" | "nutrition" = "workout",
  limit = 30
): Promise<PlanChangeLog[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("plan_change_logs")
    .select("*")
    .eq("client_id", clientId)
    .eq("plan_kind", planKind)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Não foi possível carregar o histórico de alterações: ${error.message}`);
  }

  return (data ?? []) as PlanChangeLog[];
}

/**
 * Semana corrente (1-based) do aluno, mesma heurística de `computeWeekInfo` já usada pro
 * check-in — reaproveitada (não duplicada) via essa função exportada, mesmo padrão de
 * "wrapper exportado em cima de helper interno" já usado por `getCurrentCheckin` em cima de
 * `getTemplateWithQuestions`. `null` se o aluno ainda não tem `start_date` (mesmo edge case
 * documentado em `getCurrentCheckin`).
 */
export async function getCurrentWeekNumber(clientId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("start_date")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível carregar o aluno: ${error.message}`);
  }
  if (!client || !client.start_date) return null;

  return computeWeekInfo(client.start_date).weekNumber;
}

/**
 * Grava uma linha de execução em `workout_logs`. Não é upsert único de propósito — o mesmo
 * exercício pode ser executado mais de uma vez na mesma semana (plano com o mesmo exercício
 * em dias diferentes, por exemplo) e cada execução é um log próprio, não uma substituição do
 * anterior.
 *
 * Proteção simples contra clique duplo (o único cenário de duplicação que importa evitar
 * aqui, não duplicação legítima): se o último log deste aluno/exercício/semana tem os
 * MESMOS valores de carga/reps e foi gravado há menos de 10 segundos, a chamada é ignorada
 * em silêncio em vez de inserir de novo. Uma execução real e distinta (valores diferentes,
 * ou passado o intervalo) sempre grava normalmente.
 */
export async function logWorkoutExercise(
  clientId: string,
  exerciseId: string,
  weekNumber: number,
  input: LogWorkoutExerciseInput
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const load = input.load ?? null;
  const reps = input.reps ?? null;

  const { data: last, error: lastError } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("client_id", clientId)
    .eq("exercise_id", exerciseId)
    .eq("week_number", weekNumber)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    throw new Error(`Não foi possível verificar o histórico de execução: ${lastError.message}`);
  }

  if (last && (last as WorkoutLog).load === load && (last as WorkoutLog).reps === reps) {
    const elapsedMs = Date.now() - new Date((last as WorkoutLog).completed_at).getTime();
    if (elapsedMs < 10_000) return;
  }

  const { error } = await supabase.from("workout_logs").insert({
    client_id: clientId,
    exercise_id: exerciseId,
    week_number: weekNumber,
    load,
    reps,
  });

  if (error) {
    throw new Error(`Não foi possível registrar a execução: ${error.message}`);
  }
}

/**
 * Leitura simples pra Home do aluno (item 24): execuções (`workout_logs`) do aluno na semana
 * dada — só `exercise_id` + `completed_at`, o suficiente pra saber quais dias do plano já foram
 * feitos e se ele já treinou hoje. RLS (`workout_logs_by_client`) restringe ao próprio aluno.
 */
export async function getWorkoutLogsForWeek(
  clientId: string,
  weekNumber: number
): Promise<{ exercise_id: string; completed_at: string }[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_logs")
    .select("exercise_id, completed_at")
    .eq("client_id", clientId)
    .eq("week_number", weekNumber);

  if (error) {
    throw new Error(`Não foi possível carregar as execuções da semana: ${error.message}`);
  }

  return (data ?? []) as { exercise_id: string; completed_at: string }[];
}

/**
 * Leitura simples pra Home do aluno (item 24): primeiro e último peso registrados
 * (`metrics.key = 'weight_kg'`, gravado pelo check-in). `null` se ainda não há nenhum peso.
 */
export async function getWeightProgress(
  clientId: string
): Promise<{ first: number; latest: number; weeks: number } | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("metrics")
    .select("value, week_number")
    .eq("client_id", clientId)
    .eq("key", "weight_kg")
    .order("week_number", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar o peso: ${error.message}`);
  }

  const values = ((data ?? []) as { value: number | null }[])
    .map((row) => (row.value == null ? NaN : Number(row.value)))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (values.length === 0) return null;

  return { first: values[0], latest: values[values.length - 1], weeks: values.length };
}

// ============================================================================
// EXECUÇÃO DO TREINO PELO ALUNO (item 19 do master TODO — a outra metade do item 18: o
// aluno executa exatamente o que o coach construiu, sem perder blocos/superset/circuito/
// substituição). Construído só sobre o schema que a 0003 já criou (`workout_sessions` e as
// colunas novas de `workout_logs`: `session_id`/`workout_exercise_id`/`set_number`/
// `perceived_rir`/`student_note`) — NENHUMA migration nova precisou existir pra isso.
//
// `logWorkoutExercise`/`getWorkoutLogsForWeek` acima (item 18/24 — log simples por
// semana, sem série/sessão) continuam intactos e em uso pela Home do aluno
// (`app/portal/page.tsx`) e pelo mini-card "treino de hoje" — esta seção é um log PARALELO,
// por SÉRIE, não uma substituição: os dois tipos de linha convivem na mesma tabela
// `workout_logs` (as colunas novas são nuláveis; um log antigo nunca tem `session_id`).
//
// Funções puras (progresso da sessão, agrupamento de "desempenho anterior", timer de
// descanso, resumo) ficam em `lib/workout-session.ts`, mesma separação IO/lógica de
// `lib/workout-builder.ts` (item 18).
// ============================================================================

export type WorkoutSessionStatus = "in_progress" | "paused" | "completed";

/** Espelha 1:1 as colunas de `workout_sessions` (0003) — uma execução do aluno de um dia do
 * plano publicado, do início ao fim, com pausa e resumo (`summary`, jsonb livre — congela o
 * que aconteceu mesmo que o plano seja editado depois). */
export type WorkoutSession = {
  id: string;
  client_id: string;
  plan_id: string | null;
  day_id: string | null;
  week_number: number;
  status: WorkoutSessionStatus;
  started_at: string;
  paused_at: string | null;
  paused_total_sec: number;
  ended_at: string | null;
  summary: Record<string, unknown>;
  student_note: string | null;
  perceived_effort: number | null;
  created_at: string;
};

/**
 * Espelha 1:1 as colunas NOVAS de `workout_logs` usadas pela execução por série (0003):
 * `session_id`/`workout_exercise_id`/`set_number` amarram o log à sessão e à prescrição.
 * `exercise_id` aqui é o que o aluno de fato executou (o prescrito OU o substituto
 * autorizado — quem decide qual é `logWorkoutSet`, ver abaixo); `workout_exercise_id`
 * continua sendo sempre a prescrição ORIGINAL, é o que mantém "desempenho anterior"
 * comparável mesmo quando o aluno usa o substituto numa sessão e o original na outra.
 * Distinto de {@link WorkoutLog} (log simples por semana, sem série/sessão) — mesma tabela,
 * propósito diferente, nunca a mesma linha.
 */
export type WorkoutSetLog = {
  id: string;
  client_id: string;
  exercise_id: string;
  workout_exercise_id: string | null;
  session_id: string | null;
  set_number: number | null;
  week_number: number;
  load: number | null;
  reps: number | null;
  perceived_rir: number | null;
  student_note: string | null;
  completed_at: string;
};

export type LogWorkoutSetInput = {
  sessionId: string;
  clientId: string;
  workoutExerciseId: string;
  exerciseId: string;
  setNumber: number;
  weekNumber: number;
  load?: number | null;
  reps?: number | null;
  perceivedRir?: number | null;
  studentNote?: string | null;
};

export type CompleteWorkoutSessionInput = {
  studentNote?: string | null;
  perceivedEffort?: number | null;
  summary?: Record<string, unknown>;
};

/**
 * Sessão de treino ABERTA (`in_progress` ou `paused`) do aluno, se houver — no máximo uma por
 * vez por decisão de PRODUTO, não do banco (que não impede duas abertas): enquanto existir
 * uma aberta, a tela oferece retomar ou finalizar antes de começar outro dia. Simplifica a UX
 * (nunca duas barras de progresso concorrentes) sem precisar de constraint nova.
 */
export async function getOpenWorkoutSession(clientId: string): Promise<WorkoutSession | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("client_id", clientId)
    .in("status", ["in_progress", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível verificar a sessão de treino em andamento: ${error.message}`);
  }

  return data as WorkoutSession | null;
}

/**
 * Dia do treino (com exercícios já resolvidos, mesmo formato de `hydrateWorkoutPlan`) por
 * `day_id`, INDEPENDENTE do plano estar ativo ou já arquivado — necessário porque uma sessão
 * pode ter sido iniciada contra uma versão do plano que o coach já republicou (arquivou) nesse
 * meio-tempo; `getActiveWorkoutForClient` só devolve o plano ATIVO, então não serviria pra
 * retomar uma sessão presa a uma versão anterior. RLS (`workout_days_client_read`/
 * `workout_exercises_client_read`) continua exigindo `is_draft = false` — versão arquivada
 * publicada no passado permanece legível pelo aluno, rascunho nunca. `null` se o dia não
 * existir mais (ex.: coach apagou o dia) ou não pertencer a um plano que o aluno pode ler.
 */
export async function getWorkoutDayForSession(dayId: string): Promise<WorkoutDayWithExercises | null> {
  const supabase = await createSupabaseServerClient();

  const { data: day, error: dayError } = await supabase
    .from("workout_days")
    .select("*")
    .eq("id", dayId)
    .maybeSingle();

  if (dayError) {
    throw new Error(`Não foi possível carregar o dia de treino: ${dayError.message}`);
  }
  if (!day) return null;

  const { data, error } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("day_id", dayId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os exercícios do dia: ${error.message}`);
  }

  const workoutExercises = (data ?? []) as WorkoutExercise[];
  const exerciseIds = Array.from(
    new Set(
      workoutExercises.flatMap((we) => [we.exercise_id, we.substitute_exercise_id]).filter((id): id is string => !!id)
    )
  );
  const exercisesById = await getExercisesByIds(exerciseIds, "client", supabase);

  const exercises: WorkoutExerciseWithDetails[] = [];
  for (const we of workoutExercises) {
    const exercise = exercisesById.get(we.exercise_id);
    if (!exercise) continue; // não deveria acontecer — FK garante a linha, RLS já filtrou os ids.
    const substitute = we.substitute_exercise_id ? exercisesById.get(we.substitute_exercise_id) ?? null : null;
    exercises.push({ ...we, exercise, substitute });
  }

  return { ...(day as WorkoutDay), exercises };
}

/**
 * Inicia uma sessão nova. Não confere aqui se já existe uma aberta (quem decide isso é a
 * Server Action, chamando `getOpenWorkoutSession` antes) — mantém esta função simples; o pior
 * caso de dois cliques rápidos é duas sessões abertas, inofensivo (o aluno só vê/retoma a mais
 * recente em `getOpenWorkoutSession`). RLS (`workout_sessions_client_insert`) já garante que
 * `planId`/`dayId` pertencem a um plano PUBLICADO do próprio aluno.
 */
export async function startWorkoutSession(
  clientId: string,
  planId: string,
  dayId: string,
  weekNumber: number
): Promise<WorkoutSession> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_sessions")
    .insert({ client_id: clientId, plan_id: planId, day_id: dayId, week_number: weekNumber })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Não foi possível iniciar o treino: ${error.message}`);
  }

  return data as WorkoutSession;
}

/** Pausa a sessão (registra `paused_at`) — ignora silenciosamente se ela já não está mais
 * `in_progress` (clique duplo, ou já foi retomada/concluída em outra aba: `error` só reflete
 * falha real de escrita, 0 linhas afetadas não é erro aqui). */
export async function pauseWorkoutSession(sessionId: string, clientId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("workout_sessions")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("client_id", clientId)
    .eq("status", "in_progress");

  if (error) {
    throw new Error(`Não foi possível pausar o treino: ${error.message}`);
  }
}

/**
 * Retoma a sessão: soma o tempo desta pausa a `paused_total_sec` (lido antes de gravar — uma
 * pequena janela de corrida existe entre o SELECT e o UPDATE, aceitável aqui: o pior caso é
 * contar alguns segundos de pausa como treino, nunca um erro visível pro aluno) e limpa
 * `paused_at`. Sem linha `paused` encontrada (clique duplo) -> não faz nada, sem erro.
 */
export async function resumeWorkoutSession(sessionId: string, clientId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: current, error: readError } = await supabase
    .from("workout_sessions")
    .select("paused_at, paused_total_sec")
    .eq("id", sessionId)
    .eq("client_id", clientId)
    .eq("status", "paused")
    .maybeSingle();

  if (readError) {
    throw new Error(`Não foi possível retomar o treino: ${readError.message}`);
  }
  if (!current) return;

  const pausedAt = current.paused_at as string | null;
  const addedSec = pausedAt
    ? Math.max(0, Math.round((Date.now() - new Date(pausedAt).getTime()) / 1000))
    : 0;

  const { error } = await supabase
    .from("workout_sessions")
    .update({
      status: "in_progress",
      paused_at: null,
      paused_total_sec: (current.paused_total_sec as number) + addedSec,
    })
    .eq("id", sessionId)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Não foi possível retomar o treino: ${error.message}`);
  }
}

/**
 * Finaliza a sessão: grava `ended_at`, nota do aluno, esforço percebido (RPE 1–10, opcional)
 * e o resumo (`buildSessionSummary`, `lib/workout-session.ts`) como `summary` (jsonb livre —
 * histórico congelado, sobrevive a uma edição futura do plano). Idempotente: chamar de novo
 * numa sessão já `completed` só sobrescreve os mesmos campos, sem erro — protege contra
 * clique duplo em "Finalizar".
 */
export async function completeWorkoutSession(
  sessionId: string,
  clientId: string,
  input: CompleteWorkoutSessionInput
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  // `started_at` vem do relógio do BANCO (default now()) e `ended_at` do relógio do servidor do
  // app. Com o relógio do app atrasado, `ended_at` cairia antes de `started_at` e o CHECK
  // `ended_at >= started_at` da 0003 recusaria o treino — nunca grava antes do início.
  const { data: current } = await supabase
    .from("workout_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .eq("client_id", clientId)
    .maybeSingle();
  // +1 ms: o banco guarda microssegundos e o JS só milissegundos (truncaria pra antes do início).
  const startedMs = current?.started_at ? new Date(current.started_at as string).getTime() + 1 : 0;
  const endedAt = new Date(Math.max(Date.now(), startedMs)).toISOString();

  const { error } = await supabase
    .from("workout_sessions")
    .update({
      status: "completed",
      ended_at: endedAt,
      student_note: input.studentNote?.trim() || null,
      perceived_effort: input.perceivedEffort ?? null,
      summary: input.summary ?? {},
    })
    .eq("id", sessionId)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Não foi possível finalizar o treino: ${error.message}`);
  }
}

/**
 * Grava (ou substitui — upsert por `session_id` + `workout_exercise_id` + `set_number`, índice
 * único `workout_logs_session_exercise_set_uidx` da 0003, pra o aluno poder reabrir/corrigir a
 * mesma série sem duplicar linha) uma série concluída. `exerciseId` é o que foi de fato
 * executado (prescrito ou substituto autorizado — a UI decide qual manda aqui, ver
 * "substituição" na tela de execução); `workoutExerciseId` continua sendo sempre a prescrição
 * original.
 */
export async function logWorkoutSet(input: LogWorkoutSetInput): Promise<WorkoutSetLog> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_logs")
    .upsert(
      {
        client_id: input.clientId,
        exercise_id: input.exerciseId,
        workout_exercise_id: input.workoutExerciseId,
        session_id: input.sessionId,
        set_number: input.setNumber,
        week_number: input.weekNumber,
        load: input.load ?? null,
        reps: input.reps ?? null,
        perceived_rir: input.perceivedRir ?? null,
        student_note: input.studentNote?.trim() || null,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "session_id,workout_exercise_id,set_number" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Não foi possível registrar a série: ${error.message}`);
  }

  return data as WorkoutSetLog;
}

/** Séries já registradas NESTA sessão — pra retomar a execução (recarregar a página, ou voltar
 * depois de pausar) mostrando o que já foi marcado como feito. */
export async function getSessionSetLogs(sessionId: string, clientId: string): Promise<WorkoutSetLog[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("session_id", sessionId)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`Não foi possível carregar as séries desta sessão: ${error.message}`);
  }

  return (data ?? []) as WorkoutSetLog[];
}

/**
 * "Desempenho anterior": por `workout_exercise_id`, as séries da sessão mais recente ANTES da
 * atual (`excludeSessionId`) em que aquele exercício foi executado — carga/reps que aparecem
 * como referência ("última vez") na tela de execução; é também o dado bruto que alimenta a
 * evolução do exercício ao longo do tempo (cada sessão concluída é mais uma linha aqui).
 * Busca os logs (mais recente primeiro) e delega o agrupamento à função pura
 * `groupPreviousPerformance` (`lib/workout-session.ts`) — mesma separação IO/lógica de
 * `hydrateWorkoutPlan` + `groupDayExercises`.
 */
export async function getPreviousPerformance(
  clientId: string,
  workoutExerciseIds: string[],
  excludeSessionId?: string | null
): Promise<Map<string, WorkoutSetLog[]>> {
  if (workoutExerciseIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("client_id", clientId)
    .in("workout_exercise_id", workoutExerciseIds)
    .order("completed_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Não foi possível carregar o desempenho anterior: ${error.message}`);
  }

  return groupPreviousPerformance((data ?? []) as WorkoutSetLog[], excludeSessionId);
}

// ============================================================================
// NUTRIÇÃO (item 20 do master TODO — construtor completo: biblioteca com busca/filtro,
// refeições com dia da semana/horário/quantidade estruturada/macros, substituições
// equivalentes (por item via `meal_substitutions` e reaproveitáveis por conta via
// `food_equivalences`), duplicação (item/refeição/dia/plano), reordenação, ciclo de vida
// rascunho -> publicado -> versão anterior, templates de dieta, metas nutricionais
// (kcal/macros/água) e histórico de alterações (`plan_change_logs`, compartilhado com
// treino via `plan_kind`). Espelha a seção TREINO acima na FORMA (mesmo padrão de
// hydrate/overview/draft/publish/duplicate/reorder), construído sobre
// `supabase/migrations/0003_*.sql` (colunas/tabelas) e `0008_nutrition_builder.sql`
// (funções SQL de ciclo de vida/duplicação/reordenação, `security invoker`). Ver
// `lib/nutrition-builder.ts` pras funções puras (filtro, dia da semana, soma de macros,
// validação, tradução de erro) — de propósito SEM nenhum import de `lib/workout-builder.ts`.
//
// A EXECUÇÃO do aluno (item 21 — refeições de hoje, próxima refeição, aderência real via
// `meal_logs`, água via `water_logs`, foto opcional, dificuldade) fica no fim desta seção,
// depois de `getFoodEquivalencesForFoods`. Ver `lib/nutrition-session.ts` pras funções puras
// equivalentes (dia da semana de hoje, resumo do dia, progresso de água) — mesmo padrão de
// separação IO/lógica de `lib/workout-session.ts` (item 19).
// ============================================================================

import {
  translateTracklyError as translateNutritionTracklyError,
} from "@/lib/nutrition-builder";
import type { MealLogStatus } from "@/lib/nutrition-session";

/**
 * Espelha 1:1 as colunas da tabela `foods` (biblioteca por `account_id`, 0001/0003).
 * `macros` é o jsonb livre da migration: kcal/proteína/carboidrato/gordura, todos
 * opcionais — não é uma tabela de composição nutricional completa (por 100g, por porção
 * etc.), é o valor total pro `unit` declarado do alimento.
 */
export type FoodMacros = {
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type Food = {
  id: string;
  account_id: string;
  name: string;
  unit: string;
  category: string | null;
  is_archived: boolean;
  macros: FoodMacros;
};

export type CreateFoodInput = {
  name: string;
  unit?: string;
  category?: string;
  macros?: FoodMacros;
};

export type UpdateFoodInput = Partial<CreateFoodInput>;

export type FoodFilters = {
  search?: string;
  category?: string;
  includeArchived?: boolean;
};

/** Espelha 1:1 as colunas da tabela `nutrition_plans` (0001/0003/0008). `client_id`/
 * `account_id` são mutuamente exclusivos (CHECK `nutrition_plans_template_shape_check`):
 * plano de aluno tem `client_id` e `account_id` nulo; template tem `account_id` e
 * `client_id` nulo. Sem `created_at` na migration — `updated_at` é a coluna usada pra
 * "mais recente" (diferente de `workout_plans`, que tem `created_at`). */
export type NutritionPlan = {
  id: string;
  client_id: string | null;
  account_id: string | null;
  name: string;
  description: string | null;
  is_draft: boolean;
  is_template: boolean;
  source_template_id: string | null;
  target_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  target_water_ml: number | null;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
};

/** Espelha 1:1 as colunas da tabela `meals` (0001/0003). `time` é a coluna `time` do
 * Postgres, chega como string `"HH:MM:SS"` (ou `null` se não informado). `day_of_week`:
 * 1=segunda..7=domingo, `null` = todo dia (visualização diária, item 20). */
export type Meal = {
  id: string;
  plan_id: string;
  name: string;
  time: string | null;
  day_of_week: number | null;
  notes: string | null;
  sort_order: number;
};

/** Espelha 1:1 as colunas da tabela `meal_items` (0001/0003). `qty` (texto livre) e
 * `quantity`+`unit` (forma estruturada) convivem — o app grava os dois: `quantity`/`unit`
 * pro cálculo/edição estruturada, `qty` como rótulo pronto pra exibição (compatível com a
 * tela do aluno, que só lê `qty`). */
export type MealItem = {
  id: string;
  meal_id: string;
  food_id: string | null;
  qty: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  sort_order: number;
  macros: FoodMacros;
};

export type AddMealItemInput = {
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

export type UpdateMealItemInput = AddMealItemInput & { macros?: FoodMacros };

/** Espelha 1:1 as colunas da tabela `meal_substitutions` (0001/0003) — substituição
 * equivalente de UM item específico da refeição (alimento alternativo da biblioteca OU
 * rótulo livre, com quantidade/macros próprios). */
export type MealSubstitution = {
  id: string;
  meal_item_id: string;
  alternative_food_id: string | null;
  alternative_label: string | null;
  alternative_qty: string | null;
  macros: FoodMacros;
  note: string | null;
};

export type MealSubstitutionInput = {
  alternativeFoodId?: string | null;
  alternativeLabel?: string | null;
  alternativeQty?: string | null;
  note?: string | null;
};

export type MealSubstitutionWithFood = MealSubstitution & { alternative_food: Food | null };

/** `meal_items` com o alimento da biblioteca já resolvido (nome/unidade/macros da
 * biblioteca) — `null` se o alimento foi removido da biblioteca depois (`food_id` vira
 * `null` via `on delete set null`, o item continua existindo com o snapshot de `macros`
 * gravado nele) — e as substituições equivalentes cadastradas pra ele. */
export type MealItemWithFood = MealItem & { food: Food | null; substitutions: MealSubstitutionWithFood[] };

/** `meals` com os itens da refeição, em ordem (`meal_items.sort_order`, 0003). */
export type MealWithItems = Meal & { items: MealItemWithFood[] };

/** `nutrition_plans` com as refeições (e itens/substituições de cada uma) já aninhadas,
 * ordenadas por dia da semana (todo dia primeiro) e depois por `sort_order`. */
export type NutritionPlanWithMeals = NutritionPlan & { meals: MealWithItems[] };

/** Visão do coach: rascunho (editável) + publicado ATIVO (referência/pré-visualização) +
 * quantas versões anteriores existem (arquivadas ao publicar por cima) — mesmo desenho de
 * `WorkoutOverview`. */
export type NutritionOverview = {
  draft: NutritionPlanWithMeals | null;
  published: NutritionPlanWithMeals | null;
  archivedCount: number;
};

/** Espelha 1:1 as colunas da tabela `food_equivalences` (0003) — equivalências
 * reaproveitáveis por conta (ex.: "100g de arroz equivale a 120g de batata doce"),
 * diferente da substituição por item (`meal_substitutions`, pontual de uma refeição). */
export type FoodEquivalence = {
  id: string;
  account_id: string;
  food_id: string;
  equivalent_food_id: string;
  factor: number;
  note: string | null;
};

export type FoodEquivalenceWithFoods = FoodEquivalence & { food: Food | null; equivalent_food: Food | null };

/**
 * Registra uma linha em `plan_change_logs` (histórico de alterações da nutrição, item 20) —
 * gêmea de `recordWorkoutPlanChange`, só com `plan_kind: "nutrition"`. Best-effort de
 * propósito, mesma justificativa.
 */
async function recordNutritionPlanChange(
  supabase: ServerSupabaseClient,
  params: {
    accountId: string;
    clientId: string | null;
    planId: string;
    actorId: string;
    actorName: string | null;
    action: PlanChangeAction;
    entity?: string;
    entityId?: string;
    summary: string;
    changes?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("plan_change_logs").insert({
    account_id: params.accountId,
    client_id: params.clientId,
    plan_kind: "nutrition",
    plan_id: params.planId,
    actor_id: params.actorId,
    actor_name: params.actorName,
    action: params.action,
    entity: params.entity ?? null,
    entity_id: params.entityId ?? null,
    summary: params.summary,
    changes: params.changes ?? {},
  });

  if (error) {
    console.error("Não foi possível registrar o histórico de alterações da nutrição:", error.message);
  }
}

/**
 * Lista a biblioteca de alimentos da conta do coach autenticado, com busca/filtro
 * opcionais (nome, categoria) aplicados NO BANCO — mesmo padrão de `getExercises`.
 * `includeArchived` (default false) esconde alimentos arquivados. RLS (`foods_by_account`)
 * já filtra pelo `account_id` — não refiltra aqui.
 */
export async function getFoods(filters: FoodFilters = {}): Promise<Food[]> {
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("foods").select("*");

  if (!filters.includeArchived) {
    query = query.eq("is_archived", false);
  }
  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os alimentos: ${error.message}`);
  }

  return (data ?? []) as Food[];
}

/** Cria um alimento na biblioteca da conta do coach autenticado. */
export async function createFood(input: CreateFoodInput): Promise<Food> {
  const supabase = await createSupabaseServerClient();
  const accountId = await getCurrentCoachAccountId(supabase);

  const name = input.name.trim();
  if (!name) {
    throw new Error("Nome do alimento é obrigatório.");
  }

  const { data, error } = await supabase
    .from("foods")
    .insert({
      account_id: accountId,
      name,
      unit: input.unit?.trim() || "g",
      category: input.category?.trim() || null,
      macros: input.macros ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o alimento: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Food;
}

/** Edita metadado de um alimento da biblioteca (nome/unidade/categoria/macros). */
export async function updateFood(foodId: string, input: UpdateFoodInput): Promise<Food> {
  const supabase = await createSupabaseServerClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Nome do alimento é obrigatório.");
    patch.name = name;
  }
  if (input.unit !== undefined) patch.unit = input.unit.trim() || "g";
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.macros !== undefined) patch.macros = input.macros;

  const { data, error } = await supabase.from("foods").update(patch).eq("id", foodId).select("*").single();

  if (error || !data) {
    throw new Error(`Não foi possível editar o alimento: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Food;
}

/** Arquiva um alimento (some da biblioteca por padrão, sem apagar — `meal_items`/
 * `food_equivalences` que já o usam continuam válidos). Reversível: `unarchiveFood`. */
export async function archiveFood(foodId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("foods").update({ is_archived: true }).eq("id", foodId);
  if (error) {
    throw new Error(`Não foi possível arquivar o alimento: ${error.message}`);
  }
}

export async function unarchiveFood(foodId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("foods").update({ is_archived: false }).eq("id", foodId);
  if (error) {
    throw new Error(`Não foi possível reativar o alimento: ${error.message}`);
  }
}

/** Equivalências reaproveitáveis por conta (`food_equivalences`, item 20), com os dois
 * alimentos resolvidos — pra biblioteca "alimento X equivale a alimento Y". */
export async function getFoodEquivalences(): Promise<FoodEquivalenceWithFoods[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("food_equivalences").select("*").order("id", { ascending: true });
  if (error) {
    throw new Error(`Não foi possível carregar as equivalências: ${error.message}`);
  }

  const rows = (data ?? []) as FoodEquivalence[];
  const foodIds = Array.from(new Set(rows.flatMap((r) => [r.food_id, r.equivalent_food_id])));
  const foodsById = await getFoodsByIds(foodIds, "coach", supabase);

  return rows.map((r) => ({
    ...r,
    food: foodsById.get(r.food_id) ?? null,
    equivalent_food: foodsById.get(r.equivalent_food_id) ?? null,
  }));
}

/** Cria uma equivalência entre dois alimentos da biblioteca da conta. */
export async function createFoodEquivalence(input: {
  foodId: string;
  equivalentFoodId: string;
  factor?: number;
  note?: string;
}): Promise<FoodEquivalence> {
  const supabase = await createSupabaseServerClient();
  const accountId = await getCurrentCoachAccountId(supabase);

  if (!input.foodId || !input.equivalentFoodId) {
    throw new Error("Selecione os dois alimentos da equivalência.");
  }
  if (input.foodId === input.equivalentFoodId) {
    throw new Error("Um alimento não pode ser equivalente a ele mesmo.");
  }

  const { data, error } = await supabase
    .from("food_equivalences")
    .insert({
      account_id: accountId,
      food_id: input.foodId,
      equivalent_food_id: input.equivalentFoodId,
      factor: input.factor ?? 1,
      note: input.note?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar a equivalência: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as FoodEquivalence;
}

export async function deleteFoodEquivalence(equivalenceId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("food_equivalences").delete().eq("id", equivalenceId);
  if (error) {
    throw new Error(`Não foi possível excluir a equivalência: ${error.message}`);
  }
}

/**
 * Lê as linhas de `foods` para os ids dados, escolhendo o client certo conforme quem está
 * olhando — MESMA lacuna de RLS já documentada em `getExercisesByIds` acima (leia o
 * comentário lá pro precedente completo), agora encontrada em `foods`: a policy
 * `foods_by_account` só libera SELECT pra quem tem linha em `coach_users`, e `foods` só
 * referencia `account_id` (nunca `client_id`), então `private.can_access_client` não se
 * aplica — o próprio aluno não tem como ler o nome/unidade/macros dos alimentos do plano
 * de nutrição publicado dele. Corrigir direito seria uma nova policy de SELECT em `foods`
 * — fora de escopo aqui (não crio migration nova). Mesma mitigação: client ADMIN só pra
 * esse SELECT pontual, e só pelos ids que o aluno já teria acesso de qualquer forma (os
 * `food_id` dos `meal_items` do PRÓPRIO plano dele, já lidos com RLS normal antes de
 * chegar aqui).
 */
async function getFoodsByIds(
  ids: string[],
  viewer: "coach" | "client",
  supabase: ServerSupabaseClient
): Promise<Map<string, Food>> {
  const map = new Map<string, Food>();
  if (ids.length === 0) return map;

  const client = viewer === "client" ? createAdminClient() : supabase;
  const { data, error } = await client.from("foods").select("*").in("id", ids);

  if (error) {
    throw new Error(`Não foi possível carregar os alimentos do plano de nutrição: ${error.message}`);
  }

  for (const food of (data ?? []) as Food[]) {
    map.set(food.id, food);
  }

  return map;
}

/**
 * Busca UM plano de nutrição (linha de `nutrition_plans`) por critério, junto das
 * refeições, itens de cada uma e substituições de cada item, ordenados (dia da semana —
 * todo dia primeiro — e depois `sort_order`). Função interna compartilhada por
 * `getNutritionOverview` (rascunho/publicado do coach), `getActiveNutritionPlanForClient`
 * (visão do aluno) e `getNutritionTemplates` — mesmo padrão de `hydrateWorkoutPlan`
 * (consultas separadas + merge em JS).
 */
async function hydrateNutritionPlan(
  plan: NutritionPlan,
  viewer: "coach" | "client",
  supabase: ServerSupabaseClient
): Promise<NutritionPlanWithMeals> {
  const { data: meals, error: mealsError } = await supabase
    .from("meals")
    .select("*")
    .eq("plan_id", plan.id)
    .order("day_of_week", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true });

  if (mealsError) {
    throw new Error(`Não foi possível carregar as refeições do plano: ${mealsError.message}`);
  }

  const mealList = (meals ?? []) as Meal[];
  const mealIds = mealList.map((m) => m.id);

  let mealItems: MealItem[] = [];
  if (mealIds.length > 0) {
    const { data, error } = await supabase
      .from("meal_items")
      .select("*")
      .in("meal_id", mealIds)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new Error(`Não foi possível carregar os itens das refeições: ${error.message}`);
    }
    mealItems = (data ?? []) as MealItem[];
  }

  const itemIds = mealItems.map((item) => item.id);
  let substitutions: MealSubstitution[] = [];
  if (itemIds.length > 0) {
    const { data, error } = await supabase.from("meal_substitutions").select("*").in("meal_item_id", itemIds);
    if (error) {
      throw new Error(`Não foi possível carregar as substituições: ${error.message}`);
    }
    substitutions = (data ?? []) as MealSubstitution[];
  }

  const foodIds = Array.from(
    new Set(
      [
        ...mealItems.map((item) => item.food_id),
        ...substitutions.map((s) => s.alternative_food_id),
      ].filter((id): id is string => id != null)
    )
  );
  const foodsById = await getFoodsByIds(foodIds, viewer, supabase);

  const substitutionsByItem = new Map<string, MealSubstitutionWithFood[]>();
  for (const sub of substitutions) {
    const alternative_food = sub.alternative_food_id ? (foodsById.get(sub.alternative_food_id) ?? null) : null;
    const list = substitutionsByItem.get(sub.meal_item_id) ?? [];
    list.push({ ...sub, alternative_food });
    substitutionsByItem.set(sub.meal_item_id, list);
  }

  const itemsByMeal = new Map<string, MealItemWithFood[]>();
  for (const item of mealItems) {
    const food = item.food_id ? (foodsById.get(item.food_id) ?? null) : null;
    const list = itemsByMeal.get(item.meal_id) ?? [];
    list.push({ ...item, food, substitutions: substitutionsByItem.get(item.id) ?? [] });
    itemsByMeal.set(item.meal_id, list);
  }

  return {
    ...plan,
    meals: mealList.map((m) => ({ ...m, items: itemsByMeal.get(m.id) ?? [] })),
  };
}

async function getNutritionPlanForClient(
  clientId: string,
  isDraft: boolean | null,
  viewer: "coach" | "client",
  options: { excludeArchived?: boolean } = {}
): Promise<NutritionPlanWithMeals | null> {
  const supabase = await createSupabaseServerClient();

  let planQuery = supabase
    .from("nutrition_plans")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_template", false);
  if (isDraft !== null) {
    planQuery = planQuery.eq("is_draft", isDraft);
  }
  if (options.excludeArchived) {
    planQuery = planQuery.is("archived_at", null);
  }

  const { data: plan, error: planError } = await planQuery
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    throw new Error(`Não foi possível carregar o plano de nutrição: ${planError.message}`);
  }
  if (!plan) return null;

  return hydrateNutritionPlan(plan as NutritionPlan, viewer, supabase);
}

/**
 * Visão do COACH: o plano de nutrição do aluno (o mais recente, rascunho ou publicado),
 * com refeições e itens aninhados. `null` se o aluno ainda não tem nenhum plano.
 *
 * @deprecated pro construtor completo (item 20), use {@link getNutritionOverview} — mesma
 * razão de `getWorkoutPlan` estar deprecated (rascunho e publicado podem coexistir).
 */
export async function getNutritionPlan(clientId: string): Promise<NutritionPlanWithMeals | null> {
  return getNutritionPlanForClient(clientId, null, "coach");
}

/**
 * Visão do ALUNO: o plano de nutrição PUBLICADO E ATIVO (`is_draft = false`,
 * `archived_at` nulo) mais recente do cliente autenticado, com refeições e itens
 * aninhados. `null` se o coach ainda não publicou nada, ou se a única versão publicada já
 * foi arquivada (substituída por uma nova publicação) — mesma decisão de
 * `getActiveWorkoutForClient` (ver 0008, efeito colateral 3).
 */
export async function getActiveNutritionPlanForClient(
  clientId: string
): Promise<NutritionPlanWithMeals | null> {
  return getNutritionPlanForClient(clientId, false, "client", { excludeArchived: true });
}

/**
 * Visão do COACH pro construtor: rascunho (editável, no máximo 1 por aluno — 0008) +
 * publicado ATIVO (referência/pré-visualização, no máximo 1) + quantas versões anteriores
 * existem (arquivadas cada vez que um novo rascunho é publicado por cima).
 */
export async function getNutritionOverview(clientId: string): Promise<NutritionOverview> {
  const supabase = await createSupabaseServerClient();

  const [draft, published, archivedCountResult] = await Promise.all([
    getNutritionPlanForClient(clientId, true, "coach"),
    getNutritionPlanForClient(clientId, false, "coach", { excludeArchived: true }),
    supabase
      .from("nutrition_plans")
      .select("*", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("is_template", false)
      .not("archived_at", "is", null),
  ]);

  if (archivedCountResult.error) {
    throw new Error(`Não foi possível carregar o histórico de versões: ${archivedCountResult.error.message}`);
  }

  return { draft, published, archivedCount: archivedCountResult.count ?? 0 };
}

/** Templates de dieta da conta do coach (`is_template = true`, sem aluno), com refeições e
 * itens aninhados — pra pré-visualizar antes de aplicar a um aluno. */
export async function getNutritionTemplates(): Promise<NutritionPlanWithMeals[]> {
  const supabase = await createSupabaseServerClient();
  const accountId = await getCurrentCoachAccountId(supabase);

  const { data, error } = await supabase
    .from("nutrition_plans")
    .select("*")
    .eq("account_id", accountId)
    .eq("is_template", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os templates de dieta: ${error.message}`);
  }

  const plans = (data ?? []) as NutritionPlan[];
  return Promise.all(plans.map((plan) => hydrateNutritionPlan(plan, "coach", supabase)));
}

/** Exclui um template (RLS `nutrition_plans_template_by_account` restringe à própria conta). */
export async function deleteNutritionTemplate(templateId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("nutrition_plans")
    .delete()
    .eq("id", templateId)
    .eq("is_template", true);
  if (error) {
    throw new Error(`Não foi possível excluir o template: ${error.message}`);
  }
}

/**
 * Cria um RASCUNHO de nutrição pro aluno — vazio, ou copiado de um template/de outro
 * plano (`fromPlanId`) via a função SQL `duplicate_nutrition_plan` (0008, atômica: plano +
 * refeições + itens + substituições numa transação só). Falha com mensagem amigável se o
 * aluno já tiver um rascunho (índice único `nutrition_plans_one_draft_per_client_uidx`,
 * 0008) — o app deve oferecer "descartar o rascunho atual" antes.
 */
export async function createNutritionDraft(
  clientId: string,
  input: { name?: string; description?: string; fromPlanId?: string } = {}
): Promise<NutritionPlan> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  if (input.fromPlanId) {
    const { data: newId, error } = await supabase.rpc("duplicate_nutrition_plan", {
      p_source_plan_id: input.fromPlanId,
      p_target_client_id: clientId,
      p_as_template: false,
      p_name: input.name?.trim() || null,
      p_description: input.description?.trim() || null,
    });

    if (error || !newId) {
      throw new Error(translateNutritionTracklyError(error?.message ?? "Não foi possível criar o rascunho."));
    }

    const { data: plan, error: fetchError } = await supabase
      .from("nutrition_plans")
      .select("*")
      .eq("id", newId as string)
      .single();
    if (fetchError || !plan) {
      throw new Error(`Rascunho criado, mas não foi possível recarregá-lo: ${fetchError?.message ?? ""}`);
    }

    await recordNutritionPlanChange(supabase, {
      accountId: coach.accountId,
      clientId,
      planId: plan.id,
      actorId: coach.id,
      actorName: coach.name,
      action: "created",
      entity: "plan",
      entityId: plan.id,
      summary: `Criou o rascunho "${(plan as NutritionPlan).name}" a partir de outro plano.`,
    });

    return plan as NutritionPlan;
  }

  const { data: existing, error: existingError } = await supabase
    .from("nutrition_plans")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_draft", true)
    .eq("is_template", false)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Não foi possível verificar o rascunho atual: ${existingError.message}`);
  }
  if (existing) {
    throw new Error(translateNutritionTracklyError("trackly:draft_exists"));
  }

  const trimmedName = input.name?.trim() || "Nutrição";

  const { data, error } = await supabase
    .from("nutrition_plans")
    .insert({
      client_id: clientId,
      name: trimmedName,
      description: input.description?.trim() || null,
      is_draft: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar o rascunho de nutrição: ${error?.message ?? "erro desconhecido"}`);
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId,
    planId: data.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "plan",
    entityId: data.id,
    summary: `Criou o rascunho "${trimmedName}".`,
  });

  return data as NutritionPlan;
}

/** Descarta o rascunho (delete — cascata apaga refeições/itens/substituições dele). Só age
 * sobre um plano em rascunho. */
export async function discardNutritionDraft(planId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("client_id, name, is_draft")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Rascunho não encontrado: ${planError?.message ?? ""}`);
  }
  if (!(plan as { is_draft: boolean }).is_draft) {
    throw new Error("Só é possível descartar um rascunho — este plano já está publicado.");
  }

  const { error } = await supabase.from("nutrition_plans").delete().eq("id", planId);
  if (error) {
    throw new Error(`Não foi possível descartar o rascunho: ${error.message}`);
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "deleted",
    entity: "plan",
    entityId: planId,
    summary: `Descartou o rascunho "${(plan as { name: string }).name}".`,
  });
}

/**
 * Duplica um plano inteiro (função SQL `duplicate_nutrition_plan`, 0008 — plano +
 * refeições + itens + substituições, atômico): `asTemplate: true` salva como template da
 * conta; `asTemplate: false` cria um RASCUNHO pro `targetClientId` (aplicar um template a
 * um aluno, ou duplicar a dieta de um aluno pra outro).
 */
export async function duplicateNutritionPlan(input: {
  sourcePlanId: string;
  targetClientId?: string;
  asTemplate: boolean;
  name?: string;
  description?: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: source, error: sourceError } = await supabase
    .from("nutrition_plans")
    .select("name, is_template")
    .eq("id", input.sourcePlanId)
    .maybeSingle();
  if (sourceError || !source) {
    throw new Error(`Plano de origem não encontrado: ${sourceError?.message ?? ""}`);
  }

  const { data: newId, error } = await supabase.rpc("duplicate_nutrition_plan", {
    p_source_plan_id: input.sourcePlanId,
    p_target_client_id: input.targetClientId ?? null,
    p_as_template: input.asTemplate,
    p_name: input.name?.trim() || null,
    p_description: input.description?.trim() || null,
  });

  if (error || !newId) {
    throw new Error(translateNutritionTracklyError(error?.message ?? "Não foi possível duplicar o plano."));
  }

  const sourceName = (source as { name: string }).name;
  const wasTemplate = (source as { is_template: boolean }).is_template;
  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: input.asTemplate ? null : (input.targetClientId ?? null),
    planId: newId as string,
    actorId: coach.id,
    actorName: coach.name,
    action: input.asTemplate ? "created" : wasTemplate ? "template_applied" : "created",
    entity: "plan",
    entityId: newId as string,
    summary: input.asTemplate
      ? `Salvou "${sourceName}" como template.`
      : wasTemplate
        ? `Aplicou o template "${sourceName}" (criou rascunho).`
        : `Duplicou o plano "${sourceName}".`,
  });

  return newId as string;
}

/** Atualiza as metas nutricionais do plano (kcal/proteína/carboidrato/gordura/água, item 20). */
export async function updateNutritionGoals(
  planId: string,
  input: {
    targetKcal?: number | null;
    targetProteinG?: number | null;
    targetCarbsG?: number | null;
    targetFatG?: number | null;
    targetWaterMl?: number | null;
  }
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const patch: Record<string, unknown> = {};
  if (input.targetKcal !== undefined) patch.target_kcal = input.targetKcal;
  if (input.targetProteinG !== undefined) patch.target_protein_g = input.targetProteinG;
  if (input.targetCarbsG !== undefined) patch.target_carbs_g = input.targetCarbsG;
  if (input.targetFatG !== undefined) patch.target_fat_g = input.targetFatG;
  if (input.targetWaterMl !== undefined) patch.target_water_ml = input.targetWaterMl;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("nutrition_plans")
    .update(patch)
    .eq("id", planId)
    .select("client_id, name")
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Não foi possível salvar as metas nutricionais: ${error?.message ?? "erro desconhecido"}`);
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (data as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "plan",
    entityId: planId,
    summary: `Atualizou as metas nutricionais de "${(data as { name: string }).name}".`,
  });
}

/** Edita nome/horário/dia da semana/observações de uma refeição. */
export async function updateMeal(
  mealId: string,
  input: { name?: string; time?: string | null; day_of_week?: number | null; notes?: string | null }
): Promise<Meal> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Nome da refeição é obrigatório.");
    patch.name = name;
  }
  if (input.time !== undefined) patch.time = input.time?.trim() || null;
  if (input.day_of_week !== undefined) patch.day_of_week = input.day_of_week;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("meals")
    .update(patch)
    .eq("id", mealId)
    .select("*, nutrition_plans!inner(client_id, id)")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível editar a refeição: ${error?.message ?? "erro desconhecido"}`);
  }

  const row = data as unknown as Meal & { nutrition_plans: { client_id: string | null; id: string } };
  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.nutrition_plans.client_id,
    planId: row.nutrition_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "meal",
    entityId: mealId,
    summary: `Editou a refeição "${row.name}".`,
  });

  const { nutrition_plans: _plans, ...meal } = row;
  void _plans;
  return meal;
}

/** Remove uma refeição (cascata apaga os itens/substituições dela). */
export async function deleteMeal(mealId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: meal, error: mealError } = await supabase
    .from("meals")
    .select("name, nutrition_plans!inner(client_id, id)")
    .eq("id", mealId)
    .single();
  if (mealError || !meal) {
    throw new Error(`Refeição não encontrada: ${mealError?.message ?? ""}`);
  }

  const { error } = await supabase.from("meals").delete().eq("id", mealId);
  if (error) {
    throw new Error(`Não foi possível remover a refeição: ${error.message}`);
  }

  const row = meal as unknown as { name: string; nutrition_plans: { client_id: string | null; id: string } };
  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.nutrition_plans.client_id,
    planId: row.nutrition_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "deleted",
    entity: "meal",
    entityId: mealId,
    summary: `Removeu a refeição "${row.name}".`,
  });
}

/** Adiciona uma refeição ao plano, no fim da lista DO MESMO "dia" (`sort_order` escopado
 * por `plan_id` + `day_of_week` — mesma unidade de reordenação de `reorder_nutrition_meals`,
 * 0008). `time`/`notes` ficam `null` se não informados; `day_of_week` nulo = todo dia. */
export async function addMeal(
  planId: string,
  input: { name: string; time?: string | null; day_of_week?: number | null; notes?: string | null }
): Promise<Meal> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Nome da refeição é obrigatório.");
  }

  const { data: plan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("client_id")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    throw new Error(`Plano de nutrição não encontrado: ${planError?.message ?? ""}`);
  }

  const dayOfWeek = input.day_of_week ?? null;
  let countQuery = supabase.from("meals").select("*", { count: "exact", head: true }).eq("plan_id", planId);
  countQuery = dayOfWeek == null ? countQuery.is("day_of_week", null) : countQuery.eq("day_of_week", dayOfWeek);
  const { count, error: countError } = await countQuery;

  if (countError) {
    throw new Error(`Não foi possível preparar a nova refeição: ${countError.message}`);
  }

  const { data, error } = await supabase
    .from("meals")
    .insert({
      plan_id: planId,
      name: trimmedName,
      time: input.time?.trim() || null,
      day_of_week: dayOfWeek,
      notes: input.notes?.trim() || null,
      sort_order: count ?? 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar a refeição: ${error?.message ?? "erro desconhecido"}`);
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "meal",
    entityId: data.id,
    summary: `Adicionou a refeição "${trimmedName}".`,
  });

  return data as Meal;
}

/** Duplica uma refeição (função SQL `duplicate_nutrition_meal`, 0008 — refeição + itens +
 * substituições, atômico), inserida logo depois da original no mesmo "dia". */
export async function duplicateMeal(mealId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: meal, error: mealError } = await supabase
    .from("meals")
    .select("name, nutrition_plans!inner(client_id, id)")
    .eq("id", mealId)
    .single();
  if (mealError || !meal) {
    throw new Error(`Refeição não encontrada: ${mealError?.message ?? ""}`);
  }

  const { data: newId, error } = await supabase.rpc("duplicate_nutrition_meal", { p_meal_id: mealId });
  if (error || !newId) {
    throw new Error(translateNutritionTracklyError(error?.message ?? "Não foi possível duplicar a refeição."));
  }

  const row = meal as unknown as { name: string; nutrition_plans: { client_id: string | null; id: string } };
  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: row.nutrition_plans.client_id,
    planId: row.nutrition_plans.id,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "meal",
    entityId: newId as string,
    summary: `Duplicou a refeição "${row.name}".`,
  });

  return newId as string;
}

/**
 * Duplica TODAS as refeições de um "dia" pra outro (função SQL `duplicate_nutrition_day`,
 * 0008 — atômico), no fim da lista do dia de destino. Devolve quantas refeições foram
 * copiadas. `null` = "todo dia" nos dois parâmetros.
 */
export async function duplicateNutritionDay(
  planId: string,
  sourceDay: number | null,
  targetDay: number | null
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("client_id, name")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    throw new Error(`Plano de nutrição não encontrado: ${planError?.message ?? ""}`);
  }

  const { data: count, error } = await supabase.rpc("duplicate_nutrition_day", {
    p_plan_id: planId,
    p_source_day: sourceDay,
    p_target_day: targetDay,
  });
  if (error || count == null) {
    throw new Error(translateNutritionTracklyError(error?.message ?? "Não foi possível duplicar o dia."));
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "created",
    entity: "meal",
    entityId: planId,
    summary: `Duplicou ${count} refeição(ões) para outro dia.`,
  });

  return count as number;
}

/** Aplica uma ordem completa de refeições de UM "dia" do plano (setas ↑/↓ na UI). */
export async function reorderMeals(planId: string, dayOfWeek: number | null, orderedMealIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("client_id, name")
    .eq("id", planId)
    .single();
  if (planError || !plan) {
    throw new Error(`Plano de nutrição não encontrado: ${planError?.message ?? ""}`);
  }

  const { error } = await supabase.rpc("reorder_nutrition_meals", {
    p_plan_id: planId,
    p_day_of_week: dayOfWeek,
    p_ids: orderedMealIds,
  });
  if (error) {
    throw new Error(translateNutritionTracklyError(error.message));
  }

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId: (plan as { client_id: string | null }).client_id,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "updated",
    entity: "meal",
    entityId: planId,
    summary: `Reordenou as refeições de "${(plan as { name: string }).name}".`,
  });
}

/** Formata a quantidade estruturada num rótulo pronto pra exibição (compatível com a tela
 * do aluno, que só lê `qty`) — ex.: `quantity=150, unit="g"` -> `"150g"`. `null` se
 * nenhuma quantidade foi informada (o item pode continuar só com `notes`). */
function formatQty(quantity: number | null | undefined, unit: string | null | undefined): string | null {
  if (quantity == null) return null;
  const trimmedUnit = unit?.trim() || "";
  return `${quantity}${trimmedUnit}`;
}

/**
 * Adiciona um alimento da biblioteca a uma refeição, no fim da lista da refeição
 * (`sort_order` = contagem atual de itens dela) — com quantidade estruturada (item 20).
 * Decisão herdada da fatia mínima: `macros` do item é um SNAPSHOT copiado do alimento
 * selecionado no momento da inclusão (não uma referência viva) — editável depois via
 * `updateMealItem` (o coach pode ajustar os macros pra refletir a quantidade prescrita,
 * já que a biblioteca não declara "macros por 100g" nem porção-base). Se o alimento não
 * tiver macros cadastrados, o item fica com `{}`.
 */
export async function addMealItem(
  mealId: string,
  foodId: string,
  input: AddMealItemInput = {}
): Promise<MealItem> {
  const supabase = await createSupabaseServerClient();

  const [foodResult, countResult] = await Promise.all([
    supabase.from("foods").select("*").eq("id", foodId).maybeSingle(),
    supabase.from("meal_items").select("*", { count: "exact", head: true }).eq("meal_id", mealId),
  ]);

  if (foodResult.error) {
    throw new Error(`Não foi possível carregar o alimento: ${foodResult.error.message}`);
  }
  if (!foodResult.data) {
    throw new Error("Alimento não encontrado.");
  }
  if (countResult.error) {
    throw new Error(`Não foi possível preparar o item: ${countResult.error.message}`);
  }

  const { data, error } = await supabase
    .from("meal_items")
    .insert({
      meal_id: mealId,
      food_id: foodId,
      quantity: input.quantity ?? null,
      unit: input.unit?.trim() || null,
      qty: formatQty(input.quantity, input.unit),
      notes: input.notes?.trim() || null,
      macros: (foodResult.data as Food).macros ?? {},
      sort_order: countResult.count ?? 0,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível adicionar o item à refeição: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as MealItem;
}

/** Edita quantidade/unidade/observações/macros de um item já na refeição. Trocar o
 * alimento em si não é editável aqui — mesma decisão de `updateWorkoutExercise` (remover e
 * adicionar de novo mantém o histórico honesto sobre o que de fato mudou). */
export async function updateMealItem(itemId: string, input: UpdateMealItemInput): Promise<MealItem> {
  const supabase = await createSupabaseServerClient();

  const patch: Record<string, unknown> = {};
  if (input.quantity !== undefined) patch.quantity = input.quantity;
  if (input.unit !== undefined) patch.unit = input.unit?.trim() || null;
  if (input.quantity !== undefined || input.unit !== undefined) {
    const { data: current } = await supabase.from("meal_items").select("quantity, unit").eq("id", itemId).maybeSingle();
    const row = current as { quantity: number | null; unit: string | null } | null;
    const quantity = input.quantity !== undefined ? input.quantity : (row?.quantity ?? null);
    const unit = input.unit !== undefined ? input.unit : (row?.unit ?? null);
    patch.qty = formatQty(quantity, unit);
  }
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.macros !== undefined) patch.macros = input.macros;

  const { data, error } = await supabase.from("meal_items").update(patch).eq("id", itemId).select("*").single();

  if (error || !data) {
    throw new Error(`Não foi possível editar o item: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as MealItem;
}

export async function deleteMealItem(itemId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("meal_items").delete().eq("id", itemId);
  if (error) {
    throw new Error(`Não foi possível remover o item: ${error.message}`);
  }
}

/** Aplica uma ordem completa de itens de uma refeição (setas ↑/↓ na UI). */
export async function reorderMealItems(mealId: string, orderedItemIds: string[]): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reorder_meal_items", { p_meal_id: mealId, p_ids: orderedItemIds });
  if (error) {
    throw new Error(translateNutritionTracklyError(error.message));
  }
}

/** Adiciona uma substituição equivalente a um item da refeição — alimento alternativo da
 * biblioteca (com macros em snapshot, mesma decisão de `addMealItem`) e/ou rótulo livre. */
export async function addMealSubstitution(
  mealItemId: string,
  input: MealSubstitutionInput
): Promise<MealSubstitution> {
  const supabase = await createSupabaseServerClient();

  const hasFood = !!input.alternativeFoodId;
  const hasLabel = !!input.alternativeLabel?.trim();
  if (!hasFood && !hasLabel) {
    throw new Error("Informe um alimento substituto ou descreva a alternativa.");
  }

  let macros: FoodMacros = {};
  if (input.alternativeFoodId) {
    const { data: food, error: foodError } = await supabase
      .from("foods")
      .select("macros")
      .eq("id", input.alternativeFoodId)
      .maybeSingle();
    if (foodError) {
      throw new Error(`Não foi possível carregar o alimento substituto: ${foodError.message}`);
    }
    macros = (food as { macros: FoodMacros } | null)?.macros ?? {};
  }

  const { data, error } = await supabase
    .from("meal_substitutions")
    .insert({
      meal_item_id: mealItemId,
      alternative_food_id: input.alternativeFoodId || null,
      alternative_label: input.alternativeLabel?.trim() || null,
      alternative_qty: input.alternativeQty?.trim() || null,
      macros,
      note: input.note?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível adicionar a substituição: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as MealSubstitution;
}

export async function deleteMealSubstitution(substitutionId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("meal_substitutions").delete().eq("id", substitutionId);
  if (error) {
    throw new Error(`Não foi possível remover a substituição: ${error.message}`);
  }
}

/**
 * Publica o rascunho (função SQL `publish_nutrition_plan`, 0008 — atômico: arquiva a
 * versão publicada anterior e ativa o rascunho na mesma transação). É isso que faz a
 * nutrição aparecer pro aluno em `getActiveNutritionPlanForClient`. Falha (mensagem
 * traduzida) se o plano não é rascunho, é template, ou não tem nenhum item ainda.
 */
export async function publishNutritionPlan(planId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const coach = await getCurrentCoach(supabase);

  const { data: plan, error: planError } = await supabase
    .from("nutrition_plans")
    .select("client_id, name")
    .eq("id", planId)
    .maybeSingle();
  if (planError || !plan) {
    throw new Error(`Plano não encontrado: ${planError?.message ?? ""}`);
  }

  const { data: archivedPlanId, error } = await supabase.rpc("publish_nutrition_plan", { p_plan_id: planId });

  if (error) {
    throw new Error(translateNutritionTracklyError(error.message));
  }

  const clientId = (plan as { client_id: string | null }).client_id;
  const planName = (plan as { name: string }).name;

  await recordNutritionPlanChange(supabase, {
    accountId: coach.accountId,
    clientId,
    planId,
    actorId: coach.id,
    actorName: coach.name,
    action: "published",
    entity: "plan",
    entityId: planId,
    summary: archivedPlanId
      ? `Publicou "${planName}" (substituiu a versão anterior).`
      : `Publicou "${planName}".`,
  });

  // Best-effort: notifica o aluno — mesmo padrão/justificativa de `publishWorkoutPlan` acima.
  if (clientId) {
    try {
      await createNotification(clientId, {
        event_type: "nutrition_updated",
        recipient: "client",
        message: "Seu plano de nutrição foi atualizado.",
      });
    } catch (err) {
      console.error("Não foi possível criar a notificação de nutrição atualizada:", err);
    }
  }
}

// ============================================================================
// NUTRIÇÃO — EXECUÇÃO DO ALUNO (item 21 do master TODO): aderência real da refeição
// (`meal_logs`) e água diária (`water_logs`), migration `0003_*.sql` seção B.3. Substitui de
// vez `markMealRealized`/`getRealizedMealIdsForWeek` (removidas) — o hack antigo gravava um
// marcador de texto (`MEAL_REALIZED:<meal_id>:<semana>`) numa linha de `history_events`;
// `lib/history.ts` (`isMealMarkerNoise`) continua filtrando esse marcador do histórico do
// coach só por causa de dado antigo que pode já existir em produção, não porque o app ainda
// grava isso — a partir daqui nenhuma linha nova nesse formato é criada.
//
// `meal_logs` é uma linha por client_id+meal_id+log_date (unique, 0003) — upsert real, ao
// contrário do `ilike` textual de antes. `status` ('done'/'partial'/'skipped') É a aderência
// (marcar como realizada = escolher o status), `difficulty` (1–5, opcional) é o "sinalizar
// dificuldade com a refeição", `note` é observação livre e `storage_path` é a foto opcional
// (mesmo bucket privado do check-in, prefixo próprio — ver `lib/storage/meal-photos.ts`).
// `log_date` é SEMPRE a data local do aluno (`todayDateSP()`, `lib/portal-today.ts`) — nunca
// `current_date` do servidor (mesmo cuidado de fuso do item 25 pro check-in).
// ============================================================================

/** Espelha 1:1 as colunas de `meal_logs` (0003 B.3). `status` é {@link MealLogStatus},
 * definido em `lib/nutrition-session.ts` (pura) — mesmo padrão de `repository.ts` importar
 * `groupPreviousPerformance` de `workout-session.ts` em vez de duplicar. */
export type MealLog = {
  id: string;
  client_id: string;
  meal_id: string | null;
  meal_name: string | null;
  log_date: string;
  status: MealLogStatus;
  difficulty: number | null;
  note: string | null;
  storage_path: string | null;
  logged_at: string;
};

export type UpsertMealLogInput = {
  clientId: string;
  mealId: string;
  mealName: string;
  logDate: string;
  status: MealLogStatus;
  difficulty?: number | null;
  note?: string | null;
  /** `undefined` preserva a foto já registrada (upsert não mexe na coluna); `null` remove. */
  storagePath?: string | null;
};

/**
 * Registra (upsert) a aderência de UMA refeição num dia — cria na primeira vez, CORRIGE se o
 * aluno reabrir a mesma refeição no mesmo dia (unique `client_id, meal_id, log_date`, 0003),
 * nunca duplica. `mealName` é gravado como snapshot (a coluna sobrevive à refeição sendo
 * removida do plano depois — `meal_id` vira `null` via `on delete set null`, `meal_name`
 * continua legível no histórico).
 */
export async function upsertMealLog(input: UpsertMealLogInput): Promise<MealLog> {
  const supabase = await createSupabaseServerClient();

  const row: Record<string, unknown> = {
    client_id: input.clientId,
    meal_id: input.mealId,
    meal_name: input.mealName,
    log_date: input.logDate,
    status: input.status,
    difficulty: input.difficulty ?? null,
    note: input.note?.trim() || null,
  };
  if (input.storagePath !== undefined) row.storage_path = input.storagePath;

  const { data, error } = await supabase
    .from("meal_logs")
    .upsert(row, { onConflict: "client_id,meal_id,log_date" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível registrar a refeição: ${error?.message ?? "erro desconhecido"}`);
  }
  return data as MealLog;
}

/** Todas as aderências já registradas num dia — pra tela mostrar o status atual de cada
 * refeição e montar o resumo do dia (`computeDaySummary`, `lib/nutrition-session.ts`). */
export async function getMealLogsForDate(clientId: string, logDate: string): Promise<MealLog[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("meal_logs")
    .select("*")
    .eq("client_id", clientId)
    .eq("log_date", logDate);

  if (error) {
    throw new Error(`Não foi possível carregar as refeições registradas: ${error.message}`);
  }
  return (data ?? []) as MealLog[];
}

/** Espelha 1:1 as colunas de `water_logs` (0003 B.3) — um total por aluno+dia. */
export type WaterLog = {
  id: string;
  client_id: string;
  log_date: string;
  amount_ml: number;
  logged_at: string;
};

/** Água já registrada num dia — `null` se o aluno ainda não registrou nada. */
export async function getWaterLogForDate(clientId: string, logDate: string): Promise<WaterLog | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("water_logs")
    .select("*")
    .eq("client_id", clientId)
    .eq("log_date", logDate)
    .maybeSingle();

  if (error) {
    throw new Error(`Não foi possível carregar a água registrada: ${error.message}`);
  }
  return data as WaterLog | null;
}

/**
 * Upsert do TOTAL de água do dia (unique `client_id, log_date`, 0003) — grava o valor final,
 * não um delta. Quem soma os incrementos dos botões rápidos ("+250ml" etc.) é a UI
 * (`clampWaterMl`, `lib/nutrition-session.ts`) antes de chamar aqui, pra um clique duplo ou
 * requisição repetida nunca somar duas vezes.
 */
export async function upsertWaterLog(clientId: string, logDate: string, amountMl: number): Promise<WaterLog> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("water_logs")
    .upsert({ client_id: clientId, log_date: logDate, amount_ml: amountMl }, { onConflict: "client_id,log_date" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível registrar a água: ${error?.message ?? "erro desconhecido"}`);
  }
  return data as WaterLog;
}

/**
 * Equivalências gerais DA CONTA aplicáveis a um conjunto de alimentos (`food_equivalences`,
 * item 20) do PONTO DE VISTA DO ALUNO — complementa `item.substitutions` (substituição
 * pontual daquele item específico) com as equivalências reaproveitáveis cadastradas pro
 * alimento em si (ex.: "arroz equivale a batata doce", vale pra qualquer refeição com arroz).
 * A policy `food_equivalences_client_read` (0003) só libera linhas cujo `food_id` é um dos
 * alimentos do próprio plano PUBLICADO do aluno (`private.client_visible_food_ids`) — aqui
 * filtramos pelos `foodIds` pedidos com o client AUTENTICADO normal, RLS decide, sem client
 * admin nenhum (diferente de `getFoodsByIds`, que resolve nome/macros dos alimentos
 * encontrados via admin pela mesma lacuna documentada ali).
 */
export async function getFoodEquivalencesForFoods(foodIds: string[]): Promise<FoodEquivalenceWithFoods[]> {
  if (foodIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from("food_equivalences").select("*").in("food_id", foodIds);
  if (error) {
    throw new Error(`Não foi possível carregar as equivalências: ${error.message}`);
  }

  const rows = (data ?? []) as FoodEquivalence[];
  const relatedFoodIds = Array.from(new Set(rows.flatMap((r) => [r.food_id, r.equivalent_food_id])));
  const foodsById = await getFoodsByIds(relatedFoodIds, "client", supabase);

  return rows.map((r) => ({
    ...r,
    food: foodsById.get(r.food_id) ?? null,
    equivalent_food: foodsById.get(r.equivalent_food_id) ?? null,
  }));
}

// ============================================================================
// PAGAMENTOS (próxima fatia do item 4 — fiação de dados ponta a ponta pro fluxo MANUAL de
// cobrança que já existe no protótipo estático hoje: o coach registra manualmente que
// recebeu um pagamento, sem checkout nem webhook. NÃO integra nenhum gateway real (Mercado
// Pago/Asaas/Stripe) — essa decisão ainda não foi tomada pelo usuário (nota "Tasks for
// Gustavo", fora de escopo aqui). `payments.gateway_reference` já existe na migration pra
// quando vier a integrar, mesma abstração documentada em `paymentProvider` do protótipo
// estático (prototype/assets/js/data.js ~linha 728) — aqui simplesmente não existe
// implementação nenhuma por trás ainda, e nenhuma linha grava segredo de gateway.
// ============================================================================

export type SubscriptionPeriod = "monthly" | "quarterly" | "semiannual" | "annual";
export type SubscriptionStatus = "active" | "paused" | "cancelled";

/** Espelha 1:1 as colunas da tabela `subscriptions`. `client_id` é UNIQUE — um aluno só
 * pode ter uma assinatura por vez (ver `createSubscription`, idempotente por causa disso). */
export type Subscription = {
  id: string;
  client_id: string;
  plan_name: string;
  price_cents: number;
  period: SubscriptionPeriod;
  status: SubscriptionStatus;
  created_at: string;
  /** Data do cancelamento (migration 0016); nula fora de `cancelled`. */
  cancelled_at: string | null;
};

export type PaymentStatus = "pending" | "paid" | "overdue" | "cancelled" | "refunded";

/** Espelha 1:1 as colunas da tabela `payments`. `gateway_reference` nunca guarda segredo
 * (comentário da própria migration) — só um id de referência pra quando existir gateway de
 * verdade; nesta fatia sempre fica `null` (fluxo 100% manual, sem gateway nenhum). */
export type Payment = {
  id: string;
  subscription_id: string;
  due_date: string;
  paid_date: string | null;
  amount_cents: number;
  status: PaymentStatus;
  method: string | null;
  gateway_reference: string | null;
};

export type PaymentEventType = "created" | "charged" | "refunded" | "status_changed";

/** Espelha 1:1 as colunas da tabela `payment_events`. */
export type PaymentEvent = {
  id: string;
  payment_id: string;
  type: PaymentEventType;
  detail: string | null;
  created_at: string;
};

export type CreateSubscriptionInput = {
  plan_name: string;
  price_cents: number;
  period: SubscriptionPeriod;
};

export type MarkPaymentAsPaidInput = {
  method?: string;
};

/** Visão do COACH: a assinatura do aluno com o histórico de `payments`, mais recente
 * primeiro (`due_date` desc). */
export type SubscriptionWithPayments = Subscription & { payments: Payment[] };

/**
 * Busca a assinatura do aluno junto do histórico de cobranças (mais recente primeiro, por
 * `due_date`). `null` se ainda não existe assinatura pra esse `client_id` — a UI
 * (`app/coach/alunos/[id]/pagamento/page.tsx`) trata isso como "ainda não tem plano", mesmo
 * padrão de `getWorkoutPlan`/`getNutritionPlan` devolvendo `null`. RLS (`subscriptions_by_client`
 * / `payments_by_subscription`) já garante que só vem dado do próprio aluno da conta do
 * coach — não refiltra aqui.
 */
export async function getSubscription(clientId: string): Promise<SubscriptionWithPayments | null> {
  const supabase = await createSupabaseServerClient();

  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (subError) {
    throw new Error(`Não foi possível carregar a assinatura: ${subError.message}`);
  }
  if (!subscription) return null;

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("subscription_id", (subscription as Subscription).id)
    .order("due_date", { ascending: false });

  if (paymentsError) {
    throw new Error(`Não foi possível carregar os pagamentos: ${paymentsError.message}`);
  }

  // Best-effort: gatilho OPORTUNISTA de "pagamento atrasado" (decisão documentada no
  // relatório da tarefa — não há job/cron nesta fatia, então o evento é gerado quando o
  // COACH abre esta tela e existe uma cobrança vencida ainda pendente, em vez de rodar em
  // background). Nunca deve quebrar a leitura da assinatura em si.
  try {
    await notifyOverduePaymentIfNeeded(clientId, (payments ?? []) as Payment[]);
  } catch (err) {
    console.error("Não foi possível verificar notificação de pagamento atrasado:", err);
  }

  return { ...(subscription as Subscription), payments: (payments ?? []) as Payment[] };
}

/**
 * Gatilho oportunista de "pagamento atrasado" (ver comentário em `getSubscription`).
 * Idempotência simples (sem constraint dedicada, `notifications` não referencia
 * `payment_id`): não recria enquanto já existir uma notificação `payment_overdue` NÃO LIDA
 * pra esse aluno — evita empilhar uma notificação nova a cada vez que o coach reabre a tela
 * com a mesma cobrança ainda vencida. Uma vez que o coach marca a notificação como lida, a
 * próxima abertura da tela (se a cobrança continuar vencida/pendente) gera uma nova — é uma
 * heurística aceitável pra esta fatia mínima, não uma garantia de "uma notificação por
 * cobrança".
 */
async function notifyOverduePaymentIfNeeded(clientId: string, payments: Payment[]): Promise<void> {
  const today = new Date();
  const hasOverdue = payments.some(
    (p) => p.status === "pending" && new Date(`${p.due_date}T23:59:59Z`) < today
  );
  if (!hasOverdue) return;

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("client_id", clientId)
    .eq("event_type", "payment_overdue")
    .eq("read", false)
    .limit(1)
    .maybeSingle();
  if (existing) return;

  const { data: client } = await supabase.from("clients").select("name").eq("id", clientId).maybeSingle();

  await createNotification(clientId, {
    event_type: "payment_overdue",
    recipient: "coach",
    message: `A cobrança de ${(client as { name: string } | null)?.name ?? "um aluno"} está atrasada.`,
  });
}

/**
 * Cria a assinatura do aluno — idempotente: `client_id` é UNIQUE na tabela (uma assinatura
 * por aluno), então se já existir uma linha, esta função só ATUALIZA plano/valor/
 * periodicidade da existente em vez de tentar inserir de novo (o que violaria a constraint
 * unique). Decisão (documentada no relatório da tarefa): não mexe em `status` aqui —
 * reativar uma assinatura pausada/cancelada é uma decisão separada do coach que esta fatia
 * não pede uma ação dedicada pra fazer ("pausar"/"cancelar"/"reativar" ficam de fora, fora
 * de escopo mínimo), então só os campos editáveis do formulário são atualizados.
 */
export async function createSubscription(
  clientId: string,
  input: CreateSubscriptionInput
): Promise<Subscription> {
  const supabase = await createSupabaseServerClient();

  const planName = input.plan_name.trim();
  if (!planName) {
    throw new Error("Nome do plano é obrigatório.");
  }
  if (!Number.isFinite(input.price_cents) || input.price_cents <= 0) {
    throw new Error("Valor do plano precisa ser maior que zero.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Não foi possível verificar a assinatura: ${existingError.message}`);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ plan_name: planName, price_cents: input.price_cents, period: input.period })
      .eq("id", (existing as Subscription).id)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Não foi possível atualizar a assinatura: ${error?.message ?? "erro desconhecido"}`);
    }
    return data as Subscription;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      client_id: clientId,
      plan_name: planName,
      price_cents: input.price_cents,
      period: input.period,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível criar a assinatura: ${error?.message ?? "erro desconhecido"}`);
  }

  return data as Subscription;
}

/**
 * Cancela ou reativa a assinatura do aluno (decisão de 09/10: o Financeiro conta cancelamentos
 * por mês). Cancelar grava `cancelled_at` (migration 0016); reativar volta pra `active` e limpa a
 * data. Cobranças já registradas não mudam: as pendentes continuam no histórico/atrasados, e o
 * Financeiro já tira do "previsto" as cobranças de assinatura cancelada. RLS: só o coach da conta
 * escreve em `subscriptions`. O UPDATE é condicional ao status atual, então clique duplo é no-op.
 */
export async function setSubscriptionCancelled(clientId: string, cancelled: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("subscriptions")
    .update(
      cancelled
        ? { status: "cancelled", cancelled_at: new Date().toISOString() }
        : { status: "active", cancelled_at: null }
    )
    .eq("client_id", clientId)
    .in("status", cancelled ? ["active", "paused"] : ["cancelled"]);
  if (error) {
    throw new Error(
      `Não foi possível ${cancelled ? "cancelar" : "reativar"} a assinatura: ${error.message}`
    );
  }
}

/** Soma `count` meses (calendário civil) a uma data `YYYY-MM-DD`, em UTC — helper puro
 * (sem I/O) usado só por `computeNextDueDate` abaixo. */
function addMonthsUTC(dateStr: string, count: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + count);
  return d.toISOString().slice(0, 10);
}

const PERIOD_MONTHS: Record<SubscriptionPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * Calcula a próxima data de vencimento a partir da periodicidade da assinatura + uma data
 * base (`YYYY-MM-DD`) — decisão de UX (documentada no relatório da tarefa): a tela do coach
 * NÃO pede uma data manualmente no botão "Registrar próxima cobrança"; em vez disso soma o
 * intervalo do plano (1/3/6/12 meses) à `due_date` da cobrança mais recente, ou a hoje se
 * ainda não existe nenhuma cobrança — mais simples pro coach (um clique, sem campo de data
 * pra errar) e sempre consistente com a periodicidade escolhida na assinatura. Função pura,
 * sem I/O, chamada pela Server Action (`app/coach/alunos/[id]/pagamento/actions.ts`).
 */
export function computeNextDueDate(period: SubscriptionPeriod, fromDate?: string): string {
  const base = fromDate ?? todayInSaoPaulo();
  return addMonthsUTC(base, PERIOD_MONTHS[period]);
}

/**
 * Cria a próxima cobrança pendente pra uma assinatura — `amount_cents` sempre igual ao
 * `price_cents` atual da assinatura (não há suporte a cobrança de valor avulso nesta
 * fatia mínima). Idempotente por `due_date`: se já existir um `payment` PENDENTE pra essa
 * mesma data de vencimento, devolve o existente em vez de duplicar (não há constraint
 * `unique` no schema pra isso — checagem em app-level, mesmo padrão já usado em
 * `createWorkoutPlan`/`createNutritionPlan`).
 */
export async function createNextPayment(subscriptionId: string, dueDate: string): Promise<Payment> {
  const supabase = await createSupabaseServerClient();

  const { data: subscription, error: subError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subError) {
    throw new Error(`Não foi possível carregar a assinatura: ${subError.message}`);
  }
  if (!subscription) {
    throw new Error("Assinatura não encontrada.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("payments")
    .select("*")
    .eq("subscription_id", subscriptionId)
    .eq("due_date", dueDate)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) {
    throw new Error(`Não foi possível verificar as cobranças existentes: ${existingError.message}`);
  }
  if (existing) return existing as Payment;

  const { data, error } = await supabase
    .from("payments")
    .insert({
      subscription_id: subscriptionId,
      due_date: dueDate,
      amount_cents: (subscription as Subscription).price_cents,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Não foi possível registrar a cobrança: ${error?.message ?? "erro desconhecido"}`);
  }

  // Linha de auditoria em `payment_events` — `type = 'created'` é o valor do CHECK
  // constraint que corresponde exatamente a este evento. Não propaga erro se isso falhar
  // sozinho: é só trilha de auditoria, não deve derrubar a criação da cobrança em si.
  await supabase.from("payment_events").insert({
    payment_id: (data as Payment).id,
    type: "created",
    detail: `Cobrança de vencimento ${dueDate} registrada.`,
  });

  return data as Payment;
}

/**
 * Marca uma cobrança como paga — fluxo 100% manual (o coach confirma que recebeu, sem
 * checkout nem webhook de gateway nenhum, igual ao protótipo estático hoje): `status='paid'`,
 * `paid_date` = hoje, `method` = o informado ou `'manual'` por default. Decisão: `'manual'`
 * deixa explícito no dado que essa cobrança não passou por nenhum gateway — distingue de um
 * futuro `'pix'`/`'cartao'` vindo de integração real quando ela existir. Grava uma linha em
 * `payment_events` (`type='charged'`) como trilha de auditoria simples.
 */
export async function markPaymentAsPaid(
  paymentId: string,
  input: MarkPaymentAsPaidInput = {}
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const method = input.method?.trim() || "manual";
  // "Hoje" em São Paulo (não UTC): depois das 21h locais o UTC já é o dia seguinte.
  const paidDate = todayInSaoPaulo();

  const { error } = await supabase
    .from("payments")
    .update({ status: "paid", paid_date: paidDate, method })
    .eq("id", paymentId);

  if (error) {
    throw new Error(`Não foi possível marcar o pagamento como pago: ${error.message}`);
  }

  const { error: eventError } = await supabase.from("payment_events").insert({
    payment_id: paymentId,
    type: "charged",
    detail: "Pagamento registrado manualmente pelo coach.",
  });

  if (eventError) {
    throw new Error(`Pagamento marcado como pago, mas não foi possível gravar o evento: ${eventError.message}`);
  }
}

export type ClientPaymentStatus = "sem_assinatura" | "em_dia" | "pendente" | "atrasado";

/**
 * Visão do COACH pra alimentar o badge financeiro na lista de alunos (`client-row.tsx`) —
 * mesmo padrão de "uma consulta em lote + merge em JS" já usado em
 * `getClientsWithCheckinStatus` pra evitar N+1 (uma query por aluno).
 *
 * Heurística (documentada no relatório da tarefa — decisão própria, o TODO master não
 * especifica o critério exato):
 *   - "sem_assinatura": o aluno nunca teve uma linha em `subscriptions` criada.
 *   - "atrasado": existe pelo menos um `payment` com `status='overdue'`, OU um `payment`
 *     `status='pending'` cujo `due_date` já passou. Tem prioridade sobre "pendente" — um
 *     aluno com uma cobrança atrasada E outra futura ainda conta como atrasado (é o caso
 *     mais urgente pro coach enxergar primeiro).
 *   - "pendente": não está atrasado, mas existe um `payment` `status='pending'` com
 *     `due_date` ainda não vencido.
 *   - "em_dia": tem assinatura e nenhum `payment` pending/overdue (nunca teve cobrança
 *     registrada ainda, ou todas as cobranças já registradas estão pagas/canceladas/
 *     estornadas).
 */
export async function getPaymentStatusForClients(
  clientIds: string[]
): Promise<Map<string, ClientPaymentStatus>> {
  const statusByClient = new Map<string, ClientPaymentStatus>();
  if (clientIds.length === 0) return statusByClient;

  const supabase = await createSupabaseServerClient();

  const { data: subscriptions, error: subError } = await supabase
    .from("subscriptions")
    .select("id, client_id")
    .in("client_id", clientIds);

  if (subError) {
    throw new Error(`Não foi possível carregar as assinaturas: ${subError.message}`);
  }

  const subList = (subscriptions ?? []) as { id: string; client_id: string }[];
  const clientBySubscription = new Map(subList.map((s) => [s.id, s.client_id]));
  const subscriptionIds = subList.map((s) => s.id);

  for (const clientId of clientIds) {
    statusByClient.set(clientId, "sem_assinatura");
  }
  for (const sub of subList) {
    statusByClient.set(sub.client_id, "em_dia");
  }

  if (subscriptionIds.length === 0) return statusByClient;

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("subscription_id, due_date, status")
    .in("subscription_id", subscriptionIds)
    .in("status", ["pending", "overdue"]);

  if (paymentsError) {
    throw new Error(`Não foi possível carregar as cobranças: ${paymentsError.message}`);
  }

  const today = new Date();
  const pendingClientIds = new Set<string>();
  const lateClientIds = new Set<string>();

  for (const payment of (payments ?? []) as {
    subscription_id: string;
    due_date: string;
    status: string;
  }[]) {
    const clientId = clientBySubscription.get(payment.subscription_id);
    if (!clientId) continue;

    const isLate = payment.status === "overdue" || new Date(`${payment.due_date}T23:59:59Z`) < today;
    if (isLate) {
      lateClientIds.add(clientId);
    } else {
      pendingClientIds.add(clientId);
    }
  }

  for (const clientId of pendingClientIds) {
    statusByClient.set(clientId, "pendente");
  }
  for (const clientId of lateClientIds) {
    statusByClient.set(clientId, "atrasado"); // sobrescreve "pendente" — atrasado tem prioridade.
  }

  return statusByClient;
}

// ============================================================================
// NOTIFICAÇÕES (próxima fatia do item 4 — notificações IN-APP reais: eventos do sistema
// geram uma linha real em `notifications`, coach e aluno têm como ver/marcar como lida.
// NÃO é o item 29 completo (push/WhatsApp/e-mail com separação de evento e canal de
// entrega) — `channel_in_app` é o único canal ativo aqui; `channel_push`/`channel_email`
// ficam sempre no default `'declared'` da migration, nunca viram `'sent'` nesta fatia.
//
// Decisão de client (documentada no relatório da tarefa, testada de ponta a ponta):
// NENHUMA função desta seção usa o client ADMIN. A policy `notifications_by_client`
// (`for all using (private.can_access_client(client_id))`) já cobre os dois lados —
// `can_access_client` devolve true tanto pro coach da conta (`account_id` bate) quanto pro
// próprio aluno (`auth_user_id` bate) — então tanto o ALUNO criando uma notificação pro
// COACH (check-in enviado) quanto o COACH criando uma pro ALUNO (treino/nutrição
// publicados) conseguem INSERT com o client normal (sessão de quem está logado), desde que
// o `client_id` da notificação seja um `client_id` que a sessão atual já acessa.
//
// Lacuna de RLS real encontrada (documentada, mesma classe das já registradas em
// `getExercisesByIds`/`getFoodsByIds` acima — não corrijo com migration nova, fora de
// escopo): a policy não distingue `recipient` — ela só olha `client_id`. Isso significa que,
// em tese, a sessão do ALUNO consegue também LER, INSERIR ou MARCAR COMO LIDA uma
// notificação `recipient = 'coach'` do PRÓPRIO `client_id` dele (e vice-versa, o COACH
// também alcança as `recipient = 'client'` do aluno, o que é até esperado — é a conta dele).
// O isolamento por `recipient` nesta fatia é inteiramente de APLICAÇÃO (cada função abaixo
// sempre filtra `.eq("recipient", recipient)` explicitamente), não de banco. Corrigir de
// verdade exigiria comparar `recipient` contra qual lado da sessão está acessando (coach vs.
// client) dentro da própria policy — não é possível com uma migration inalterada.
// ============================================================================

/** CHECK constraint de `event_type` na migration — 7 valores fechados. */
export type NotificationEventType =
  | "checkin_received"
  | "checkin_overdue"
  | "checkin_reminder"
  | "orientation_ready"
  | "payment_overdue"
  | "workout_updated"
  | "nutrition_updated";

export type NotificationRecipient = "coach" | "client";

/** Espelha 1:1 as colunas da tabela `notifications`. */
export type Notification = {
  id: string;
  client_id: string;
  event_type: NotificationEventType;
  recipient: NotificationRecipient;
  message: string;
  channel_in_app: boolean;
  channel_whatsapp: boolean;
  channel_push: "declared" | "sent";
  channel_email: "declared" | "sent";
  read: boolean;
  created_at: string;
};

export type CreateNotificationInput = {
  event_type: NotificationEventType;
  recipient: NotificationRecipient;
  message: string;
};

/** `notifications` com o nome do aluno relacionado já resolvido — útil pro COACH saber "de
 * qual aluno" sem precisar de uma consulta separada. `null` só no caso (não deveria
 * acontecer, FK garante a linha) de o `client_id` não resolver mais. */
export type NotificationWithClient = Notification & { client_name: string | null };

/**
 * Função central que os outros fluxos chamam pra registrar um evento como notificação real
 * (ver seção "Decisão de client" acima — nunca usa admin). Sempre `channel_in_app = true`
 * (default da migration); `channel_whatsapp`/`channel_push`/`channel_email` ficam nos
 * defaults (`false`/`'declared'`/`'declared'`) porque nenhum canal externo é implementado
 * nesta fatia.
 */
export async function createNotification(
  clientId: string,
  input: CreateNotificationInput
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  // SEM `.select()` de propósito: pedir a linha de volta (`INSERT ... RETURNING`) faz o Postgres
  // aplicar também as policies de SELECT à linha recém-criada — e desde a migration 0002 cada
  // lado só enxerga o próprio `recipient` (coach lê 'coach', aluno lê 'client'). Uma inserção
  // CRUZADA (aluno -> notificação pro coach ao enviar o check-in; coach -> notificação pro aluno
  // ao enviar a orientação/treino) violaria o RLS no RETURNING e falharia por inteiro — e como
  // todos os chamadores tratam a notificação como best-effort, isso passava em silêncio: nenhuma
  // notificação cruzada era criada. Sem RETURNING só a policy de INSERT
  // (`notifications_insert`, `can_access_client`) vale, que cobre os dois lados.
  const { error } = await supabase.from("notifications").insert({
    client_id: clientId,
    event_type: input.event_type,
    recipient: input.recipient,
    message: input.message,
  });

  if (error) {
    throw new Error(`Não foi possível criar a notificação: ${error.message}`);
  }
}

/**
 * Lista as notificações do usuário autenticado atual, mais recentes primeiro.
 *
 * Pro COACH (`recipient = 'coach'`): o RLS já restringe às linhas cujo `client_id` é de um
 * aluno da própria conta (`can_access_client` via `account_id`) — o filtro
 * `.eq("recipient", "coach")` aqui é quem garante que só vêm as do coach, não as do aluno
 * (ver lacuna de RLS documentada acima).
 *
 * Pro ALUNO (`recipient = 'client'`): o RLS já restringe à própria linha de `clients`
 * (`can_access_client` via `auth_user_id`) — não precisa (e não dá, o aluno não tem como
 * saber o próprio `clients.id` de antemão sem consultar) resolver `client_id` manualmente
 * aqui, o filtro de sessão já faz isso.
 */
export async function getNotifications(
  recipient: NotificationRecipient,
  limit = 50
): Promise<NotificationWithClient[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("*, clients(name)")
    .eq("recipient", recipient)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Não foi possível carregar as notificações: ${error.message}`);
  }

  return ((data ?? []) as (Notification & { clients: { name: string } | null })[]).map((row) => {
    const { clients, ...notification } = row;
    return { ...notification, client_name: clients?.name ?? null };
  });
}

/** Conta as notificações não lidas do usuário autenticado atual — alimenta o sininho do
 * cabeçalho, mesma restrição de RLS + filtro de `getNotifications` acima. */
export async function getUnreadNotificationCount(recipient: NotificationRecipient): Promise<number> {
  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient", recipient)
    .eq("read", false);

  if (error) {
    throw new Error(`Não foi possível contar as notificações não lidas: ${error.message}`);
  }

  return count ?? 0;
}

/** Marca uma notificação específica como lida. */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) {
    throw new Error(`Não foi possível marcar a notificação como lida: ${error.message}`);
  }
}

/** Marca todas as notificações não lidas do usuário autenticado atual (do lado `recipient`
 * dado) como lidas — "marcar todas como lidas" da tela de notificações. */
export async function markAllNotificationsAsRead(recipient: NotificationRecipient): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient", recipient)
    .eq("read", false);

  if (error) {
    throw new Error(`Não foi possível marcar as notificações como lidas: ${error.message}`);
  }
}
