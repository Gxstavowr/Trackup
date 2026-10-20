#!/usr/bin/env node
// Trackly — seed de dados de DEMO para a conta de teste do coach (coach.teste@trackly.test).
//
// Re-executável: no início apaga SÓ os alunos desta conta (cascata cuida de check-ins,
// métricas, orientações, treino, nutrição, pagamentos, notificações etc.), a biblioteca de
// exercícios/alimentos desta conta e os 2 logins de aluno de demo (pelo e-mail fixo) — nunca
// toca em outra conta, no coach, nos templates de check-in ou em qualquer outro auth user.
//
// V5 (0022/0023): também marca esta conta como demo (`filled`), cria contratos de pacote, o aluno
// "Começar do zero" (aluno.zero@trackly.test), a conta coach "Começar do zero" (coach.vazio@trackly.test,
// `empty`, limpa a cada execução) e o registro `demo_lab_profiles` do laboratório. Pulado se as
// migrações não estiverem aplicadas.
//
// Uso: a partir de web/, `node scripts/seed-demo.mjs`.
//
// Faz probing de colunas/tabelas novas (migrations 0003–0008) antes de usá-las: se a migration
// ainda não tiver rodado contra o banco-alvo, o script detecta e insere só o que existe em
// 0001/0002, sem quebrar.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Mesma escala de macros que o app usa ao adicionar um item à refeição (lib/food-macros.ts —
// arquivo sem imports '@/', o Node 24 importa o .ts direto removendo os tipos).
const { scaleFoodMacros } = await import(pathToFileURL(path.join(ROOT, "lib", "food-macros.ts")).href);

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
// Opcional: quando definida, o seed redefine a senha do coach de demo para este valor.
const COACH_PASSWORD = env.DEMO_COACH_PASSWORD;

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

/** "Hoje" em America/Sao_Paulo (`YYYY-MM-DD`) — mesma referência de `todayDateSP`
 * (web/lib/portal-today.ts) usada pelo app pra decidir a semana corrente. */
function todaySP(today = TODAY) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(today);
}

/** Segunda-feira da semana de calendário de `dateStr` (mesma conta de `mondayOf`). */
function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return addDaysUTC(dateStr, -((d.getUTCDay() + 6) % 7));
}

/** Mesmo algoritmo de `computeWeekInfo`/`periodOfWeek` em web/lib/checkin-week.ts (semanas de
 * CALENDÁRIO, segunda a domingo, desde a migration 0014) — mantido em paralelo de propósito
 * (módulo puro, sem import de TS a partir de um script .mjs). Se mudar lá, mude aqui. */
function periodOfWeek(startDateStr, weekNumber) {
  const periodStart = addDaysUTC(mondayOf(startDateStr), (weekNumber - 1) * 7);
  return { periodStart, periodEnd: addDaysUTC(periodStart, 6) };
}

function computeWeekInfo(startDateStr, today = TODAY) {
  const diffDays =
    (new Date(`${mondayOf(todaySP(today))}T00:00:00Z`).getTime() -
      new Date(`${mondayOf(startDateStr)}T00:00:00Z`).getTime()) /
    86_400_000;
  const weekNumber = Math.max(1, Math.round(diffDays / 7) + 1);
  return { weekNumber, ...periodOfWeek(startDateStr, weekNumber) };
}

/** `start_date` tal que, hoje, o aluno esteja na semana `pastWeeks + 1` pela regra de semanas de
 * calendário. O início é a PRÓPRIA segunda-feira da semana 1 — mesma âncora de `periodOfWeek` —,
 * pra "Início do acompanhamento" (Jornada/Histórico) nunca cair depois do início da Semana 1.
 * (Antes o início caía `offset` dias depois dessa segunda, ex.: início 29/07 com Semana 1 em 27/07.)
 * Antes ainda era `hoje - (pastWeeks*7 + offset)` (regra antiga de 7 dias corridos), que
 * desalinhava semana corrente e períodos. */
function startDateFor(pastWeeks, today = TODAY) {
  const startDate = addDaysUTC(mondayOf(todaySP(today)), -pastWeeks * 7);
  if (computeWeekInfo(startDate, today).weekNumber !== pastWeeks + 1) {
    throw new Error(`seed: start_date ${startDate} não cai na semana ${pastWeeks + 1}.`);
  }
  return startDate;
}

/** Data dentro da semana corrente, `daysBack` dias antes de hoje (SP) — nunca antes do início da
 * semana nem no futuro. */
function dayInCurrentWeek(periodStart, daysBack = 0, today = TODAY) {
  const d = addDaysUTC(todaySP(today), -daysBack);
  return d < periodStart ? periodStart : d;
}

/** Teto "agora - N minutos" (ISO). Timestamp de semana corrente montado com `atTime` (hora fixa
 * em UTC) pode cair no FUTURO quando o seed roda cedo — ex.: "enviado às 15:00" visto às 09:00,
 * com a orientação parecendo anterior ao check-in. */
function capPast(iso, minutesBeforeNow = 5, now = TODAY) {
  if (iso == null) return iso;
  const cap = now.getTime() - minutesBeforeNow * 60_000;
  return Date.parse(iso) > cap ? new Date(cap).toISOString() : iso;
}

/** Garante uma sequência estritamente crescente e no passado (`null` é ignorado), ex.:
 * enviado < avaliação aberta < avaliado. Cada posição tem um teto progressivamente mais perto de
 * "agora" (90 / 45 / 10 / 5 min antes), e se o clamp inverter a ordem o item é empurrado pra 15 min
 * depois do anterior — que sempre cabe sob o teto dele. */
function orderedPast(timestamps, now = TODAY) {
  const caps = [90, 45, 10, 5];
  const out = [];
  let prev = null;
  timestamps.forEach((iso, i) => {
    if (iso == null) {
      out.push(iso);
      return;
    }
    const capMin = caps[Math.min(i, caps.length - 1)];
    let t = capPast(iso, capMin, now);
    if (prev != null && Date.parse(t) <= Date.parse(prev)) {
      t = capPast(new Date(Date.parse(prev) + 15 * 60_000).toISOString(), capMin, now);
    }
    out.push(t);
    prev = t;
  });
  return out;
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

  // Arquivos das fotos de demo no Storage (a cascata só apaga as linhas de `photos`).
  {
    const removed = await removeDemoPhotoObjects(accountId);
    console.log(`${removed} arquivo(s) de foto de demo removido(s) do bucket.`);
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

    const startDate = startDateFor(student.pastWeeks);
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

  const startDate = startDateFor(student.pastWeeks);

  // Semanas passadas: ciclo completo (submitted -> reviewed). Períodos de segunda a domingo,
  // iguais aos que o app calcula (`periodOfWeek`).
  for (let w = 1; w <= student.pastWeeks; w++) {
    const { periodStart, periodEnd } = periodOfWeek(startDate, w);
    const submittedAt = atTime(addDaysUTC(periodStart, 2), 19, 30);
    const reviewOpenedAt = atTime(addDaysUTC(periodStart, 3), 10, 15);
    const reviewedAt = atTime(addDaysUTC(periodStart, 3), 18, 45);
    // "Atrasado": a ÚLTIMA semana passada (prazo — domingo — já vencido) ficou sem envio. Antes o
    // seed marcava a semana CORRENTE como `late`, cujo prazo ainda não passou ("o prazo era 18/10"
    // visto em 13/10).
    if (student.state === "awaiting_checkin_late" && w === student.pastWeeks) {
      rows.push({
        __week: w,
        __kind: "past",
        client_id: clientId,
        template_id: templateId,
        week_number: w,
        period_start: periodStart,
        period_end: periodEnd,
        status: "late",
        submitted_at: null,
        review_opened_at: null,
        reviewed_at: null,
      });
      continue;
    }
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
  const { periodStart, periodEnd } = periodOfWeek(startDate, currentWeek);
  // Timestamps da semana corrente: sempre dentro dela e nunca no futuro.
  const today = dayInCurrentWeek(periodStart, 0);

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
      submitted_at: atTime(dayInCurrentWeek(periodStart, 1), 19, 0),
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
      submitted_at: atTime(dayInCurrentWeek(periodStart, 2), 19, 0),
      review_opened_at: atTime(dayInCurrentWeek(periodStart, 1), 10, 0),
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
      submitted_at: atTime(dayInCurrentWeek(periodStart, 1), 19, 0),
      review_opened_at: atTime(today, 9, 0),
      reviewed_at: atTime(today, 11, 0),
    });
  } else if (student.state === "awaiting_checkin_late") {
    // O atraso é da semana ANTERIOR (ver acima); a corrente está aberta, dentro do prazo.
    rows.push({
      __week: currentWeek,
      __kind: "current",
      client_id: clientId,
      template_id: templateId,
      week_number: currentWeek,
      period_start: periodStart,
      period_end: periodEnd,
      status: "pending",
      submitted_at: null,
      review_opened_at: null,
      reviewed_at: null,
    });
  }
  // "awaiting_checkin" e "paused": nenhuma linha pra semana corrente.

  // Semana corrente: nada no futuro e ordem enviado < avaliação aberta < avaliado.
  for (const row of rows) {
    if (row.__kind !== "current") continue;
    [row.submitted_at, row.review_opened_at, row.reviewed_at] = orderedPast([
      row.submitted_at,
      row.review_opened_at,
      row.reviewed_at,
    ]);
  }

  return rows;
}

// ============================================================================
// 6) Fotos de progresso de demo (bucket `checkin-photos` + tabela `photos`)
// ============================================================================
//
// Segue EXATAMENTE as regras do app (lib/storage/buckets.ts, lib/storage/photo-angles.ts,
// lib/storage/checkin-photos.ts):
//  - bucket privado `checkin-photos`, só `image/jpeg`, até 5 MB;
//  - path `{account_id}/{client_id}/week-{n}/{angle}.jpg` (`buildPhotoPath`), que passa em
//    `isOwnedPhotoPath`/`PHOTO_FILE_RE`;
//  - `photos.week_number` = semana da instância de check-in e `checkin_id` = id dela;
//  - ângulos novos front/left/right/back; legado `side` só em semana antiga (front/side/back).
// A imagem é um JPEG de verdade gerado aqui (encoder baseline mínimo, sem dependências), com
// "SEMANA N" + posição escritos nela — o número desenhado é o MESMO `week_number` da linha, pra
// conferir que o cabeçalho da semana bate com a foto exibida.

const CHECKIN_PHOTOS_BUCKET = "checkin-photos";
const PHOTO_W = 240;
const PHOTO_H = 320;

/** Alunos com fotos de demo: duas últimas semanas avaliadas com as 4 posições novas e uma semana
 * antiga (1) só com o legado front/side/back. Carlos também tem a semana corrente (enviada, em
 * avaliação) com as 4 fotos — check-in enviado sempre tem as 4. */
const DEMO_PHOTO_PLAN = {
  rafael: (s) => ({ fourAngleWeeks: [s.pastWeeks - 1, s.pastWeeks], legacyWeeks: [1] }),
  carlos: (s) => ({ fourAngleWeeks: [s.pastWeeks - 1, s.pastWeeks, s.pastWeeks + 1], legacyWeeks: [1] }),
};

const PHOTO_ANGLE_TEXT = {
  front: "FRENTE",
  left: "LAT. ESQUERDA",
  right: "LAT. DIREITA",
  back: "COSTAS",
  side: "LATERAL (ANTIGA)",
};

const PHOTO_ANGLE_RGB = {
  front: [37, 99, 235],
  left: [22, 163, 74],
  right: [217, 119, 6],
  back: [124, 58, 237],
  side: [71, 85, 105],
};

// Fonte bitmap 5x7 (só os caracteres usados nos textos acima, nomes e dígitos).
const FONT_5X7 = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function asciiUpper(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

/** Canvas RGB simples. */
function makeCanvas(w, h, rgb) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) px.set(rgb, i * 3);
  return { w, h, px };
}

function fillRect(c, x0, y0, w, h, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(c.h, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(c.w, x0 + w); x++) c.px.set(rgb, (y * c.w + x) * 3);
  }
}

function fillEllipse(c, cx, cy, rx, ry, rgb) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) c.px.set(rgb, (y * c.w + x) * 3);
    }
  }
}

/** Texto centralizado; escala automática (até `maxScale`) pra caber na largura. */
function drawTextCentered(c, text, y, rgb, maxScale) {
  const chars = [...asciiUpper(text)].map((ch) => FONT_5X7[ch] ?? FONT_5X7[" "]);
  const scale = Math.max(1, Math.min(maxScale, Math.floor((c.w - 16) / (chars.length * 6))));
  const totalW = chars.length * 6 * scale - scale;
  let x = Math.floor((c.w - totalW) / 2);
  for (const glyph of chars) {
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] === "1") fillRect(c, x + gx * scale, y + gy * scale, scale, scale, rgb);
      }
    }
    x += 6 * scale;
  }
  return 7 * scale;
}

function mixRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

/** Placeholder da foto: fundo na cor da posição, silhueta simples e o texto "SEMANA N / posição". */
function renderDemoPhoto(firstName, weekNumber, angle) {
  const base = PHOTO_ANGLE_RGB[angle];
  const c = makeCanvas(PHOTO_W, PHOTO_H, mixRgb(base, [255, 255, 255], 0.15));
  const body = mixRgb(base, [255, 255, 255], 0.55);
  const lateral = angle === "left" || angle === "right" || angle === "side";
  // Silhueta (cabeça + tronco + pernas) — mais estreita nas laterais.
  const torsoW = lateral ? 44 : 84;
  fillEllipse(c, PHOTO_W / 2, 118, 20, 24, body);
  fillRect(c, PHOTO_W / 2 - torsoW / 2, 146, torsoW, 92, body);
  if (!lateral) {
    fillRect(c, PHOTO_W / 2 - torsoW / 2 - 16, 150, 12, 78, body);
    fillRect(c, PHOTO_W / 2 + torsoW / 2 + 4, 150, 12, 78, body);
  }
  fillRect(c, PHOTO_W / 2 - torsoW / 2 + 4, 238, torsoW / 2 - 6, 64, body);
  fillRect(c, PHOTO_W / 2 + 2, 238, torsoW / 2 - 6, 64, body);
  // Faixa escura com os textos (contraste).
  const band = mixRgb(base, [0, 0, 0], 0.55);
  fillRect(c, 0, 0, PHOTO_W, 84, band);
  const white = [255, 255, 255];
  drawTextCentered(c, `SEMANA ${weekNumber}`, 12, white, 4);
  drawTextCentered(c, PHOTO_ANGLE_TEXT[angle], 50, white, 3);
  fillRect(c, 0, PHOTO_H - 26, PHOTO_W, 26, band);
  drawTextCentered(c, `${firstName} - DEMO`, PHOTO_H - 20, white, 2);
  return c;
}

// ---- Encoder JPEG baseline mínimo (YCbCr 4:4:4, tabelas padrão do Anexo K) ----

const JPEG_ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
  28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63,
];
const JPEG_Q_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29,
  51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120,
  101, 72, 92, 95, 98, 112, 100, 103, 99,
];
const JPEG_Q_CHROMA = (() => {
  const t = new Array(64).fill(99);
  const head = [
    [17, 18, 24, 47],
    [18, 21, 26, 66],
    [24, 26, 56],
    [47, 66],
  ];
  head.forEach((row, y) => row.forEach((v, x) => (t[y * 8 + x] = v)));
  return t;
})();

function rangeBytes(from, to) {
  const out = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
}

const JPEG_HUFF = {
  dcLuma: { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: rangeBytes(0, 11) },
  dcChroma: { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: rangeBytes(0, 11) },
  acLuma: {
    bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
    vals: [
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71,
      0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0a, ...rangeBytes(0x16, 0x1a), ...rangeBytes(0x25, 0x2a), ...rangeBytes(0x34, 0x3a),
      ...rangeBytes(0x43, 0x4a), ...rangeBytes(0x53, 0x5a), ...rangeBytes(0x63, 0x6a), ...rangeBytes(0x73, 0x7a),
      ...rangeBytes(0x83, 0x8a), ...rangeBytes(0x92, 0x9a), ...rangeBytes(0xa2, 0xaa), ...rangeBytes(0xb2, 0xba),
      ...rangeBytes(0xc2, 0xca), ...rangeBytes(0xd2, 0xda), ...rangeBytes(0xe1, 0xea), ...rangeBytes(0xf1, 0xfa),
    ],
  },
  acChroma: {
    bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
    vals: [
      0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22,
      0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1,
      0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a,
      ...rangeBytes(0x35, 0x3a), ...rangeBytes(0x43, 0x4a), ...rangeBytes(0x53, 0x5a), ...rangeBytes(0x63, 0x6a),
      ...rangeBytes(0x73, 0x7a), ...rangeBytes(0x82, 0x8a), ...rangeBytes(0x92, 0x9a), ...rangeBytes(0xa2, 0xaa),
      ...rangeBytes(0xb2, 0xba), ...rangeBytes(0xc2, 0xca), ...rangeBytes(0xd2, 0xda), ...rangeBytes(0xe2, 0xea),
      ...rangeBytes(0xf2, 0xfa),
    ],
  },
};

/** symbol -> [code, length] a partir de bits/vals (procedimento do Anexo C). */
function buildHuffCodes({ bits, vals }) {
  const map = new Map();
  let code = 0;
  let k = 0;
  for (let len = 1; len <= 16; len++) {
    for (let i = 0; i < bits[len - 1]; i++) map.set(vals[k++], [code++, len]);
    code <<= 1;
  }
  return map;
}

function scaleQuant(table, quality) {
  const s = quality < 50 ? 5000 / quality : 200 - quality * 2;
  return table.map((v) => clamp(Math.floor((v * s + 50) / 100), 1, 255));
}

const DCT_COS = (() => {
  const t = new Float64Array(64);
  for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) t[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return t;
})();

/** DCT 8x8 separável (bloco já com level shift). */
function fdct8x8(block) {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += block[y * 8 + x] * DCT_COS[x * 8 + u];
      tmp[y * 8 + u] = s * (u === 0 ? Math.SQRT1_2 : 1) * 0.5;
    }
  }
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * DCT_COS[y * 8 + v];
      out[v * 8 + u] = s * (v === 0 ? Math.SQRT1_2 : 1) * 0.5;
    }
  }
  return out;
}

function encodeJpeg({ w, h, px }, quality = 90) {
  const qY = scaleQuant(JPEG_Q_LUMA, quality);
  const qC = scaleQuant(JPEG_Q_CHROMA, quality);
  const codes = {
    dcY: buildHuffCodes(JPEG_HUFF.dcLuma),
    acY: buildHuffCodes(JPEG_HUFF.acLuma),
    dcC: buildHuffCodes(JPEG_HUFF.dcChroma),
    acC: buildHuffCodes(JPEG_HUFF.acChroma),
  };

  const out = [];
  const u16 = (v) => out.push((v >> 8) & 0xff, v & 0xff);
  // SOI + APP0 (JFIF)
  out.push(0xff, 0xd8, 0xff, 0xe0);
  u16(16);
  out.push(0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  // DQT (tabelas em ordem zigzag)
  for (const [id, q] of [
    [0, qY],
    [1, qC],
  ]) {
    out.push(0xff, 0xdb);
    u16(67);
    out.push(id);
    for (let k = 0; k < 64; k++) out.push(q[JPEG_ZIGZAG[k]]);
  }
  // SOF0
  out.push(0xff, 0xc0);
  u16(17);
  out.push(8);
  u16(h);
  u16(w);
  out.push(3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1);
  // DHT
  for (const [cls, table] of [
    [0x00, JPEG_HUFF.dcLuma],
    [0x10, JPEG_HUFF.acLuma],
    [0x01, JPEG_HUFF.dcChroma],
    [0x11, JPEG_HUFF.acChroma],
  ]) {
    out.push(0xff, 0xc4);
    u16(3 + 16 + table.vals.length);
    out.push(cls, ...table.bits, ...table.vals);
  }
  // SOS
  out.push(0xff, 0xda);
  u16(12);
  out.push(3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0);

  // Entropy-coded data
  let bitBuf = 0;
  let bitCnt = 0;
  const writeBits = (code, len) => {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf = (bitBuf << 1) | ((code >> i) & 1);
      if (++bitCnt === 8) {
        out.push(bitBuf);
        if (bitBuf === 0xff) out.push(0x00);
        bitBuf = 0;
        bitCnt = 0;
      }
    }
  };
  const category = (v) => {
    let a = Math.abs(v);
    let n = 0;
    while (a > 0) {
      n++;
      a >>= 1;
    }
    return n;
  };
  const writeValue = (v, cat) => {
    if (cat > 0) writeBits(v < 0 ? v + (1 << cat) - 1 : v, cat);
  };
  const huff = (table, sym) => {
    const c = table.get(sym);
    if (!c) throw new Error(`JPEG: símbolo Huffman ausente (${sym}).`);
    writeBits(c[0], c[1]);
  };

  const prevDc = [0, 0, 0];
  const block = new Float64Array(64);
  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < w; bx += 8) {
      for (let comp = 0; comp < 3; comp++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const sx = Math.min(w - 1, bx + x);
            const sy = Math.min(h - 1, by + y);
            const i = (sy * w + sx) * 3;
            const r = px[i];
            const g = px[i + 1];
            const b = px[i + 2];
            let v;
            if (comp === 0) v = 0.299 * r + 0.587 * g + 0.114 * b;
            else if (comp === 1) v = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
            else v = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
            block[y * 8 + x] = v - 128;
          }
        }
        const coef = fdct8x8(block);
        const q = comp === 0 ? qY : qC;
        const zz = new Array(64);
        for (let k = 0; k < 64; k++) zz[k] = Math.round(coef[JPEG_ZIGZAG[k]] / q[JPEG_ZIGZAG[k]]);

        const dcTable = comp === 0 ? codes.dcY : codes.dcC;
        const acTable = comp === 0 ? codes.acY : codes.acC;
        const diff = zz[0] - prevDc[comp];
        prevDc[comp] = zz[0];
        const dcCat = category(diff);
        huff(dcTable, dcCat);
        writeValue(diff, dcCat);

        let run = 0;
        for (let k = 1; k < 64; k++) {
          const v = zz[k];
          if (v === 0) {
            run++;
            continue;
          }
          while (run > 15) {
            huff(acTable, 0xf0);
            run -= 16;
          }
          const cat = category(v);
          huff(acTable, (run << 4) | cat);
          writeValue(v, cat);
          run = 0;
        }
        if (run > 0) huff(acTable, 0x00);
      }
    }
  }
  if (bitCnt > 0) writeBits((1 << (8 - bitCnt)) - 1, 8 - bitCnt);
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

/** Mesmo formato de `buildPhotoPath` (lib/storage/buckets.ts). */
function buildPhotoPath(accountId, clientId, weekNumber, angle) {
  return `${accountId}/${clientId}/week-${weekNumber}/${angle}.jpg`;
}

/** Mesmas opções de `ensureCheckinPhotosBucket` (lib/storage/buckets.ts). */
async function ensureCheckinPhotosBucket() {
  const options = { public: false, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"] };
  const { data: existing } = await admin.storage.getBucket(CHECKIN_PHOTOS_BUCKET);
  if (existing) {
    if (existing.public) {
      const { error } = await admin.storage.updateBucket(CHECKIN_PHOTOS_BUCKET, options);
      if (error) throw new Error(`Não foi possível tornar o bucket privado: ${error.message}`);
    }
    return;
  }
  const { error } = await admin.storage.createBucket(CHECKIN_PHOTOS_BUCKET, options);
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`Não foi possível criar o bucket de fotos: ${error.message}`);
  }
}

/** Remove TODOS os objetos sob `{accountId}/` no bucket de fotos (só a conta de demo — o seed já
 * apaga todos os alunos dela). Pega também objetos órfãos de execuções anteriores (o `delete` em
 * `clients` só cascateia as linhas de `photos`, não os arquivos). Estrutura fixa:
 * `{account}/{client}/week-{n}/{angle}.jpg`. */
async function removeDemoPhotoObjects(accountId) {
  const { data: bucket } = await admin.storage.getBucket(CHECKIN_PHOTOS_BUCKET);
  if (!bucket) return 0;
  const listAll = async (prefix) => {
    const items = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(CHECKIN_PHOTOS_BUCKET).list(prefix, { limit: 100, offset });
      if (error) throw new Error(`Falha ao listar fotos em ${prefix}: ${error.message}`);
      items.push(...(data ?? []));
      if (!data || data.length < 100) break;
    }
    return items;
  };
  const paths = [];
  for (const clientDir of await listAll(accountId)) {
    const clientPrefix = `${accountId}/${clientDir.name}`;
    for (const weekDir of await listAll(clientPrefix)) {
      const weekPrefix = `${clientPrefix}/${weekDir.name}`;
      for (const file of await listAll(weekPrefix)) {
        if (file.id) paths.push(`${weekPrefix}/${file.name}`);
      }
    }
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(CHECKIN_PHOTOS_BUCKET).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`Falha ao apagar fotos de demo: ${error.message}`);
  }
  return paths.length;
}

/** Sobe as fotos de demo e grava as linhas em `photos`, ligadas à instância de check-in da semana. */
async function seedDemoPhotos(accountId, clientByKey, instanceByClientWeek) {
  logStep("Fotos de progresso de demo (checkin-photos + photos)");
  await ensureCheckinPhotosBucket();

  const rows = [];
  const uploaded = [];
  for (const [key, planFor] of Object.entries(DEMO_PHOTO_PLAN)) {
    const student = STUDENTS.find((s) => s.key === key);
    const client = clientByKey.get(key);
    if (!student || !client) continue;
    const firstName = student.name.split(" ")[0];
    const plan = planFor(student);
    const entries = [
      ...plan.legacyWeeks.flatMap((w) => ["front", "side", "back"].map((angle) => ({ week: w, angle }))),
      ...plan.fourAngleWeeks.flatMap((w) => ["front", "left", "right", "back"].map((angle) => ({ week: w, angle }))),
    ];
    for (const { week, angle } of entries) {
      const instance = instanceByClientWeek.get(`${client.id}:${week}`);
      if (!instance || !instance.submitted_at) {
        throw new Error(`seed: ${student.name} não tem check-in enviado na semana ${week} para anexar fotos.`);
      }
      const storagePath = buildPhotoPath(accountId, client.id, week, angle);
      const bytes = encodeJpeg(renderDemoPhoto(firstName, week, angle));
      const { error } = await admin.storage
        .from(CHECKIN_PHOTOS_BUCKET)
        .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
      if (error) throw new Error(`Falha ao subir ${storagePath}: ${error.message}`);
      uploaded.push(storagePath);
      rows.push({
        client_id: client.id,
        checkin_id: instance.id,
        week_number: week,
        angle,
        storage_path: storagePath,
        // Antes do envio do check-in (as fotos são tiradas e depois o formulário é enviado).
        created_at: new Date(Date.parse(instance.submitted_at) - 10 * 60_000).toISOString(),
      });
    }
    console.log(
      `${student.name}: semanas ${plan.fourAngleWeeks.join(", ")} (frente/lat. esquerda/lat. direita/costas) e ` +
        `${plan.legacyWeeks.join(", ")} (legado frente/lateral/costas).`
    );
  }

  const { error } = await admin.from("photos").insert(rows);
  if (error) {
    await admin.storage.from(CHECKIN_PHOTOS_BUCKET).remove(uploaded);
    if (error.code === "23514") {
      throw new Error("photos.angle não aceita left/right — aplique a migration 0017_photo_angles_four.sql.");
    }
    throw new Error(`Insert em "photos" falhou: ${error.message} (${error.code ?? "?"})`);
  }
  console.log(`${rows.length} foto(s) de demo (${uploaded.length} objeto(s) no bucket).`);
  return rows.length;
}

// ============================================================================
// V5 (itens 26–28) — Laboratório de demonstração (migrações 0022 + 0023)
// ============================================================================
//
// - Marca a conta do coach de teste como demo (`accounts.is_demo = true`, `demo_scenario = 'filled'`).
// - Contratos de pacote coerentes para os alunos demo (Híbrido para quem tem treino E nutrição).
// - Aluno "Começar do zero" DENTRO da conta preenchida: login próprio, ativo,
//   `onboarding_required = true`, contrato Híbrido, sem questionário nem planos (começa pelo
//   questionário inicial — decisão adotada do §11 do plano).
// - Conta coach "Começar do zero" (`demo_scenario = 'empty'`): sem alunos, avaliações nem protocolos
//   (limpa pela RPC `lab_reset_demo_account`, que recusa conta que não seja demo vazia).
// - `demo_lab_profiles`: lista FECHADA de logins que o laboratório pode assumir.
//
// Tudo é pulado (com aviso) se a 0022/0023 ainda não estiverem aplicadas. Só toca contas/logins
// `@trackly.test` deste script. Senhas: DEMO_COACH_PASSWORD / DEMO_STUDENT_PASSWORD (nunca impressas).

const DEMO_EMAIL_DOMAIN = "@trackly.test";
const EMPTY_COACH_EMAIL = "coach.vazio@trackly.test";
const EMPTY_COACH_NAME = "Coach Demo (do zero)";
const EMPTY_ACCOUNT_NAME = "Demo — Começar do zero";
const FRESH_STUDENT = {
  key: "fresh",
  name: "Lucas Andrade Pires",
  email: "aluno.zero@trackly.test",
  phone: "(11) 99999-1009",
};

// Preços padrão demo do coach (centavos). Valores fictícios, só para a demonstração.
const DEMO_SERVICE_PRICES = { training: 19900, nutrition: 17900, hybrid: 32900 };
// Pacote de cada aluno demo. Carlos e Rafael têm treino e nutrição publicados no seed -> Híbrido.
const DEMO_PACKAGE_BY_KEY = {
  ana: "nutrition",
  carlos: "hybrid",
  marina: "nutrition",
  rafael: "hybrid",
  juliana: "training",
  bruno: "hybrid",
  patricia: "training",
  fernanda: "training",
};

function assertDemoEmail(email) {
  if (!String(email ?? "").toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)) {
    throw new Error(`Recusado: ${email} não é um login de demonstração (${DEMO_EMAIL_DOMAIN}).`);
  }
}

async function probeV5Schema() {
  return {
    isDemo: await columnExists("accounts", "is_demo"),
    onboardingRequired: await columnExists("clients", "onboarding_required"),
    contracts: await tableExists("client_service_contracts"),
    servicePrices: await tableExists("coach_service_prices"),
    labProfiles: await tableExists("demo_lab_profiles"),
  };
}

async function markDemoAccount(accountId, scenario) {
  const { error } = await admin
    .from("accounts")
    .update({ is_demo: true, demo_scenario: scenario })
    .eq("id", accountId);
  if (error) throw new Error(`Falha ao marcar a conta ${accountId} como demo: ${error.message}`);
}

/** Login demo estável (não é apagado entre execuções): acha pelo e-mail ou cria; sincroniza a senha. */
async function ensureDemoAuthUser(email, password) {
  assertDemoEmail(email);
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw new Error(`Falha ao sincronizar a senha de ${email}: ${error.message}`);
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser(${email}) falhou: ${error?.message ?? "erro desconhecido"}`);
  return data.user;
}

/** Conta coach "Começar do zero": cria (uma vez) login, conta, perfil e template de check-in padrão. */
async function ensureEmptyCoach() {
  const password = COACH_PASSWORD || STUDENT_PASSWORD;
  const user = await ensureDemoAuthUser(EMPTY_COACH_EMAIL, password);

  const { data: existingCoach, error: coachErr } = await admin
    .from("coach_users")
    .select("id, account_id")
    .eq("id", user.id)
    .maybeSingle();
  if (coachErr) throw new Error(`Falha ao buscar o coach vazio: ${coachErr.message}`);

  let accountId = existingCoach?.account_id ?? null;
  if (!accountId) {
    const { data: clientRow } = await admin.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (clientRow) throw new Error(`${EMPTY_COACH_EMAIL} está ligado a um aluno — não vira coach.`);

    const { data: account, error: accErr } = await admin
      .from("accounts")
      .insert({ name: EMPTY_ACCOUNT_NAME, is_demo: true, demo_scenario: "empty" })
      .select("id")
      .single();
    if (accErr || !account) throw new Error(`Falha ao criar a conta vazia: ${accErr?.message}`);
    accountId = account.id;

    const { error: cuErr } = await admin
      .from("coach_users")
      .insert({ id: user.id, account_id: accountId, name: EMPTY_COACH_NAME, email: EMPTY_COACH_EMAIL });
    if (cuErr) throw new Error(`Falha ao criar o coach vazio: ${cuErr.message}`);
    console.log(`Conta "Começar do zero" criada (${EMPTY_COACH_EMAIL}, senha em DEMO_COACH_PASSWORD).`);
  } else {
    console.log(`Conta "Começar do zero" já existe — account_id ${accountId}.`);
  }

  await markDemoAccount(accountId, "empty");

  // Template de check-in padrão (mesmo catálogo do cadastro), se ainda não houver.
  const { data: tpl } = await admin.from("checkin_templates").select("id").eq("account_id", accountId).limit(1).maybeSingle();
  if (!tpl) {
    const { defaultTemplateRows } = await import(pathToFileURL(path.join(ROOT, "lib", "checkin-catalog.ts")).href);
    const { data: template, error: tErr } = await admin
      .from("checkin_templates")
      .insert({ account_id: accountId, name: "Padrão" })
      .select("id")
      .single();
    if (tErr || !template) throw new Error(`Falha ao criar o template de check-in da conta vazia: ${tErr?.message}`);
    await insertMany(
      "checkin_questions",
      defaultTemplateRows().map((row) => ({ ...row, template_id: template.id }))
    );
  }

  // Volta ao estado inicial (sem alunos, protocolos, preços padrão). A RPC recusa conta real.
  const { data: reset, error: resetErr } = await admin.rpc("lab_reset_demo_account", { p_account_id: accountId });
  if (resetErr) throw new Error(`lab_reset_demo_account falhou: ${resetErr.message}`);
  const row = Array.isArray(reset) ? reset[0] : reset;
  await deleteOrphanDemoLogins(row?.orphan_auth_user_ids ?? []);
  const removedPhotos = await removeDemoPhotoObjects(accountId);
  console.log(`Conta vazia limpa: ${row?.deleted_clients ?? 0} aluno(s), ${removedPhotos} foto(s) removidos.`);

  return { userId: user.id, accountId };
}

/** Apaga logins de aluno órfãos devolvidos pela RPC — só se não forem coach nem aluno de outra conta. */
async function deleteOrphanDemoLogins(ids) {
  for (const id of ids ?? []) {
    const { data: coachRow } = await admin.from("coach_users").select("id").eq("id", id).maybeSingle();
    const { data: clientRow } = await admin.from("clients").select("id").eq("auth_user_id", id).limit(1).maybeSingle();
    if (coachRow || clientRow) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`Aviso: não foi possível apagar um login órfão da conta vazia: ${error.message}`);
  }
}

async function seedV5DemoLab(coach, clientByKey, authUserByKey) {
  logStep("V5 — Laboratório de demonstração");
  const v5 = await probeV5Schema();
  console.log("Schema V5 detectado:", v5);
  if (!v5.isDemo || !v5.onboardingRequired || !v5.contracts || !v5.servicePrices || !v5.labProfiles) {
    console.log("Migrações 0022/0023 ainda não aplicadas — etapa do laboratório pulada (nada foi alterado).");
    return;
  }
  assertDemoEmail(COACH_EMAIL);

  // 1) Conta preenchida = demo.
  await markDemoAccount(coach.account_id, "filled");
  console.log("Conta preenchida marcada como demo (is_demo = true, demo_scenario = 'filled').");

  // 2) Preços padrão demo (upsert por conta+pacote).
  {
    const rows = Object.entries(DEMO_SERVICE_PRICES).map(([pkg, price]) => ({
      account_id: coach.account_id,
      package: pkg,
      price_cents: price,
      billing_period: "monthly",
      updated_by: coach.id,
    }));
    const { error } = await admin.from("coach_service_prices").upsert(rows, { onConflict: "account_id,package" });
    if (error) throw new Error(`Falha ao gravar preços padrão demo: ${error.message}`);
  }

  // 3) Contratos dos alunos demo (os alunos foram recriados nesta execução -> sem contrato ainda).
  {
    const rows = [];
    for (const student of STUDENTS) {
      const client = clientByKey.get(student.key);
      const pkg = DEMO_PACKAGE_BY_KEY[student.key];
      if (!client || !pkg) continue;
      rows.push({
        account_id: coach.account_id,
        client_id: client.id,
        kind: "initial",
        package: pkg,
        price_cents: DEMO_SERVICE_PRICES[pkg],
        billing_period: "monthly",
        price_source: "coach_default",
        effective_from: client.start_date ?? todaySP(),
        created_by: coach.id,
      });
    }
    await insertContracts(rows);
    console.log(`${rows.length} contrato(s) demo (Híbrido: ${rows.filter((r) => r.package === "hybrid").length}).`);
  }

  // 4) Aluno "Começar do zero" (conta preenchida).
  const freshUser = await ensureDemoAuthUser(FRESH_STUDENT.email, STUDENT_PASSWORD);
  {
    const { data: coachRow } = await admin.from("coach_users").select("id").eq("id", freshUser.id).maybeSingle();
    if (coachRow) throw new Error(`${FRESH_STUDENT.email} é um coach — não pode ser o aluno do zero.`);
  }
  const today = todaySP();
  const [freshClient] = await insertMany("clients", [
    {
      account_id: coach.account_id,
      coach_id: coach.id,
      auth_user_id: freshUser.id,
      name: FRESH_STUDENT.name,
      email: FRESH_STUDENT.email,
      phone: FRESH_STUDENT.phone,
      status: "active",
      invite_status: "active",
      invited_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
      start_date: today,
      onboarding_required: true,
    },
  ]);
  await insertContracts([
    {
      account_id: coach.account_id,
      client_id: freshClient.id,
      kind: "initial",
      package: "hybrid",
      price_cents: DEMO_SERVICE_PRICES.hybrid,
      billing_period: "monthly",
      price_source: "coach_default",
      effective_from: today,
      created_by: coach.id,
    },
  ]);
  console.log(`Aluno "Começar do zero": ${FRESH_STUDENT.email} (senha em DEMO_STUDENT_PASSWORD), Híbrido, questionário pendente.`);

  // 5) Coach "Começar do zero".
  const empty = await ensureEmptyCoach();

  // 6) Registro fechado de perfis do laboratório (o trigger confere conta demo e coerência).
  const carlosClient = clientByKey.get("carlos");
  const carlosUser = authUserByKey.get("carlos");
  if (!carlosClient || !carlosUser) throw new Error("Aluno demo com login (Carlos) não encontrado.");
  const profiles = [
    { key: "coach_filled", user_id: coach.id, account_id: coach.account_id, client_id: null, label: "Coach demo — Demo preenchida" },
    { key: "student_filled", user_id: carlosUser.id, account_id: coach.account_id, client_id: carlosClient.id, label: "Aluno demo — Demo preenchida" },
    { key: "coach_empty", user_id: empty.userId, account_id: empty.accountId, client_id: null, label: "Coach demo — Começar do zero" },
    { key: "student_fresh", user_id: freshUser.id, account_id: coach.account_id, client_id: freshClient.id, label: "Aluno demo — Começar do zero" },
  ];
  // `user_id` é único: remove antes linhas cujo login mudou de chave (não acontece no fluxo normal).
  {
    const { error } = await admin
      .from("demo_lab_profiles")
      .delete()
      .in("user_id", profiles.map((p) => p.user_id))
      .not("key", "in", `(${profiles.map((p) => p.key).join(",")})`);
    if (error) throw new Error(`Falha ao limpar demo_lab_profiles: ${error.message}`);
  }
  for (const profile of profiles) {
    const { error } = await admin.from("demo_lab_profiles").upsert(profile, { onConflict: "key" });
    if (error) throw new Error(`Falha ao registrar o perfil ${profile.key}: ${error.message}`);
  }
  console.log(`demo_lab_profiles: ${profiles.map((p) => p.key).join(", ")}.`);
}

async function insertContracts(rows) {
  await insertMany("client_service_contracts", rows);
}

// ============================================================================
// main
// ============================================================================

async function main() {
  logStep("Coach e template de check-in");
  const coach = await findCoach();
  console.log(`Coach: ${coach.name} <${coach.email}> — account_id ${coach.account_id}`);
  if (COACH_PASSWORD) {
    const { error } = await admin.auth.admin.updateUserById(coach.id, { password: COACH_PASSWORD });
    if (error) throw new Error(`Falha ao definir a senha do coach: ${error.message}`);
    console.log("Senha do coach sincronizada com DEMO_COACH_PASSWORD.");
  }
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omissão por desestruturação
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
  const instanceByClientWeek = new Map(); // `${clientId}:${week}` -> { id, submitted_at } (fotos)
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omissão por desestruturação
    const toInsert = instanceRows.map(({ __week, __kind, ...row }) => row);
    const inserted = await insertMany("checkin_instances", toInsert, "id, week_number");
    for (const row of inserted) {
      instanceIdByClientWeek.set(`${client.id}:${row.week_number}`, row.id);
    }

    for (const meta of instanceRows) {
      const checkinId = instanceIdByClientWeek.get(`${client.id}:${meta.__week}`);
      instanceByClientWeek.set(`${client.id}:${meta.__week}`, { id: checkinId, submitted_at: meta.submitted_at });
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
          // Rascunho: depois da abertura da avaliação e nunca no futuro.
          created_at: isDraft
            ? capPast(
                new Date(
                  Math.max(
                    Date.parse(atTime(dayInCurrentWeek(meta.period_start, 0), 9, 0)),
                    Date.parse(meta.review_opened_at ?? meta.submitted_at) + 15 * 60_000
                  )
                ).toISOString(),
                5
              )
            : meta.reviewed_at,
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
          created_at: atTime(addDaysUTC(periodOfWeek(startDateFor(student.pastWeeks), w).periodStart, 1), 8, 0),
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

  // -- Fotos de progresso de demo -------------------------------------------
  await seedDemoPhotos(coach.account_id, clientByKey, instanceByClientWeek);

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- omissão por desestruturação
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

  // Formato do app (lib/food-macros.ts): valores de UMA porção-base — kcal, protein_g, carbs_g,
  // fat_g + base_qty/base_unit (100 g para g/ml, 1 para unidades).
  const per100g = (kcal, protein_g, carbs_g, fat_g) => ({ kcal, protein_g, carbs_g, fat_g, base_qty: 100, base_unit: "g" });
  const perUnit = (unit, kcal, protein_g, carbs_g, fat_g) => ({ kcal, protein_g, carbs_g, fat_g, base_qty: 1, base_unit: unit });
  const FOODS = [
    { name: "Arroz branco cozido", unit: "g", category: "Carboidrato", macros: per100g(128, 2.5, 28, 0.2) },
    { name: "Feijão carioca cozido", unit: "g", category: "Carboidrato", macros: per100g(76, 4.8, 13.6, 0.5) },
    { name: "Peito de frango grelhado", unit: "g", category: "Proteína", macros: per100g(165, 31, 0, 3.6) },
    { name: "Batata doce cozida", unit: "g", category: "Carboidrato", macros: per100g(86, 1.6, 20, 0.1) },
    { name: "Ovo cozido", unit: "un", category: "Proteína", macros: perUnit("un", 78, 6.3, 0.6, 5.3) },
    { name: "Whey protein (dose)", unit: "scoop", category: "Proteína", macros: perUnit("scoop", 120, 24, 3, 1.5) },
    { name: "Aveia em flocos", unit: "g", category: "Carboidrato", macros: per100g(389, 13.9, 66.3, 6.9) },
    { name: "Banana prata", unit: "un", category: "Fruta", macros: perUnit("un", 98, 1.3, 26, 0.2) },
  ];
  const foodRowsToInsert = FOODS.map((f) => {
    const row = { account_id: coach.account_id, name: f.name, unit: f.unit, macros: f.macros };
    if (schema.foodsCategory) {
      row.category = f.category;
      row.is_archived = false;
    }
    return row;
  });
  const insertedFoods = await insertMany("foods", foodRowsToInsert, "id, name, unit, macros");
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
          // Valor JÁ ESCALADO pela quantidade, igual ao app (repository -> scaleFoodMacros).
          macros: food ? scaleFoodMacros({ unit: food.unit, macros: food.macros ?? {} }, item.quantity, item.unit) : {},
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
      const startedAt = atTime(addDaysUTC(todaySP(), -daysAgo), 10, 0);
      const endedAt = atTime(addDaysUTC(todaySP(), -daysAgo), 10, day.duration_min ?? 50);

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
        const logDate = addDaysUTC(todaySP(), -daysAgo); // dia de SP, como o app
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

  // -- V5: laboratório de demonstração (contas demo, contratos, aluno/coach do zero) --
  await seedV5DemoLab(coach, clientByKey, authUserByKey);

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
    photos: await countRows("photos", inIds),
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
