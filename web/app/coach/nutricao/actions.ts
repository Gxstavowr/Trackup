"use server";

import { revalidatePath } from "next/cache";
import {
  archiveFood as archiveFoodRecord,
  createFood as createFoodRecord,
  createFoodEquivalence as createFoodEquivalenceRecord,
  deleteFoodEquivalence as deleteFoodEquivalenceRecord,
  deleteNutritionTemplate as deleteNutritionTemplateRecord,
  duplicateNutritionPlan as duplicateNutritionPlanRecord,
  unarchiveFood as unarchiveFoodRecord,
  updateFood as updateFoodRecord,
  type FoodMacros,
} from "@/lib/repository";
import { toFriendlyActionError, validateFoodEquivalenceInput } from "@/lib/nutrition-builder";
import { requireCoach } from "../require-coach";

/**
 * Ações da área global de Nutrição do coach (`/coach/nutricao`). Reaproveitam as funções de
 * `lib/repository.ts` (RLS por conta) — as mesmas que o construtor do aluno usa — mas
 * revalidam a rota global (as ações de `alunos/[id]/nutricao` só revalidam a rota do aluno).
 */
export type GlobalNutritionState = { error?: string; success?: boolean; foodId?: string } | null;

const PATH = "/coach/nutricao";

function num(value: FormDataEntryValue | null): number | undefined {
  const str = String(value ?? "").trim().replace(",", ".");
  if (!str) return undefined;
  const n = Number(str);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function macros(fd: FormData): FoodMacros {
  const baseQty = num(fd.get("base_qty"));
  const unit = text(fd.get("unit")) || "g";
  return {
    ...(baseQty && baseQty > 0 ? { base_qty: baseQty, base_unit: unit } : {}),
    kcal: num(fd.get("kcal")),
    protein_g: num(fd.get("protein_g")),
    carbs_g: num(fd.get("carbs_g")),
    fat_g: num(fd.get("fat_g")),
  };
}

function friendly(err: unknown, fallback: string): string {
  return err instanceof Error ? toFriendlyActionError(err.message, fallback) || fallback : fallback;
}

export async function saveFoodAction(
  _prev: GlobalNutritionState,
  fd: FormData
): Promise<GlobalNutritionState> {
  await requireCoach();
  const foodId = text(fd.get("foodId"));
  const name = text(fd.get("name"));
  if (!name) return { error: "Informe o nome do alimento." };

  let savedId = foodId;
  try {
    if (foodId) {
      await updateFoodRecord(foodId, {
        name,
        unit: text(fd.get("unit")),
        category: text(fd.get("category")),
        macros: macros(fd),
      });
    } else {
      const created = await createFoodRecord({
        name,
        unit: text(fd.get("unit")) || undefined,
        category: text(fd.get("category")) || undefined,
        macros: macros(fd),
      });
      savedId = created.id;
    }
  } catch (err) {
    return { error: friendly(err, "Não foi possível salvar o alimento.") };
  }
  revalidatePath(PATH);
  // A biblioteca também alimenta o seletor rápido do editor de dieta de cada aluno.
  revalidatePath("/coach/alunos/[id]/nutricao", "page");
  return { success: true, foodId: savedId };
}

export async function setFoodArchivedAction(fd: FormData): Promise<void> {
  await requireCoach();
  const foodId = text(fd.get("foodId"));
  if (!foodId) return;
  try {
    if (text(fd.get("archive")) === "1") await archiveFoodRecord(foodId);
    else await unarchiveFoodRecord(foodId);
  } catch (err) {
    console.error("Não foi possível alterar o alimento:", err);
  }
  revalidatePath(PATH);
}

export async function createEquivalenceAction(
  _prev: GlobalNutritionState,
  fd: FormData
): Promise<GlobalNutritionState> {
  await requireCoach();
  const foodId = text(fd.get("foodId"));
  const equivalentFoodId = text(fd.get("equivalentFoodId"));
  const factor = num(fd.get("factor")) ?? null;
  const invalid = validateFoodEquivalenceInput({ foodId, equivalentFoodId, factor });
  if (invalid) return { error: invalid };

  try {
    await createFoodEquivalenceRecord({
      foodId,
      equivalentFoodId,
      factor: factor ?? undefined,
      note: text(fd.get("note")) || undefined,
    });
  } catch (err) {
    return { error: friendly(err, "Não foi possível criar a equivalência.") };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function deleteEquivalenceAction(fd: FormData): Promise<void> {
  await requireCoach();
  const id = text(fd.get("equivalenceId"));
  if (!id) return;
  try {
    await deleteFoodEquivalenceRecord(id);
  } catch (err) {
    console.error("Não foi possível excluir a equivalência:", err);
  }
  revalidatePath(PATH);
}

export async function duplicateTemplateAction(
  _prev: GlobalNutritionState,
  fd: FormData
): Promise<GlobalNutritionState> {
  await requireCoach();
  const templateId = text(fd.get("templateId"));
  const name = text(fd.get("name"));
  if (!templateId || !name) return { error: "Informe o nome da cópia." };
  try {
    await duplicateNutritionPlanRecord({ sourcePlanId: templateId, asTemplate: true, name });
  } catch (err) {
    return { error: friendly(err, "Não foi possível duplicar o template.") };
  }
  revalidatePath(PATH);
  return { success: true };
}

export async function applyTemplateToClientAction(
  _prev: GlobalNutritionState,
  fd: FormData
): Promise<GlobalNutritionState> {
  await requireCoach();
  const templateId = text(fd.get("templateId"));
  const clientId = text(fd.get("clientId"));
  if (!templateId || !clientId) return { error: "Selecione o aluno." };
  try {
    await duplicateNutritionPlanRecord({ sourcePlanId: templateId, targetClientId: clientId, asTemplate: false });
  } catch (err) {
    return { error: friendly(err, "Não foi possível aplicar o template.") };
  }
  revalidatePath(`/coach/alunos/${clientId}/nutricao`);
  return { success: true };
}

export async function deleteTemplateAction(fd: FormData): Promise<void> {
  await requireCoach();
  const id = text(fd.get("templateId"));
  if (!id) return;
  try {
    await deleteNutritionTemplateRecord(id);
  } catch (err) {
    console.error("Não foi possível excluir o template:", err);
  }
  revalidatePath(PATH);
}
