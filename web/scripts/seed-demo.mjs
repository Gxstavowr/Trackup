#!/usr/bin/env node
// Trackly — seed de dados de DEMO para a conta de teste do coach (coach.teste@trackly.test).
//
// Re-executável: no início apaga SÓ os alunos desta conta (cascata cuida de check-ins,
// métricas, orientações, treino, nutrição, pagamentos, notificações etc.), a biblioteca de
// exercícios/alimentos desta conta e os 2 logins de aluno de demo (pelo e-mail fixo) — nunca
// toca em outra conta, no coach, nos templates de check-in ou em qualquer outro auth user.
//
// Uso: a partir de web/, `node scripts/seed-demo.mjs`.
//
// Faz probing de colunas/tabelas novas (migrations 0003–0008) antes de usá-las: se a migration
// ainda não tiver rodado contra o banco-alvo, o script detecta e insere só o que existe em
// 0001/0002, sem quebrar.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ============================================================================
// Config
// ============================================================================

const COACH_EMAIL = "coach.teste@trackly.test";
const TODAY = new Date();

// ============================================================================
// .env.local
// ============================================================================

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = { ...parseEnvFile(path.join(ROOT, ".env.local")), ...process.env };

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
// Senha dos logins de demo: vem de web/.env.local (gitignorado), nunca escrita no código.
const STUDENT_PASSWORD = env.DEMO_STUDENT_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STUDENT_PASSWORD) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e/ou DEMO_STUDENT_PASSWORD em web/.env.local."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Helpers genéricos
// ============================================================================

function logStep(title) {
  console.log(`\n== ${title} ==`);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Soma/subtrai dias (UTC) a uma data `YYYY-MM-DD`. */
function addDaysUTC(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** N meses atrás (UTC), dia fixo do mês — pra due_date de cobranças passadas. */
function monthsAgoDate(n, day, today = TODAY) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - n, day));
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM-DDTHH:MM:00.000Z` a partir de uma data `YYYY-MM-DD`. */
function atTime(dateStr, hh, mm = 0) {
  return `${dateStr}T${pad2(hh)}:${pad2(mm)}:00.000Z`;
}

/** Mesmo algoritmo de `computeWeekInfo` em web/lib/repository.ts — mantido em paralelo de
 * propósito (módulo puro, sem import de TS a partir de um script .mjs). */
function computeWeekInfo(startDateStr, today = TODAY) {
  const start = new Date(`${startDateStr}T00:00:00Z`);
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diffDays = Math.floor((todayUtc.getTime() - start.getTime()) / 86_400_000);
  const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1);
  const periodStartMs = start.getTime() + (weekNumber - 1) * 7 * 86_400_000;
  const periodStart = new Date(periodStartMs);
  const periodEnd = new Date(periodStartMs + 6 * 86_400_000);
  return {
    weekNumber,
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}

/** `start_date` tal que, hoje, o aluno esteja na semana `pastWeeks + 1`, com `hoje` caindo
 * `offsetDays` dias depois do início dessa semana (0 = primeiro dia da semana). */
function startDateFor(pastWeeks, offsetDays, today = TODAY) {
  return addDaysUTC(isoDate(today), -(pastWeeks * 7 + offsetDays));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** Probe: a coluna existe na tabela? (42703 = undefined_column no Postgres; PGRST205/42P01 =
 * tabela não encontrada — nesse caso a coluna também "não existe" do ponto de vista do script.) */
async function columnExists(table, column) {
  const { error } = await admin.from(table).select(column).limit(1);
  if (!error) return true;
  if (error.code === "42703" || error.code === "42P01" || error.code === "PGRST205") return false;
  // Erro inesperado (rede, permissão): melhor falhar alto a silenciar um probe errado.
  throw new Error(`Falha ao checar coluna ${table}.${column}: ${error.message} (${error.code ?? "?"})`);
}

/** Probe: a tabela existe? */
async function tableExists(table) {
  const { error } = await admin.from(table).select("*").limit(1);
  if (!error) return true;
  if (error.code === "42P01" || error.code === "PGRST205") return false;
  throw new Error(`Falha ao checar tabela ${table}: ${error.message} (${error.code ?? "?"})`);
}

async function insertMany(table, rows, selectCols) {
  if (!rows || rows.length === 0) return [];
  const query = admin.from(table).insert(rows);
  const { data, error } = selectCols ? await query.select(selectCols) : await query.select();
  if (error) {
    throw new Error(`Insert em "${table}" falhou: ${error.message} (${error.code ?? "?"})`);
  }
  return data ?? [];
}

async function countRows(table, filterFn) {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (filterFn) q = filterFn(q);
  const { count, error } = await q;
  if (error) throw new Error(`Count em "${table}" falhou: ${error.message}`);
  return count ?? 0;
}

// ============================================================================
// Texto PT-BR (determinístico — sem Math.random, pra conteúdo reprodutível)
// ============================================================================

const NOTES_PHRASES = {
  emagrecimento: [
    "Semana corrida no trabalho, mas consegui manter a dieta quase toda.",
    "Senti mais fome à noite, mas segurei com chá e água.",
    "Treinos fortes essa semana, o cardio tá ficando mais fácil.",
    "Tive um deslize no jantar de sábado, mas recuperei no domingo.",
    "Dormi melhor essa semana, acho que ajudou na disposição.",
    "Semana tranquila, rotina em dia.",
    "Bati a meta de água quase todos os dias.",
  ],
  hipertrofia: [
    "Consegui bater os pesos da semana passada em quase todos os exercícios.",
    "Apetite bom, consegui comer tudo do plano.",
    "Senti um pouco de dor no ombro no treino de empurrar, fiquei de olho.",
    "Semana de treino pesado, dormi bem para recuperar.",
    "Aumentei a carga no agachamento essa semana.",
    "Rotina estável, sem deslizes na dieta.",
    "Apetite baixo na quarta, mas voltou ao normal.",
  ],
  "recomposição": [
    "Semana equilibrada entre treino e dieta.",
    "Medidas quase iguais à semana passada, acho que tá estabilizando.",
    "Consegui encaixar os treinos todos mesmo com a correria.",
    "Tive uma comemoração no fim de semana, mas voltei à rotina na segunda.",
    "Sono poderia estar melhor, mas a energia seguiu boa.",
    "Semana tranquila, sem novidades.",
    "Senti o shape mudando um pouco, roupas estão mais soltas.",
  ],
};

function notesFor(objective, week) {
  const list = NOTES_PHRASES[objective] ?? NOTES_PHRASES.emagrecimento;
  return list[week % list.length];
}

function describeWeightDelta(delta, objective) {
  const abs = Math.abs(round1(delta)).toFixed(1).replace(".", ",");
  if (Math.abs(delta) < 0.05) return "o peso ficou praticamente igual à semana passada";
  const direction = delta < 0 ? "caiu" : "subiu";
  const goodForLoss = objective === "emagrecimento" && delta < 0;
  const goodForGain = objective === "hipertrofia" && delta > 0;
  const qualifier = goodForLoss || goodForGain ? " — seguindo exatamente o combinado" : "";
  return `o peso ${direction} ${abs} kg em relação à semana passada${qualifier}`;
}

function buildOrientationText(student, week, weightNow, weightPrev, adherence, isFinalWeek) {
  const firstName = student.name.split(" ")[0];
  const weightLine =
    weightPrev != null && weightNow != null
      ? `Olhando os números: ${describeWeightDelta(weightNow - weightPrev, student.objective)}.`
      : "Esse é o primeiro registro de peso, então ainda não dá pra comparar com a semana anterior.";
  const adherenceLine =
    adherence >= 4
      ? "Sua aderência está ótima essa semana, continue assim."
      : adherence === 3
        ? "A aderência ficou mediana — se puder, tenta deixar as refeições mais organizadas na próxima semana."
        : "A aderência caiu um pouco essa semana. Vamos conversar sobre o que travou pra ajustar o plano.";
  const focusByObjective = {
    emagrecimento:
      "Mantenha o déficit calórico e o cardio na frequência combinada. Priorize proteína em todas as refeições.",
    hipertrofia:
      "Continue priorizando a progressão de carga nos exercícios principais e garanta o superávit calórico nos dias de treino.",
    "recomposição":
      "Mantenha o treino de força em dia e o consumo de proteína alto — a composição corporal muda devagar, o importante é a consistência.",
  };
  const closing = isFinalWeek
    ? `Bom trabalho, ${firstName}! Ciclo fechado com consistência.`
    : `Vamos pra semana ${week + 1}, ${firstName}.`;
  return [
    `Oi ${firstName}, avaliei seu check-in da semana ${week}.`,
    weightLine,
    adherenceLine,
    focusByObjective[student.objective] ?? focusByObjective.emagrecimento,
    closing,
  ].join(" ");
}

function coachNoteFor(student, week, adherence) {
  if (adherence <= 2) return `Semana ${week}: observar de perto, aderência baixa — considerar ligar para o aluno.`;
  if (adherence >= 5) return `Semana ${week}: aluno muito consistente, manter o plano atual.`;
  return `Semana ${week}: acompanhar normalmente.`;
}

// ============================================================================
// Tendências de métricas por objetivo (determinístico)
// ============================================================================

const OBJECTIVE_TRENDS = {
  emagrecimento: { weight: -0.4, waist: -0.25, hip: -0.15 },
  hipertrofia: { weight: 0.15, waist: 0.04, hip: 0.03 },
  "recomposição": { weight: -0.05, waist: -0.15, hip: -0.05 },
};

function metricsForWeek(student, week) {
  const trend = OBJECTIVE_TRENDS[student.objective] ?? OBJECTIVE_TRENDS.emagrecimento;
  const osc = Math.sin(week * 1.3) * 0.15;
  const weight = round1(student.baseline.weight + trend.weight * (week - 1) + osc);
  const waist = round1(student.baseline.waist + trend.waist * (week - 1) + osc * 0.5);
  const hip = round1(student.baseline.hip + trend.hip * (week - 1) + osc * 0.3);

  let adherence;
  if (student.adherenceOverride) {
    adherence = student.adherenceOverride[Math.min(week, student.adherenceOverride.length) - 1];
  } else {
    adherence = clamp(Math.round((student.baseAdherence ?? 4) + Math.sin(week * 0.7) * 0.9), 1, 5);
  }
  const energy = clamp(Math.round((student.baseEnergy ?? 4) + Math.cos(week * 0.5) * 0.8), 1, 5);

  return { weight, waist, hip, adherence, energy };
}

// ============================================================================
// Alunos de demo
// ============================================================================

const STUDENTS = [
  {
    key: "ana",
    name: "Ana Beatriz Ferreira",
    email: "ana.ferreira@trackly.test",
    phone: "(11) 99999-1001",
    gender: "feminino",
    age: 29,
    height_cm: 165,
    objective: "emagrecimento",
    pastWeeks: 9,
    offset: 1,
    state: "pending",
    payment: "em_dia",
    login: false,
    baseline: { weight: 82.0, waist: 88, hip: 104 },
    baseAdherence: 4.3,
    hasGoal: true,
  },
  {
    key: "carlos",
    name: "Carlos Eduardo Lima",
    email: "carlos.lima@trackly.test",
    phone: "(21) 99999-1002",
    gender: "masculino",
    age: 34,
    height_cm: 178,
    objective: "hipertrofia",
    pastWeeks: 7,
    offset: 2,
    state: "in_progress",
    payment: "pendente",
    login: true,
    baseline: { weight: 74.0, waist: 84, hip: 98 },
    baseAdherence: 4.5,
    hasGoal: true,
  },
  {
    key: "marina",
    name: "Marina Souza Costa",
    email: "marina.costa@trackly.test",
    phone: "(31) 99999-1003",
    gender: "feminino",
    age: 27,
    height_cm: 160,
    objective: "recomposição",
    pastWeeks: 5,
    offset: 3,
    state: "draft",
    payment: "atrasado",
    login: false,
    baseline: { weight: 63.0, waist: 72, hip: 98 },
    baseAdherence: 4.0,
  },
  {
    key: "rafael",
    name: "Rafael Nascimento Alves",
    email: "rafael.alves@trackly.test",
    phone: "(41) 99999-1004",
    gender: "masculino",
    age: 24,
    height_cm: 182,
    objective: "hipertrofia",
    pastWeeks: 11,
    offset: 2,
    state: "awaiting_checkin",
    payment: "em_dia",
    login: true,
    baseline: { weight: 70.0, waist: 80, hip: 96 },
    baseAdherence: 4.2,
  },
  {
    key: "juliana",
    name: "Juliana Martins Rocha",
    email: "juliana.rocha@trackly.test",
    phone: "(51) 99999-1005",
    gender: "feminino",
    age: 38,
    height_cm: 168,
    objective: "emagrecimento",
    pastWeeks: 8,
    offset: 2,
    state: "done",
    payment: "atrasado",
    login: false,
    baseline: { weight: 90.0, waist: 98, hip: 112 },
    baseAdherence: 3.8,
  },
  {
    key: "bruno",
    name: "Bruno Henrique Tavares",
    email: "bruno.tavares@trackly.test",
    phone: "(61) 99999-1006",
    gender: "masculino",
    age: 31,
    height_cm: 175,
    objective: "emagrecimento",
    pastWeeks: 4,
    offset: 6,
    state: "awaiting_checkin_late",
    payment: "pendente",
    login: false,
    baseline: { weight: 95.0, waist: 102, hip: 108 },
    adherenceOverride: [5, 4, 3, 2],
  },
  {
    key: "patricia",
    name: "Patrícia Gomes Barbosa",
    email: "patricia.barbosa@trackly.test",
    phone: "(71) 99999-1007",
    gender: "feminino",
    age: 26,
    height_cm: 163,
    objective: "recomposição",
    state: "invite_pending",
    payment: "sem_assinatura",
    login: false,
  },
  {
    key: "fernanda",
    name: "Fernanda Oliveira Dias",
    email: "fernanda.dias@trackly.test",
    phone: "(81) 99999-1008",
    gender: "feminino",
    age: 42,
    height_cm: 170,
    objective: "hipertrofia",
    pastWeeks: 6,
    offset: 3,
    state: "paused",
    payment: "cancelled",
    login: false,
    baseline: { weight: 68.0, waist: 78, hip: 100 },
    baseAdherence: 4.0,
  },
];

const LOGIN_STUDENTS = STUDENTS.filter((s) => s.login);

// ============================================================================
// Auth users de demo (2 logins)
// ============================================================================

async function findAuthUserByEmail(email) {
  const perPage = 200;
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers falhou: ${error.message}`);
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function deleteAuthUserByEmail(email) {
  const user = await findAuthUserByEmail(email);
  if (!user) return false;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUser(${email}) falhou: ${error.message}`);
  return true;
}

async function createAuthUserForStudent(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: STUDENT_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser(${email}) falhou: ${error?.message ?? "erro desconhecido"}`);
  }
  return data.user;
}

// ============================================================================
// 1) Coach + conta + template de check-in
// ============================================================================

async function findCoach() {
  const { data, error } = await admin
    .from("coach_users")
    .select("id, name, email, account_id")
    .eq("email", COACH_EMAIL)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar o coach: ${error.message}`);
  if (!data) {
    throw new Error(
      `Coach "${COACH_EMAIL}" não encontrado em coach_users. Crie a conta de teste (cadastro do coach) antes de rodar este script.`
    );
  }
  return data;
}

async function findTemplate(accountId) {
  const { data: template, error: templateError } = await admin
    .from("checkin_templates")
    .select("id, name")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (templateError) throw new Error(`Falha ao buscar o template de check-in: ${templateError.message}`);
  if (!template) {
    throw new Error("Nenhum checkin_templates encontrado para esta conta. Verifique o cadastro do coach.");
  }

  const { data: questions, error: questionsError } = await admin
    .from("checkin_questions")
    .select("id, key, label, type, unit")
    .eq("template_id", template.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (questionsError) throw new Error(`Falha ao buscar as perguntas do check-in: ${questionsError.message}`);

  return { template, questions: questions ?? [] };
}

// ============================================================================
// 2) Limpeza (re-runnable)
// ============================================================================

async function cleanup(accountId) {
  logStep("Limpeza (dados de demo anteriores desta conta)");

  const { data: existingClients, error: existingError } = await admin
    .from("clients")
    .select("id")
    .eq("account_id", accountId);
  if (existingError) throw new Error(`Falha ao listar alunos existentes: ${existingError.message}`);

  if (existingClients && existingClients.length > 0) {
    const ids = existingClients.map((c) => c.id);
    console.log(`Apagando ${ids.length} aluno(s) existente(s) desta conta (cascata cuida do resto)...`);
    const { error: delError } = await admin.from("clients").delete().in("id", ids);
    if (delError) throw new Error(`Falha ao apagar alunos existentes: ${delError.message}`);
  } else {
    console.log("Nenhum aluno existente nesta conta.");
  }

  // Biblioteca da conta (não é filha de `clients`, precisa apagar à parte).
  for (const table of ["workout_plans", "nutrition_plans"]) {
    // Templates de treino/nutrição da conta (client_id null) também são demo — apaga se houver.
    const { error } = await admin.from(table).delete().eq("account_id", accountId);
    if (error && error.code !== "42703" && error.code !== "42P01" && error.code !== "PGRST205") {
      throw new Error(`Falha ao limpar templates em ${table}: ${error.message}`);
    }
  }
  {
    const { error } = await admin.from("exercises").delete().eq("account_id", accountId);
    if (error) throw new Error(`Falha ao limpar exercises: ${error.message}`);
  }
  {
    const { error } = await admin.from("foods").delete().eq("account_id", accountId);
    if (error) throw new Error(`Falha ao limpar foods: ${error.message}`);
  }
  {
    const { error } = await admin.from("plan_change_logs").delete().eq("account_id", accountId);
    if (error && error.code !== "42703" && error.code !== "42P01" && error.code !== "PGRST205") {
      throw new Error(`Falha ao limpar plan_change_logs: ${error.message}`);
    }
  }

  for (const student of LOGIN_STUDENTS) {
    const removed = await deleteAuthUserByEmail(student.email);
    console.log(`Auth user ${student.email}: ${removed ? "removido" : "não existia"}.`);
  }

  console.log("Limpeza concluída.");
}

// ============================================================================
// 3) Schema probing (0003–0008) — hoje devem estar todas aplicadas, mas o script segue
//    probing pra continuar funcionando caso rode contra um banco mais antigo.
// ============================================================================

async function probeSchema() {
  const probes = {
    workoutPlansLifecycle: await columnExists("workout_plans", "is_template"),
    exercisesExtra: await columnExists("exercises", "muscle_group"),
    nutritionPlansLifecycle: await columnExists("nutrition_plans", "is_template"),
    foodsCategory: await columnExists("foods", "category"),
    mealsExtra: await columnExists("meals", "day_of_week"),
    mealItemsExtra: await columnExists("meal_items", "quantity"),
    mealItemsSortOrder: await columnExists("meal_items", "sort_order"),
    workoutSessions: await tableExists("workout_sessions"),
    mealLogs: await tableExists("meal_logs"),
    waterLogs: await tableExists("water_logs"),
    clientMetricSettings: await tableExists("client_metric_settings"),
    planChangeLogs: await tableExists("plan_change_logs"),
    publishWorkoutRpc: null, // checado sob demanda (chamado só quando workoutPlansLifecycle = true)
  };
  return probes;
}

// ============================================================================
// 4) Clientes
// ============================================================================

async function buildClientRows(coach, authUserByKey) {
  const rows = [];
  for (const student of STUDENTS) {
    if (student.state === "invite_pending") {
      rows.push({
        key: student.key,
        account_id: coach.account_id,
        coach_id: coach.id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        gender: student.gender,
        age: student.age,
        height_cm: student.height_cm,
        objective: student.objective,
        start_date: null,
        status: "active",
        invite_status: "pending",
        invited_at: null,
        activated_at: null,
      });
      continue;
    }

    const startDate = startDateFor(student.pastWeeks, student.offset);
    const authUser = authUserByKey.get(student.key) ?? null;

    rows.push({
      key: student.key,
      account_id: coach.account_id,
      coach_id: coach.id,
      auth_user_id: authUser?.id ?? null,
      name: student.name,
      email: student.email,
      phone: student.phone,
      gender: student.gender,
      age: student.age,
      height_cm: student.height_cm,
      objective: student.objective,
      start_date: startDate,
      status: student.state === "paused" ? "paused" : "active",
      invite_status: "active",
      invited_at: atTime(startDate, 9, 0),
      activated_at: atTime(startDate, 9, 30),
    });
  }
  return rows;
}

// ============================================================================
// 5) Check-ins, métricas, orientações, histórico, metas — por aluno
// ============================================================================

function buildCheckinInstanceRows(student, clientId, templateId) {
  const rows = [];
  if (student.state === "invite_pending") return rows;

  const startDate = startDateFor(student.pastWeeks, student.offset);

  // Semanas passadas: ciclo completo (submitted -> reviewed).
  for (let w = 1; w <= student.pastWeeks; w++) {
    const periodStart = addDaysUTC(startDate, (w - 1) * 7);
    const periodEnd = addDaysUTC(periodStart, 6);
    const submittedAt = atTime(addDaysUTC(periodStart, 2), 19, 30);
    const reviewOpenedAt = atTime(addDaysUTC(periodStart, 3), 10, 15);
    const reviewedAt = atTime(addDaysUTC(periodStart, 3), 18, 45);
    rows.push({
      __week: w,
      __kind: "past",
      client_id: clientId,
      template_id: templateId,
      week_number: w,
      period_start: periodStart,
      period_end: periodEnd,
      status: "reviewed",
      submitted_at: submittedAt,
      review_opened_at: reviewOpenedAt,
      reviewed_at: reviewedAt,
    });
  }

  // Semana corrente: depende do estado alvo deste aluno.
  const currentWeek = student.pastWeeks + 1;
  const periodStart = addDaysUTC(startDate, student.pastWeeks * 7);
  const periodEnd = addDaysUTC(periodStart, 6);
  const today = addDaysUTC(periodStart, student.offset);

  if (student.state === "pending") {
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "submitted",
      submitted_at: atTime(today, 18, 0),
      review_opened_at: null,
      reviewed_at: null,
    });
  } else if (student.state === "in_progress") {
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "submitted",
      submitted_at: atTime(addDaysUTC(today, -1), 19, 0),
      review_opened_at: atTime(today, 9, 0),
      reviewed_at: null,
    });
  } else if (student.state === "draft") {
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "submitted",
      submitted_at: atTime(addDaysUTC(today, -2), 19, 0),
      review_opened_at: atTime(addDaysUTC(today, -1), 10, 0),
      reviewed_at: null,
    });
  } else if (student.state === "done") {
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "reviewed",
      submitted_at: atTime(addDaysUTC(today, -1), 19, 0),
      review_opened_at: atTime(today, 9, 0),
      reviewed_at: atTime(today, 11, 0),
    });
  } else if (student.state === "awaiting_checkin_late") {
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "late",
      submitted_at: null,
      review_opened_at: null,
      reviewed_at: null,
    });
  }
  // "awaiting_checkin" (não atrasado) e "paused": nenhuma linha pra semana corrente.

  return rows;
}

// ============================================================================
// main
// ============================================================================

async function main() {
  logStep("Coach e template de check-in");
  const coach = await findCoach();
  console.log(`Coach: ${coach.name} <${coach.email}> — account_id ${coach.account_id}`);
  const { template, questions } = await findTemplate(coach.account_id);
  console.log(`Template "${template.name}" com ${questions.length} pergunta(s) ativa(s): ${questions.map((q) => q.key).join(", ")}`);

  const schema = await probeSchema();
  console.log("Schema detectado:", schema);

  await cleanup(coach.account_id);

  // -- Auth users dos 2 logins --------------------------------------------
  logStep("Criando logins de aluno");
  const authUserByKey = new Map();
  for (const student of LOGIN_STUDENTS) {
    const user = await createAuthUserForStudent(student.email);
    authUserByKey.set(student.key, user);
    console.log(`Login criado: ${student.email} (senha em DEMO_STUDENT_PASSWORD)`);
  }

  // -- Clientes -------------------------------------------------------------
  logStep("Criando alunos");
  const clientRows = await buildClientRows(coach, authUserByKey);
  const insertedClients = await insertMany(
    "clients",
    clientRows.map(({ key, ...row }) => row)
  );
  // Reconstrói o mapeamento key -> cliente inserido via e-mail (determinístico).
  const emailToKey = new Map(STUDENTS.map((s) => [s.email, s.key]));
  const clientByKey = new Map();
  for (const row of insertedClients) {
    const key = emailToKey.get(row.email);
    clientByKey.set(key, row);
  }
  console.log(`${insertedClients.length} aluno(s) criado(s).`);

  // Vincula auth_user_id -> clients.id nos 2 logins (necessário pra portal localizar o aluno).
  for (const student of LOGIN_STUDENTS) {
    const client = clientByKey.get(student.key);
    const user = authUserByKey.get(student.key);
    const { error } = await admin.from("clients").update({ auth_user_id: user.id }).eq("id", client.id);
    if (error) throw new Error(`Falha ao vincular auth_user_id de ${student.email}: ${error.message}`);
  }

  // -- Check-ins (instâncias) -----------------------------------------------
  logStep("Criando check-ins (semanas passadas + semana corrente)");
  const instanceIdByClientWeek = new Map(); // `${clientId}:${week}` -> instance id
  const allAnswers = [];
  const allMetrics = [];
  const allOrientations = [];
  const allHistoryEvents = [];
  const allGoals = [];

  for (const student of STUDENTS) {
    const client = clientByKey.get(student.key);
    if (!client) continue;
    const instanceRows = buildCheckinInstanceRows(student, client.id, template.id);
    if (instanceRows.length === 0) continue;

    const toInsert = instanceRows.map(({ __week, __kind, ...row }) => row);
    const inserted = await insertMany("checkin_instances", toInsert, "id, week_number");
    for (const row of inserted) {
      instanceIdByClientWeek.set(`${client.id}:${row.week_number}`, row.id);
    }

    for (const meta of instanceRows) {
      const checkinId = instanceIdByClientWeek.get(`${client.id}:${meta.__week}`);
      const hasAnswers =
        meta.status === "submitted" || meta.status === "reviewed";
      const m = metricsForWeek(student, meta.__week);

      if (hasAnswers) {
        for (const q of questions) {
          let value = null;
          if (q.key === "weight_kg") value = m.weight.toFixed(1);
          else if (q.key === "adherence_pct") value = String(m.adherence);
          else if (q.key === "energy") value = String(m.energy);
          else if (q.key === "notes") value = notesFor(student.objective, meta.__week);
          if (value == null) continue;
          allAnswers.push({ checkin_id: checkinId, question_key: q.key, value });
        }

        allMetrics.push(
          { client_id: client.id, week_number: meta.__week, key: "weight_kg", value: m.weight },
          { client_id: client.id, week_number: meta.__week, key: "waist_cm", value: m.waist },
          { client_id: client.id, week_number: meta.__week, key: "hip_cm", value: m.hip },
          { client_id: client.id, week_number: meta.__week, key: "energy", value: m.energy }
        );
      }

      if (meta.status === "reviewed" || (meta.__kind === "current" && student.state === "draft")) {
        const isDraft = meta.__kind === "current" && student.state === "draft";
        const prevWeekMetrics = meta.__week > 1 ? metricsForWeek(student, meta.__week - 1) : null;
        const text = buildOrientationText(
          student,
          meta.__week,
          m.weight,
          prevWeekMetrics?.weight ?? null,
          m.adherence,
          meta.__kind === "current" && student.state === "done"
        );
        allOrientations.push({
          client_id: client.id,
          week_number: meta.__week,
          author_id: coach.id,
          text: isDraft ? `[RASCUNHO] ${text}` : text,
          focus_override: null,
          coach_note: coachNoteFor(student, meta.__week, m.adherence),
          is_draft: isDraft,
          created_at: isDraft ? atTime(addDaysUTC(meta.period_start, student.offset ?? 0), 9, 0) : meta.reviewed_at,
          sent_at: isDraft ? null : meta.reviewed_at,
        });

        if (meta.status === "reviewed") {
          allHistoryEvents.push({
            client_id: client.id,
            event_date: meta.reviewed_at,
            type: "checkin",
            title: `Semana ${meta.__week} concluída — orientação enviada`,
            description: "O check-in foi avaliado pelo coach e a orientação da semana foi enviada.",
          });
        }
      }
    }

    // Metas (goals) — só pra 2 alunos, últimas 3 semanas passadas, pra ilustrar a aba de
    // avaliação e o insight de "meta recorrente".
    if (student.hasGoal && student.pastWeeks >= 3) {
      const direction = student.objective === "hipertrofia" ? 1 : -1;
      for (let w = student.pastWeeks - 2; w <= student.pastWeeks; w++) {
        const m = metricsForWeek(student, w);
        const target = round1(m.weight + direction * 0.5);
        const hit = direction === -1 ? m.weight <= target + 0.3 : m.weight >= target - 0.3;
        allGoals.push({
          client_id: client.id,
          week_number: w,
          metric_key: "weight_kg",
          label: student.objective === "hipertrofia" ? "Ganhar massa" : "Perder peso",
          target_value: target,
          unit: "kg",
          result_value: m.weight,
          result_status: hit ? "success" : "partial",
          created_at: atTime(addDaysUTC(startDateFor(student.pastWeeks, student.offset), (w - 1) * 7 + 1), 8, 0),
        });
      }
    }
  }

  await insertMany("checkin_answers", allAnswers);
  console.log(`${allAnswers.length} resposta(s) de check-in.`);
  await insertMany("metrics", allMetrics);
  console.log(`${allMetrics.length} métrica(s).`);
  await insertMany("orientations", allOrientations);
  console.log(`${allOrientations.length} orientação(ões).`);
  await insertMany("history_events", allHistoryEvents);
  console.log(`${allHistoryEvents.length} evento(s) de histórico.`);
  await insertMany("goals", allGoals);
  console.log(`${allGoals.length} meta(s).`);

  // -- client_metric_settings (0005) — opcional, só se a tabela existir --------
  if (schema.clientMetricSettings) {
    logStep("Configurando metas de métrica por aluno (client_metric_settings)");
    const ana = clientByKey.get("ana");
    const carlos = clientByKey.get("carlos");
    const fernanda = clientByKey.get("fernanda");
    const rows = [];
    if (ana) {
      const anaStudent = STUDENTS.find((s) => s.key === "ana");
      const lastWeekMetrics = metricsForWeek(anaStudent, anaStudent.pastWeeks);
      rows.push({
        client_id: ana.id,
        metric_key: "weight_kg",
        source: "catalog",
        tracked: true,
        target_value: round1(lastWeekMetrics.weight - 3),
        goal_direction: "decrease",
      });
    }
    if (carlos) {
      const carlosStudent = STUDENTS.find((s) => s.key === "carlos");
      const lastWeekMetrics = metricsForWeek(carlosStudent, carlosStudent.pastWeeks);
      rows.push({
        client_id: carlos.id,
        metric_key: "weight_kg",
        source: "catalog",
        tracked: true,
        target_value: round1(lastWeekMetrics.weight + 2),
        goal_direction: "increase",
      });
    }
    if (fernanda) {
      rows.push({
        client_id: fernanda.id,
        metric_key: "hip_cm",
        source: "catalog",
        tracked: false,
        target_value: null,
        goal_direction: null,
      });
    }
    await insertMany("client_metric_settings", rows);
    console.log(`${rows.length} configuração(ões) de métrica (o trigger da 0006 grava o histórico sozinho, se existir).`);
  } else {
    console.log("client_metric_settings não existe nesta base — pulado.");
  }

  // -- Pagamentos -------------------------------------------------------------
  logStep("Criando assinaturas e pagamentos");
  const PAYMENT_PLANS = {
    ana: { plan_name: "Acompanhamento Mensal", price_cents: 19900, period: "monthly" },
    carlos: { plan_name: "Acompanhamento Trimestral", price_cents: 59700, period: "quarterly" },
    marina: { plan_name: "Acompanhamento Mensal", price_cents: 15900, period: "monthly" },
    rafael: { plan_name: "Acompanhamento Mensal", price_cents: 17900, period: "monthly" },
    juliana: { plan_name: "Acompanhamento Semestral", price_cents: 99000, period: "semiannual" },
    bruno: { plan_name: "Acompanhamento Mensal", price_cents: 18900, period: "monthly" },
    fernanda: { plan_name: "Acompanhamento Mensal", price_cents: 14900, period: "monthly" },
  };
  const subscriptionRows = [];
  for (const [key, plan] of Object.entries(PAYMENT_PLANS)) {
    const client = clientByKey.get(key);
    if (!client) continue;
    subscriptionRows.push({
      __key: key,
      client_id: client.id,
      plan_name: plan.plan_name,
      price_cents: plan.price_cents,
      period: plan.period,
      status: key === "fernanda" ? "cancelled" : "active",
    });
  }
  const insertedSubs = await insertMany(
    "subscriptions",
    subscriptionRows.map(({ __key, ...row }) => row),
    "id, client_id"
  );
  const subIdByKey = new Map();
  for (const row of insertedSubs) {
    const key = subscriptionRows.find((s) => s.client_id === row.client_id)?.__key;
    subIdByKey.set(key, row.id);
  }

  const paymentRows = [];
  function addPastPayments(key, monthsBack, method) {
    const subId = subIdByKey.get(key);
    const plan = PAYMENT_PLANS[key];
    if (!subId) return;
    for (const n of monthsBack) {
      const due = monthsAgoDate(n, 8);
      paymentRows.push({
        subscription_id: subId,
        due_date: due,
        paid_date: due,
        amount_cents: plan.price_cents,
        status: "paid",
        method,
      });
    }
  }
  addPastPayments("ana", [3, 2, 1], "pix");
  addPastPayments("carlos", [3], "cartão");
  addPastPayments("marina", [2, 1], "pix");
  addPastPayments("rafael", [3, 2, 1], "transferência");
  addPastPayments("juliana", [6], "pix");
  addPastPayments("bruno", [1], "cartão");
  addPastPayments("fernanda", [3, 2], "pix");

  function addPendingPayment(key, dueInDays) {
    if (dueInDays == null) return; // ex.: "em dia" — nenhuma cobrança pendente.
    const subId = subIdByKey.get(key);
    const plan = PAYMENT_PLANS[key];
    if (!subId) return;
    paymentRows.push({
      subscription_id: subId,
      due_date: addDaysUTC(isoDate(TODAY), dueInDays),
      paid_date: null,
      amount_cents: plan.price_cents,
      status: "pending",
      method: null,
    });
  }
  addPendingPayment("carlos", 12);
  addPendingPayment("marina", -6);
  addPendingPayment("rafael", null); // em dia — sem cobrança pendente
  addPendingPayment("juliana", -25);
  addPendingPayment("bruno", 20);

  const cleanPaymentRows = paymentRows.filter((p) => p.due_date != null);
  await insertMany("payments", cleanPaymentRows);
  console.log(`${insertedSubs.length} assinatura(s), ${cleanPaymentRows.length} pagamento(s).`);

  // -- Biblioteca: exercícios e alimentos --------------------------------------
  logStep("Criando biblioteca de exercícios e alimentos");
  const EXERCISES = [
    { name: "Supino reto", category: "Peito", muscle_group: "peito", equipment: "barra" },
    { name: "Supino inclinado halteres", category: "Peito", muscle_group: "peito", equipment: "halteres" },
    { name: "Agachamento livre", category: "Pernas", muscle_group: "quadríceps", equipment: "barra" },
    { name: "Levantamento terra", category: "Pernas", muscle_group: "posterior de coxa", equipment: "barra" },
    { name: "Puxada frontal", category: "Costas", muscle_group: "costas", equipment: "polia" },
    { name: "Remada curvada", category: "Costas", muscle_group: "costas", equipment: "barra" },
    { name: "Desenvolvimento militar", category: "Ombro", muscle_group: "ombro", equipment: "barra" },
    { name: "Rosca direta", category: "Braço", muscle_group: "bíceps", equipment: "barra" },
    { name: "Tríceps corda", category: "Braço", muscle_group: "tríceps", equipment: "polia" },
    { name: "Cadeira extensora", category: "Pernas", muscle_group: "quadríceps", equipment: "máquina" },
    { name: "Panturrilha em pé", category: "Pernas", muscle_group: "panturrilha", equipment: "máquina" },
  ];
  const exerciseRowsToInsert = EXERCISES.map((e) => {
    const row = { account_id: coach.account_id, name: e.name, category: e.category, instruction: null, video_url: null };
    if (schema.exercisesExtra) {
      row.muscle_group = e.muscle_group;
      row.equipment = e.equipment;
      row.is_custom = true;
      row.is_archived = false;
    }
    return row;
  });
  const insertedExercises = await insertMany("exercises", exerciseRowsToInsert, "id, name");
  const exerciseIdByName = new Map(insertedExercises.map((e) => [e.name, e.id]));
  console.log(`${insertedExercises.length} exercício(s) na biblioteca.`);

  const FOODS = [
    { name: "Arroz branco cozido", unit: "g", category: "Carboidrato", macros: { kcal: 128, protein: 2.5, carbs: 28, fat: 0.2 } },
    { name: "Feijão carioca cozido", unit: "g", category: "Carboidrato", macros: { kcal: 76, protein: 4.8, carbs: 13.6, fat: 0.5 } },
    { name: "Peito de frango grelhado", unit: "g", category: "Proteína", macros: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } },
    { name: "Batata doce cozida", unit: "g", category: "Carboidrato", macros: { kcal: 86, protein: 1.6, carbs: 20, fat: 0.1 } },
    { name: "Ovo cozido", unit: "un", category: "Proteína", macros: { kcal: 78, protein: 6.3, carbs: 0.6, fat: 5.3 } },
    { name: "Whey protein (dose)", unit: "scoop", category: "Proteína", macros: { kcal: 120, protein: 24, carbs: 3, fat: 1.5 } },
    { name: "Aveia em flocos", unit: "g", category: "Carboidrato", macros: { kcal: 389, protein: 13.9, carbs: 66.3, fat: 6.9 } },
    { name: "Banana prata", unit: "un", category: "Fruta", macros: { kcal: 98, protein: 1.3, carbs: 26, fat: 0.2 } },
  ];
  const foodRowsToInsert = FOODS.map((f) => {
    const row = { account_id: coach.account_id, name: f.name, unit: f.unit, macros: f.macros };
    if (schema.foodsCategory) {
      row.category = f.category;
      row.is_archived = false;
    }
    return row;
  });
  const insertedFoods = await insertMany("foods", foodRowsToInsert, "id, name");
  const foodIdByName = new Map(insertedFoods.map((f) => [f.id ? f.name : null, f.id]));
  const foodByName = new Map(insertedFoods.map((f) => [f.name, f]));
  console.log(`${insertedFoods.length} alimento(s) na biblioteca.`);

  // -- Treino e nutrição para os 2 alunos com login ----------------------------
  const planChangeLogRows = [];

  async function createWorkoutPlanFor(student, planName, description, days) {
    const client = clientByKey.get(student.key);
    const workoutPlanRow = { client_id: client.id, name: planName, is_draft: true };
    if (schema.workoutPlansLifecycle) workoutPlanRow.description = description;
    const { data: plan, error: planError } = await admin
      .from("workout_plans")
      .insert(workoutPlanRow)
      .select("*")
      .single();
    if (planError) throw new Error(`Falha ao criar plano de treino: ${planError.message}`);

    for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
      const day = days[dayIdx];
      const { data: dayRow, error: dayError } = await admin
        .from("workout_days")
        .insert({ plan_id: plan.id, name: day.name, duration_min: day.duration_min, sort_order: dayIdx })
        .select("*")
        .single();
      if (dayError) throw new Error(`Falha ao criar dia de treino: ${dayError.message}`);

      const exerciseRows = day.exercises.map((ex, idx) => {
        const row = {
          day_id: dayRow.id,
          exercise_id: exerciseIdByName.get(ex.name),
          sets: ex.sets,
          reps: ex.reps,
          rest_sec: ex.rest_sec,
          rir: ex.rir ?? null,
          notes: null,
          sort_order: idx,
        };
        return row;
      });
      await insertMany("workout_exercises", exerciseRows);
      day.__dayId = dayRow.id;
    }

    planChangeLogRows.push({
      account_id: coach.account_id,
      client_id: client.id,
      plan_kind: "workout",
      plan_id: plan.id,
      actor_id: coach.id,
      actor_name: coach.name,
      action: "created",
      entity: "plan",
      entity_id: plan.id,
      summary: `Criou o rascunho "${planName}".`,
    });

    if (schema.workoutPlansLifecycle) {
      const { error: publishError } = await admin.rpc("publish_workout_plan", { p_plan_id: plan.id });
      if (publishError) {
        console.warn(`Aviso: não foi possível publicar o treino de ${student.name} via RPC: ${publishError.message}. Publicando via UPDATE direto.`);
        await admin.from("workout_plans").update({ is_draft: false }).eq("id", plan.id);
      }
      planChangeLogRows.push({
        account_id: coach.account_id,
        client_id: client.id,
        plan_kind: "workout",
        plan_id: plan.id,
        actor_id: coach.id,
        actor_name: coach.name,
        action: "published",
        entity: "plan",
        entity_id: plan.id,
        summary: `Publicou "${planName}".`,
      });
    } else {
      await admin.from("workout_plans").update({ is_draft: false }).eq("id", plan.id);
    }

    return { plan, days };
  }

  async function createNutritionPlanFor(student, planName, description, meals) {
    const client = clientByKey.get(student.key);
    const nutritionPlanRow = { client_id: client.id, name: planName, is_draft: true };
    if (schema.nutritionPlansLifecycle) nutritionPlanRow.description = description;
    const { data: plan, error: planError } = await admin
      .from("nutrition_plans")
      .insert(nutritionPlanRow)
      .select("*")
      .single();
    if (planError) throw new Error(`Falha ao criar plano de nutrição: ${planError.message}`);

    for (let mealIdx = 0; mealIdx < meals.length; mealIdx++) {
      const meal = meals[mealIdx];
      const { data: mealRow, error: mealError } = await admin
        .from("meals")
        .insert({ plan_id: plan.id, name: meal.name, time: meal.time, sort_order: mealIdx })
        .select("*")
        .single();
      if (mealError) throw new Error(`Falha ao criar refeição: ${mealError.message}`);
      meal.__mealId = mealRow.id;

      const itemRows = meal.items.map((item, idx) => {
        const food = foodByName.get(item.foodName);
        const qty = `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`;
        const row = {
          meal_id: mealRow.id,
          food_id: food?.id ?? null,
          qty,
          macros: food?.macros ?? {},
        };
        if (schema.mealItemsSortOrder) row.sort_order = idx;
        if (schema.mealItemsExtra) {
          row.quantity = item.quantity;
          row.unit = item.unit;
        }
        return row;
      });
      await insertMany("meal_items", itemRows);
    }

    planChangeLogRows.push({
      account_id: coach.account_id,
      client_id: client.id,
      plan_kind: "nutrition",
      plan_id: plan.id,
      actor_id: coach.id,
      actor_name: coach.name,
      action: "created",
      entity: "plan",
      entity_id: plan.id,
      summary: `Criou o rascunho "${planName}".`,
    });

    if (schema.nutritionPlansLifecycle) {
      const { error: publishError } = await admin.rpc("publish_nutrition_plan", { p_plan_id: plan.id });
      if (publishError) {
        console.warn(`Aviso: não foi possível publicar a nutrição de ${student.name} via RPC: ${publishError.message}. Publicando via UPDATE direto.`);
        await admin.from("nutrition_plans").update({ is_draft: false }).eq("id", plan.id);
      }
      planChangeLogRows.push({
        account_id: coach.account_id,
        client_id: client.id,
        plan_kind: "nutrition",
        plan_id: plan.id,
        actor_id: coach.id,
        actor_name: coach.name,
        action: "published",
        entity: "plan",
        entity_id: plan.id,
        summary: `Publicou "${planName}".`,
      });
    } else {
      await admin.from("nutrition_plans").update({ is_draft: false }).eq("id", plan.id);
    }

    return { plan, meals };
  }

  logStep("Criando treino e nutrição para os alunos com login");

  const carlosStudent = STUDENTS.find((s) => s.key === "carlos");
  const carlosWorkout = await createWorkoutPlanFor(
    carlosStudent,
    "Treino Hipertrofia — Upper/Lower",
    "Divisão superior/inferior, foco em progressão de carga.",
    [
      {
        name: "Treino A — Superior",
        duration_min: 55,
        exercises: [
          { name: "Supino reto", sets: 4, reps: 8, rest_sec: 90, rir: 2 },
          { name: "Remada curvada", sets: 4, reps: 10, rest_sec: 90, rir: 2 },
          { name: "Desenvolvimento militar", sets: 3, reps: 10, rest_sec: 75, rir: 2 },
          { name: "Rosca direta", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
          { name: "Tríceps corda", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
        ],
      },
      {
        name: "Treino B — Inferior",
        duration_min: 50,
        exercises: [
          { name: "Agachamento livre", sets: 4, reps: 8, rest_sec: 120, rir: 2 },
          { name: "Levantamento terra", sets: 3, reps: 6, rest_sec: 120, rir: 2 },
          { name: "Cadeira extensora", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
          { name: "Panturrilha em pé", sets: 4, reps: 15, rest_sec: 45, rir: 1 },
        ],
      },
    ]
  );

  const rafaelStudent = STUDENTS.find((s) => s.key === "rafael");
  const rafaelWorkout = await createWorkoutPlanFor(
    rafaelStudent,
    "Treino Push/Pull/Legs",
    "Divisão em 3 dias, foco em volume moderado.",
    [
      {
        name: "Push",
        duration_min: 45,
        exercises: [
          { name: "Supino inclinado halteres", sets: 4, reps: 10, rest_sec: 75, rir: 2 },
          { name: "Desenvolvimento militar", sets: 3, reps: 10, rest_sec: 75, rir: 2 },
          { name: "Tríceps corda", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
        ],
      },
      {
        name: "Pull",
        duration_min: 45,
        exercises: [
          { name: "Puxada frontal", sets: 4, reps: 10, rest_sec: 75, rir: 2 },
          { name: "Remada curvada", sets: 3, reps: 10, rest_sec: 75, rir: 2 },
          { name: "Rosca direta", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
        ],
      },
      {
        name: "Legs",
        duration_min: 50,
        exercises: [
          { name: "Agachamento livre", sets: 4, reps: 8, rest_sec: 120, rir: 2 },
          { name: "Cadeira extensora", sets: 3, reps: 12, rest_sec: 60, rir: 1 },
          { name: "Panturrilha em pé", sets: 4, reps: 15, rest_sec: 45, rir: 1 },
        ],
      },
    ]
  );

  const nutritionMealsFor = () => [
    {
      name: "Café da manhã",
      time: "07:00",
      items: [
        { foodName: "Aveia em flocos", quantity: 60, unit: "g" },
        { foodName: "Banana prata", quantity: 1, unit: "un" },
        { foodName: "Ovo cozido", quantity: 2, unit: "un" },
      ],
    },
    {
      name: "Almoço",
      time: "12:00",
      items: [
        { foodName: "Arroz branco cozido", quantity: 150, unit: "g" },
        { foodName: "Feijão carioca cozido", quantity: 80, unit: "g" },
        { foodName: "Peito de frango grelhado", quantity: 150, unit: "g" },
      ],
    },
    {
      name: "Pós-treino",
      time: "16:00",
      items: [
        { foodName: "Whey protein (dose)", quantity: 1, unit: "scoop" },
        { foodName: "Banana prata", quantity: 1, unit: "un" },
      ],
    },
    {
      name: "Jantar",
      time: "20:00",
      items: [
        { foodName: "Batata doce cozida", quantity: 200, unit: "g" },
        { foodName: "Peito de frango grelhado", quantity: 150, unit: "g" },
      ],
    },
  ];

  const carlosNutrition = await createNutritionPlanFor(
    carlosStudent,
    "Plano Hipertrofia",
    "Superávit calórico moderado, proteína alta em todas as refeições.",
    nutritionMealsFor()
  );
  const rafaelNutrition = await createNutritionPlanFor(
    rafaelStudent,
    "Plano Hipertrofia",
    "Superávit calórico moderado, proteína alta em todas as refeições.",
    nutritionMealsFor()
  );

  if (schema.planChangeLogs) {
    await insertMany("plan_change_logs", planChangeLogRows);
    console.log(`${planChangeLogRows.length} linha(s) de plan_change_logs.`);
  } else {
    console.log("plan_change_logs não existe nesta base — pulado.");
  }

  // -- Sessão de treino + logs por série (0003) --------------------------------
  if (schema.workoutSessions) {
    logStep("Criando sessão de treino concluída (workout_sessions + workout_logs)");

    async function completeSessionFor(student, workoutInfo, dayIndex, daysAgo) {
      const client = clientByKey.get(student.key);
      const week = student.pastWeeks + 1;
      const day = workoutInfo.days[dayIndex];
      const startedAt = atTime(addDaysUTC(isoDate(TODAY), -daysAgo), 7, 0);
      const endedAt = atTime(addDaysUTC(isoDate(TODAY), -daysAgo), 7, day.duration_min ?? 50);

      const { data: session, error: sessionError } = await admin
        .from("workout_sessions")
        .insert({
          client_id: client.id,
          plan_id: workoutInfo.plan.id,
          day_id: day.__dayId,
          week_number: week,
          status: "completed",
          started_at: startedAt,
          ended_at: endedAt,
          summary: { dayName: day.name, exerciseCount: day.exercises.length },
          student_note: "Treino puxado, mas consegui terminar tudo.",
          perceived_effort: 8,
        })
        .select("*")
        .single();
      if (sessionError) throw new Error(`Falha ao criar workout_session: ${sessionError.message}`);

      const { data: dayExercises, error: dayExError } = await admin
        .from("workout_exercises")
        .select("id, exercise_id, sets, reps")
        .eq("day_id", day.__dayId)
        .order("sort_order", { ascending: true });
      if (dayExError) throw new Error(`Falha ao carregar exercícios do dia: ${dayExError.message}`);

      const setRows = [];
      for (const we of dayExercises ?? []) {
        const totalSets = we.sets ?? 3;
        for (let setNumber = 1; setNumber <= totalSets; setNumber++) {
          setRows.push({
            client_id: client.id,
            exercise_id: we.exercise_id,
            workout_exercise_id: we.id,
            session_id: session.id,
            set_number: setNumber,
            week_number: week,
            load: 20 + setNumber * 2.5,
            reps: we.reps ?? 10,
            perceived_rir: 2,
            completed_at: endedAt,
          });
        }
      }
      await insertMany("workout_logs", setRows);
      console.log(`Sessão concluída para ${student.name}: ${setRows.length} série(s) registrada(s).`);
    }

    await completeSessionFor(carlosStudent, carlosWorkout, 0, 2);
    await completeSessionFor(rafaelStudent, rafaelWorkout, 0, 1);
  } else {
    console.log("workout_sessions não existe nesta base — pulado (sem log de treino por série).");
  }

  // -- meal_logs / water_logs (0003) ------------------------------------------
  if (schema.mealLogs && schema.waterLogs) {
    logStep("Registrando aderência de refeições e água (meal_logs + water_logs)");

    async function logMealsAndWaterFor(student, nutritionInfo) {
      const client = clientByKey.get(student.key);
      const mealLogRows = [];
      const waterLogRows = [];
      for (let daysAgo = 0; daysAgo < 3; daysAgo++) {
        const logDate = addDaysUTC(isoDate(TODAY), -daysAgo);
        const breakfast = nutritionInfo.meals[0];
        const lunch = nutritionInfo.meals[1];
        mealLogRows.push({
          client_id: client.id,
          meal_id: breakfast.__mealId,
          meal_name: breakfast.name,
          log_date: logDate,
          status: daysAgo === 1 ? "partial" : "done",
        });
        mealLogRows.push({
          client_id: client.id,
          meal_id: lunch.__mealId,
          meal_name: lunch.name,
          log_date: logDate,
          status: "done",
        });
        waterLogRows.push({
          client_id: client.id,
          log_date: logDate,
          amount_ml: 1800 + daysAgo * 300,
        });
      }
      await insertMany("meal_logs", mealLogRows);
      await insertMany("water_logs", waterLogRows);
      console.log(`${student.name}: ${mealLogRows.length} registro(s) de refeição, ${waterLogRows.length} de água.`);
    }

    await logMealsAndWaterFor(carlosStudent, carlosNutrition);
    await logMealsAndWaterFor(rafaelStudent, rafaelNutrition);
  } else {
    console.log("meal_logs/water_logs não existem nesta base — pulado.");
  }

  // -- Notificações -------------------------------------------------------------
  logStep("Criando notificações");
  const notifications = [];
  function coachNotification(student, eventType, message, read) {
    const client = clientByKey.get(student.key);
    notifications.push({ client_id: client.id, event_type: eventType, recipient: "coach", message, read });
  }
  function clientNotification(student, eventType, message, read) {
    const client = clientByKey.get(student.key);
    notifications.push({ client_id: client.id, event_type: eventType, recipient: "client", message, read });
  }

  const ana = STUDENTS.find((s) => s.key === "ana");
  coachNotification(ana, "checkin_received", `${ana.name} enviou o check-in da semana ${ana.pastWeeks + 1}.`, false);

  const carlos = STUDENTS.find((s) => s.key === "carlos");
  coachNotification(carlos, "checkin_received", `${carlos.name} enviou o check-in da semana ${carlos.pastWeeks + 1}.`, true);

  const marina = STUDENTS.find((s) => s.key === "marina");
  coachNotification(marina, "checkin_received", `${marina.name} enviou o check-in da semana ${marina.pastWeeks + 1}.`, true);
  coachNotification(marina, "payment_overdue", `A cobrança de ${marina.name} está atrasada.`, false);

  const juliana = STUDENTS.find((s) => s.key === "juliana");
  coachNotification(juliana, "checkin_received", `${juliana.name} enviou o check-in da semana ${juliana.pastWeeks + 1}.`, true);
  coachNotification(juliana, "payment_overdue", `A cobrança de ${juliana.name} está atrasada.`, false);

  clientNotification(carlos, "orientation_ready", `Seu coach avaliou seu check-in da semana ${carlos.pastWeeks} e enviou a orientação.`, false);
  clientNotification(carlos, "workout_updated", "Seu treino foi atualizado.", false);
  clientNotification(carlos, "nutrition_updated", "Seu plano de nutrição foi atualizado.", true);

  const rafael = STUDENTS.find((s) => s.key === "rafael");
  clientNotification(rafael, "orientation_ready", `Seu coach avaliou seu check-in da semana ${rafael.pastWeeks} e enviou a orientação.`, true);
  clientNotification(rafael, "workout_updated", "Seu treino foi atualizado.", false);
  clientNotification(rafael, "nutrition_updated", "Seu plano de nutrição foi atualizado.", false);

  await insertMany("notifications", notifications);
  console.log(`${notifications.length} notificação(ões).`);

  // -- Contagens finais -----------------------------------------------------
  logStep("Contagens finais");
  const allClientIds = [...clientByKey.values()].map((c) => c.id);
  const inIds = (q) => q.in("client_id", allClientIds);

  const counts = {
    clients: await countRows("clients", (q) => q.eq("account_id", coach.account_id)),
    checkin_instances: await countRows("checkin_instances", inIds),
    checkin_answers: allAnswers.length, // sem account/client direto na tabela; usa o total inserido
    metrics: await countRows("metrics", inIds),
    orientations: await countRows("orientations", inIds),
    history_events: await countRows("history_events", inIds),
    goals: await countRows("goals", inIds),
    notifications: await countRows("notifications", inIds),
    subscriptions: await countRows("subscriptions", inIds),
    payments: cleanPaymentRows.length, // via subscription_id, não client_id direto
    exercises: await countRows("exercises", (q) => q.eq("account_id", coach.account_id)),
    foods: await countRows("foods", (q) => q.eq("account_id", coach.account_id)),
    workout_plans: await countRows("workout_plans", inIds),
    nutrition_plans: await countRows("nutrition_plans", inIds),
  };
  console.log(counts);

  console.log("\nSeed concluído com sucesso.");
  return counts;
}

main().catch((err) => {
  console.error("\nFALHA no seed:", err?.message ?? err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
