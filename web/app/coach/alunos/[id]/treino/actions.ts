"use server";

import { revalidatePath } from "next/cache";
import {
  addExerciseToDay,
  addWorkoutDay,
  archiveExercise,
  createExercise,
  createWorkoutDraft,
  deleteWorkoutDay,
  deleteWorkoutExercise,
  deleteWorkoutTemplate,
  discardWorkoutDraft,
  duplicateWorkoutDay,
  duplicateWorkoutExercise,
  duplicateWorkoutPlan,
  publishWorkoutPlan,
  reorderWorkoutDays,
  reorderWorkoutExercises,
  unarchiveExercise,
  updateExercise,
  updateWorkoutDay,
  updateWorkoutExercise,
  type WorkoutBlockType,
  type WorkoutGroupKind,
} from "@/lib/repository";
import { moveItem, toFriendlyActionError, validateWorkoutExerciseInput } from "@/lib/workout-builder";

export type TreinoActionState = {
  error?: string;
  success?: boolean;
} | null;

function pathFor(clientId: string): string {
  return `/coach/alunos/${clientId}/treino`;
}

/** Mensagem de erro pra mostrar na tela: traduz código `trackly:*` conhecido e, se o que
 * sobrar ainda for texto técnico cru de RLS/constraint do Postgres (ex.: item 25/37 do TODO),
 * troca pelo `fallback` contextual da própria ação — nunca expõe estrutura de tabela/policy. */
function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? toFriendlyActionError(err.message, fallback) || fallback : fallback;
}

/** `formData.get(campo)` → inteiro ou `null` se vazio/inválido. */
function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** `formData.get(campo)` → número (decimal permitido) ou `null` se vazio/inválido. */
function parseOptionalFloat(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str || null;
}

function parseBlockType(value: FormDataEntryValue | null): WorkoutBlockType {
  const str = String(value ?? "normal");
  return str === "warmup" || str === "cardio" ? str : "normal";
}

function parseGroupKind(value: FormDataEntryValue | null): WorkoutGroupKind | null {
  const str = String(value ?? "");
  return str === "superset" || str === "circuit" ? str : null;
}

/** Lê a prescrição completa de um formulário de exercício-no-dia (add ou editar). */
function readWorkoutExerciseInput(formData: FormData, exerciseId: string) {
  return {
    exerciseId,
    blockType: parseBlockType(formData.get("block_type")),
    sets: parseOptionalInt(formData.get("sets")),
    reps: parseOptionalInt(formData.get("reps")),
    repsMin: parseOptionalInt(formData.get("reps_min")),
    repsMax: parseOptionalInt(formData.get("reps_max")),
    restSec: parseOptionalInt(formData.get("rest_sec")),
    rir: parseOptionalInt(formData.get("rir")),
    tempo: parseOptionalText(formData.get("tempo")),
    suggestedLoad: parseOptionalFloat(formData.get("suggested_load")),
    durationSec: parseOptionalInt(formData.get("duration_sec")),
    groupKind: parseGroupKind(formData.get("group_kind")),
    groupKey: parseOptionalText(formData.get("group_key")),
    substituteExerciseId: parseOptionalText(formData.get("substitute_exercise_id")),
  };
}

// ============================================================================
// Biblioteca de exercícios
// ============================================================================

/** Server Action do formulário "Novo exercício" (biblioteca da conta do coach). */
export async function createExerciseAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();

  if (!name || !category) {
    return { error: "Informe nome e categoria do exercício." };
  }

  try {
    await createExercise({
      name,
      category,
      instruction: parseOptionalText(formData.get("instruction")) ?? undefined,
      video_url: parseOptionalText(formData.get("video_url")) ?? undefined,
      muscle_group: parseOptionalText(formData.get("muscle_group")) ?? undefined,
      equipment: parseOptionalText(formData.get("equipment")) ?? undefined,
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar o exercício.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

/** Server Action do formulário "Editar exercício". */
export async function updateExerciseAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();

  if (!exerciseId || !name || !category) {
    return { error: "Informe nome e categoria do exercício." };
  }

  try {
    await updateExercise(exerciseId, {
      name,
      category,
      instruction: parseOptionalText(formData.get("instruction")) ?? "",
      video_url: parseOptionalText(formData.get("video_url")) ?? "",
      muscle_group: parseOptionalText(formData.get("muscle_group")) ?? "",
      equipment: parseOptionalText(formData.get("equipment")) ?? "",
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar o exercício.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function archiveExerciseAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");
  if (!exerciseId) return;
  try {
    await archiveExercise(exerciseId);
  } catch (err) {
    console.error("Não foi possível arquivar o exercício:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function unarchiveExerciseAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");
  if (!exerciseId) return;
  try {
    await unarchiveExercise(exerciseId);
  } catch (err) {
    console.error("Não foi possível reativar o exercício:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Ciclo de vida do plano — rascunho / publicar / descartar / duplicar / template
// ============================================================================

/** Cria um rascunho vazio, a partir do plano publicado, ou a partir de um template — o campo
 * hidden `source` decide (""|"blank" = vazio; "plan:<id>"; "template:<id>"). */
export async function createDraftAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const name = String(formData.get("name") || "").trim();
  const source = String(formData.get("source") || "").trim();

  if (!clientId) return { error: "Aluno inválido." };

  try {
    let fromPlanId: string | undefined;
    if (source.startsWith("plan:") || source.startsWith("template:")) {
      fromPlanId = source.split(":")[1];
    }
    await createWorkoutDraft(clientId, { name: name || undefined, fromPlanId });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar o rascunho.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function discardDraftAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  if (!planId) return { error: "Rascunho inválido." };

  try {
    await discardWorkoutDraft(planId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível descartar o rascunho.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function publishDraftAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  if (!planId) return { error: "Rascunho inválido." };

  try {
    await publishWorkoutPlan(planId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível publicar o treino.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function saveAsTemplateAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!planId || !name) return { error: "Informe o nome do template." };

  try {
    await duplicateWorkoutPlan({ sourcePlanId: planId, asTemplate: true, name });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível salvar o template.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function applyTemplateAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!clientId || !templateId) return { error: "Selecione um template." };

  try {
    await duplicateWorkoutPlan({ sourcePlanId: templateId, targetClientId: clientId, asTemplate: false });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível aplicar o template.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function duplicateToClientAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const targetClientId = String(formData.get("targetClientId") || "");
  if (!planId || !targetClientId) return { error: "Selecione o aluno de destino." };

  try {
    await duplicateWorkoutPlan({ sourcePlanId: planId, targetClientId, asTemplate: false });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível duplicar o plano.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  revalidatePath(pathFor(targetClientId));
  return { success: true };
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!templateId) return;
  try {
    await deleteWorkoutTemplate(templateId);
  } catch (err) {
    console.error("Não foi possível excluir o template:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Dias de treino
// ============================================================================

export async function addWorkoutDayAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const name = String(formData.get("name") || "").trim();

  if (!planId || !name) {
    return { error: "Informe o nome do dia de treino." };
  }

  try {
    await addWorkoutDay(planId, {
      name,
      duration_min: parseOptionalInt(formData.get("duration_min")),
      notes: parseOptionalText(formData.get("notes")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar o dia de treino.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function updateWorkoutDayAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const dayId = String(formData.get("dayId") || "");
  const name = String(formData.get("name") || "").trim();

  if (!dayId || !name) {
    return { error: "Informe o nome do dia de treino." };
  }

  try {
    await updateWorkoutDay(dayId, {
      name,
      duration_min: parseOptionalInt(formData.get("duration_min")),
      notes: parseOptionalText(formData.get("notes")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar o dia de treino.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteWorkoutDayAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const dayId = String(formData.get("dayId") || "");
  if (!dayId) return;
  try {
    await deleteWorkoutDay(dayId);
  } catch (err) {
    console.error("Não foi possível remover o dia de treino:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function duplicateWorkoutDayAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const dayId = String(formData.get("dayId") || "");
  if (!dayId) return;
  try {
    await duplicateWorkoutDay(dayId);
  } catch (err) {
    console.error("Não foi possível duplicar o dia de treino:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

/** Move um dia ↑/↓ na lista — `orderJson` é a ordem ATUAL (ids), já renderizada; calcula a
 * nova ordem em memória (`moveItem`) e só chama o banco se algo de fato mudou. */
export async function moveWorkoutDayAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const dayId = String(formData.get("dayId") || "");
  const direction = Number(formData.get("direction")) === -1 ? -1 : 1;
  const orderJson = String(formData.get("orderJson") || "[]");

  try {
    const currentOrder: string[] = JSON.parse(orderJson);
    const index = currentOrder.indexOf(dayId);
    if (index === -1) return;
    const nextOrder = moveItem(currentOrder, index, direction as -1 | 1);
    if (nextOrder === currentOrder) return;
    await reorderWorkoutDays(planId, nextOrder);
  } catch (err) {
    console.error("Não foi possível reordenar os dias:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Exercícios dentro de um dia
// ============================================================================

export async function addExerciseToDayAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const dayId = String(formData.get("dayId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");

  if (!dayId || !exerciseId) {
    return { error: "Selecione um exercício da biblioteca." };
  }

  const draft = readWorkoutExerciseInput(formData, exerciseId);
  const validationError = validateWorkoutExerciseInput(draft);
  if (validationError) return { error: validationError };

  try {
    await addExerciseToDay(dayId, exerciseId, {
      sets: draft.sets,
      reps: draft.reps,
      reps_min: draft.repsMin,
      reps_max: draft.repsMax,
      suggested_load: draft.suggestedLoad,
      rest_sec: draft.restSec,
      rir: draft.rir,
      tempo: draft.tempo,
      block_type: draft.blockType,
      group_kind: draft.groupKind,
      group_key: draft.groupKey,
      substitute_exercise_id: draft.substituteExerciseId,
      duration_sec: draft.durationSec,
      notes: parseOptionalText(formData.get("notes")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível adicionar o exercício.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function updateWorkoutExerciseAction(
  _prevState: TreinoActionState,
  formData: FormData
): Promise<TreinoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const workoutExerciseId = String(formData.get("workoutExerciseId") || "");
  const exerciseId = String(formData.get("exerciseId") || "");

  if (!workoutExerciseId) return { error: "Exercício inválido." };

  const draft = readWorkoutExerciseInput(formData, exerciseId);
  const validationError = validateWorkoutExerciseInput(draft);
  if (validationError) return { error: validationError };

  try {
    await updateWorkoutExercise(workoutExerciseId, {
      sets: draft.sets,
      reps: draft.reps,
      reps_min: draft.repsMin,
      reps_max: draft.repsMax,
      suggested_load: draft.suggestedLoad,
      rest_sec: draft.restSec,
      rir: draft.rir,
      tempo: draft.tempo,
      block_type: draft.blockType,
      group_kind: draft.groupKind,
      group_key: draft.groupKey,
      substitute_exercise_id: draft.substituteExerciseId,
      duration_sec: draft.durationSec,
      notes: parseOptionalText(formData.get("notes")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar o exercício.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteWorkoutExerciseAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const workoutExerciseId = String(formData.get("workoutExerciseId") || "");
  if (!workoutExerciseId) return;
  try {
    await deleteWorkoutExercise(workoutExerciseId);
  } catch (err) {
    console.error("Não foi possível remover o exercício:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function duplicateWorkoutExerciseAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const workoutExerciseId = String(formData.get("workoutExerciseId") || "");
  if (!workoutExerciseId) return;
  try {
    await duplicateWorkoutExercise(workoutExerciseId);
  } catch (err) {
    console.error("Não foi possível duplicar o exercício:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function moveWorkoutExerciseAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const dayId = String(formData.get("dayId") || "");
  const workoutExerciseId = String(formData.get("workoutExerciseId") || "");
  const direction = Number(formData.get("direction")) === -1 ? -1 : 1;
  const orderJson = String(formData.get("orderJson") || "[]");

  try {
    const currentOrder: string[] = JSON.parse(orderJson);
    const index = currentOrder.indexOf(workoutExerciseId);
    if (index === -1) return;
    const nextOrder = moveItem(currentOrder, index, direction as -1 | 1);
    if (nextOrder === currentOrder) return;
    await reorderWorkoutExercises(dayId, nextOrder);
  } catch (err) {
    console.error("Não foi possível reordenar os exercícios:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}
