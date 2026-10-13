"use server";

import { revalidatePath } from "next/cache";
import {
  archiveExercise,
  createExercise,
  duplicateWorkoutPlan,
  unarchiveExercise,
  updateExercise,
} from "@/lib/repository";
import { DEFAULT_EXERCISE_CATALOG } from "@/lib/exercise-catalog";
import { createClient } from "@/lib/supabase/server";
import { toFriendlyActionError } from "@/lib/workout-builder";
import { requireCoach } from "../require-coach";

export type TreinosActionState = { error?: string; success?: string } | null;

const PATH = "/coach/treinos";

function friendly(err: unknown, fallback: string): string {
  return err instanceof Error ? toFriendlyActionError(err.message, fallback) || fallback : fallback;
}

function text(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Cria/edita um exercício da biblioteca geral da conta (mesmas funções do editor do aluno). */
export async function saveExerciseAction(
  _prev: TreinosActionState,
  formData: FormData
): Promise<TreinosActionState> {
  await requireCoach();
  const exerciseId = String(formData.get("exerciseId") || "");
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "").trim();
  if (!name || !category) return { error: "Informe nome e categoria do exercício." };

  try {
    if (exerciseId) {
      await updateExercise(exerciseId, {
        name,
        category,
        instruction: text(formData.get("instruction")) ?? "",
        video_url: text(formData.get("video_url")) ?? "",
        muscle_group: text(formData.get("muscle_group")) ?? "",
        equipment: text(formData.get("equipment")) ?? "",
      });
    } else {
      await createExercise({
        name,
        category,
        instruction: text(formData.get("instruction")) ?? undefined,
        video_url: text(formData.get("video_url")) ?? undefined,
        muscle_group: text(formData.get("muscle_group")) ?? undefined,
        equipment: text(formData.get("equipment")) ?? undefined,
      });
    }
  } catch (err) {
    return {
      error: friendly(err, exerciseId ? "Não foi possível editar o exercício." : "Não foi possível criar o exercício."),
    };
  }
  revalidatePath(PATH);
  return { success: exerciseId ? "Exercício atualizado." : "Exercício criado." };
}

export async function setExerciseArchivedAction(
  _prev: TreinosActionState,
  formData: FormData
): Promise<TreinosActionState> {
  await requireCoach();
  const exerciseId = String(formData.get("exerciseId") || "");
  const archive = String(formData.get("archive") || "") === "1";
  if (!exerciseId) return { error: "Exercício inválido." };
  try {
    if (archive) await archiveExercise(exerciseId);
    else await unarchiveExercise(exerciseId);
  } catch (err) {
    return { error: friendly(err, "Não foi possível alterar o exercício.") };
  }
  revalidatePath(PATH);
  return { success: archive ? "Exercício arquivado." : "Exercício reativado." };
}

/** Semeia a biblioteca da conta com o catálogo padrão via RPC `import_exercise_catalog`
 * (security invoker: só insere na conta do coach autenticado e pula nomes existentes). */
export async function importCatalogAction(): Promise<TreinosActionState> {
  await requireCoach();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_exercise_catalog", { p_items: DEFAULT_EXERCISE_CATALOG });
  if (error) return { error: friendly(new Error(error.message), "Não foi possível importar o catálogo.") };
  revalidatePath(PATH);
  const n = Number(data ?? 0);
  return { success: n > 0 ? `${n} exercícios importados.` : "Todos os exercícios do catálogo já estavam na biblioteca." };
}

/** Duplica um template (template -> novo template da mesma conta). */
export async function duplicateTemplateAction(
  _prev: TreinosActionState,
  formData: FormData
): Promise<TreinosActionState> {
  await requireCoach();
  const templateId = String(formData.get("templateId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!templateId || !name) return { error: "Informe o nome da cópia." };
  try {
    await duplicateWorkoutPlan({ sourcePlanId: templateId, asTemplate: true, name });
  } catch (err) {
    return { error: friendly(err, "Não foi possível duplicar o template.") };
  }
  revalidatePath(PATH);
  return { success: "Template duplicado." };
}
