"use server";

import { revalidatePath } from "next/cache";
import {
  completeWorkoutSession,
  getOpenWorkoutSession,
  logWorkoutSet,
  pauseWorkoutSession,
  resumeWorkoutSession,
  startWorkoutSession,
} from "@/lib/repository";
import { toFriendlyActionError } from "@/lib/workout-builder";

/**
 * Server Actions da execução do treino pelo aluno (item 19 do master TODO). Mesmo padrão do
 * resto do portal (`app/portal/nutricao/actions.ts`, o antigo `logWorkoutExerciseAction` que
 * este arquivo substitui): confiam no `clientId` vindo do FormData — a policy de RLS de cada
 * tabela (`workout_sessions_client_*`/`workout_logs_client_*`, 0003/0004) é quem garante que
 * só o próprio aluno (ou o coach dele) consegue escrever pra aquele `client_id`; não precisa
 * reconferir a sessão aqui, o RLS já é a fronteira de segurança real.
 */

export type SessionActionState = {
  error?: string;
  success?: boolean;
} | null;

function revalidateTreino() {
  revalidatePath("/portal/treino");
  revalidatePath("/portal");
}

/** Mensagem de erro pra mostrar na tela do aluno: se um `clientId`/`sessionId` forjado
 * esbarrar na policy de RLS (`workout_sessions_client_*`/`workout_logs_client_*`), o Postgres
 * devolve texto técnico cru ("new row violates row-level security policy…") — nunca mostrar
 * isso; troca pelo `fallback` contextual da própria ação (item 25/37 do TODO). */
function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? toFriendlyActionError(err.message, fallback) || fallback : fallback;
}

/** `formData.get(campo)` → número finito, ou `null` se vazio/inválido. */
function parseNumber(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim();
  if (str === "") return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Inicia o treino do dia escolhido — ou não faz nada além de continuar mostrando a sessão já
 * aberta, se por acaso já existir uma (dois cliques rápidos, ou aba duplicada): nunca cria uma
 * segunda sessão concorrente pro mesmo aluno.
 */
export async function startSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const dayId = String(formData.get("dayId") || "");
  const weekNumber = parseNumber(formData.get("weekNumber"));

  if (!clientId || !planId || !dayId || !weekNumber || weekNumber <= 0) {
    return { error: "Não foi possível identificar o treino do dia." };
  }

  try {
    const existing = await getOpenWorkoutSession(clientId);
    if (!existing) {
      await startWorkoutSession(clientId, planId, dayId, weekNumber);
    }
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível iniciar o treino.") };
  }

  revalidateTreino();
  return { success: true };
}

export async function pauseSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const sessionId = String(formData.get("sessionId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!sessionId || !clientId) return { error: "Sessão inválida." };

  try {
    await pauseWorkoutSession(sessionId, clientId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível pausar o treino.") };
  }

  revalidateTreino();
  return { success: true };
}

export async function resumeSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const sessionId = String(formData.get("sessionId") || "");
  const clientId = String(formData.get("clientId") || "");
  if (!sessionId || !clientId) return { error: "Sessão inválida." };

  try {
    await resumeWorkoutSession(sessionId, clientId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível retomar o treino.") };
  }

  revalidateTreino();
  return { success: true };
}

/**
 * Registra uma série (carga/reps/RIR percebido) — upsert por sessão+prescrição+número da
 * série, então reabrir a mesma série antes de finalizar o treino corrige em vez de duplicar.
 * `exerciseId` é o que o aluno de fato executou (o prescrito ou o substituto autorizado,
 * decidido na tela); `workoutExerciseId` é sempre a prescrição original.
 */
export async function logSetAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const sessionId = String(formData.get("sessionId") || "");
  const clientId = String(formData.get("clientId") || "");
  const workoutExerciseId = String(formData.get("workoutExerciseId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");
  const setNumber = parseNumber(formData.get("setNumber"));
  const weekNumber = parseNumber(formData.get("weekNumber"));
  const load = parseNumber(formData.get("load"));
  const reps = parseNumber(formData.get("reps"));
  const perceivedRir = parseNumber(formData.get("perceivedRir"));

  if (!sessionId || !clientId || !workoutExerciseId || !exerciseId || !setNumber || !weekNumber) {
    return { error: "Não foi possível identificar a série." };
  }

  try {
    await logWorkoutSet({
      sessionId,
      clientId,
      workoutExerciseId,
      exerciseId,
      setNumber,
      weekNumber,
      load,
      reps,
      perceivedRir,
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível registrar a série.") };
  }

  revalidateTreino();
  return { success: true };
}

/**
 * Finaliza o treino — nota do aluno e o resumo (calculado no cliente por `buildSessionSummary`,
 * `lib/workout-session.ts`, e reenviado aqui como JSON pra não recalcular duas vezes com risco
 * de divergir do que a tela de resumo já mostrou ao aluno).
 */
export async function completeSessionAction(
  _prevState: SessionActionState,
  formData: FormData
): Promise<SessionActionState> {
  const sessionId = String(formData.get("sessionId") || "");
  const clientId = String(formData.get("clientId") || "");
  const studentNote = String(formData.get("studentNote") || "");
  const summaryRaw = String(formData.get("summary") || "{}");

  if (!sessionId || !clientId) return { error: "Sessão inválida." };

  let summary: Record<string, unknown> = {};
  try {
    summary = JSON.parse(summaryRaw);
  } catch {
    summary = {};
  }

  try {
    await completeWorkoutSession(sessionId, clientId, { studentNote: studentNote || null, summary });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível finalizar o treino.") };
  }

  revalidateTreino();
  return { success: true };
}
