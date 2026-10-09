"use server";

import { revalidatePath } from "next/cache";
import {
  addMeal as addMealRecord,
  addMealItem as addMealItemRecord,
  addMealSubstitution as addMealSubstitutionRecord,
  archiveFood as archiveFoodRecord,
  createFood as createFoodRecord,
  createFoodEquivalence as createFoodEquivalenceRecord,
  createNutritionDraft as createNutritionDraftRecord,
  deleteFoodEquivalence as deleteFoodEquivalenceRecord,
  deleteMeal as deleteMealRecord,
  deleteMealItem as deleteMealItemRecord,
  deleteMealSubstitution as deleteMealSubstitutionRecord,
  deleteNutritionTemplate as deleteNutritionTemplateRecord,
  discardNutritionDraft as discardNutritionDraftRecord,
  duplicateMeal as duplicateMealRecord,
  duplicateNutritionDay as duplicateNutritionDayRecord,
  duplicateNutritionPlan as duplicateNutritionPlanRecord,
  publishNutritionPlan as publishNutritionPlanRecord,
  reorderMealItems as reorderMealItemsRecord,
  reorderMeals as reorderMealsRecord,
  unarchiveFood as unarchiveFoodRecord,
  updateFood as updateFoodRecord,
  updateMeal as updateMealRecord,
  updateMealItem as updateMealItemRecord,
  updateNutritionGoals as updateNutritionGoalsRecord,
  type FoodMacros,
} from "@/lib/repository";
import {
  moveItem,
  toFriendlyActionError,
  validateFoodEquivalenceInput,
  validateMealInput,
  validateMealItemInput,
  validateNutritionGoalsInput,
  validateSubstitutionInput,
} from "@/lib/nutrition-builder";

export type NutricaoActionState = {
  error?: string;
  success?: boolean;
} | null;

function pathFor(clientId: string): string {
  return `/coach/alunos/${clientId}/nutricao`;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) ? Math.round(n) : null;
}

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

function parseDayOfWeek(value: FormDataEntryValue | null): number | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const n = Number(str);
  return Number.isFinite(n) && n >= 1 && n <= 7 ? Math.round(n) : null;
}

function parseMacros(formData: FormData, prefix = ""): FoodMacros {
  return {
    kcal: parseOptionalFloat(formData.get(`${prefix}kcal`)) ?? undefined,
    protein_g: parseOptionalFloat(formData.get(`${prefix}protein_g`)) ?? undefined,
    carbs_g: parseOptionalFloat(formData.get(`${prefix}carbs_g`)) ?? undefined,
    fat_g: parseOptionalFloat(formData.get(`${prefix}fat_g`)) ?? undefined,
  };
}

function actionErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? toFriendlyActionError(err.message, fallback) || fallback : fallback;
}

// ============================================================================
// Biblioteca de alimentos
// ============================================================================

export async function createFoodAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const name = String(formData.get("name") || "").trim();

  if (!name) {
    return { error: "Informe o nome do alimento." };
  }

  try {
    await createFoodRecord({
      name,
      unit: parseOptionalText(formData.get("unit")) ?? undefined,
      category: parseOptionalText(formData.get("category")) ?? undefined,
      macros: parseMacros(formData),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar o alimento.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function updateFoodAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const foodId = String(formData.get("foodId") || "");
  const name = String(formData.get("name") || "").trim();

  if (!foodId || !name) {
    return { error: "Informe o nome do alimento." };
  }

  try {
    await updateFoodRecord(foodId, {
      name,
      unit: parseOptionalText(formData.get("unit")) ?? "",
      category: parseOptionalText(formData.get("category")) ?? "",
      macros: parseMacros(formData),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar o alimento.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function archiveFoodAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const foodId = String(formData.get("foodId") || "");
  if (!foodId) return;
  try {
    await archiveFoodRecord(foodId);
  } catch (err) {
    console.error("Não foi possível arquivar o alimento:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function unarchiveFoodAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const foodId = String(formData.get("foodId") || "");
  if (!foodId) return;
  try {
    await unarchiveFoodRecord(foodId);
  } catch (err) {
    console.error("Não foi possível reativar o alimento:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Equivalências de alimentos (biblioteca por conta)
// ============================================================================

export async function createFoodEquivalenceAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const foodId = String(formData.get("foodId") || "");
  const equivalentFoodId = String(formData.get("equivalentFoodId") || "");
  const factor = parseOptionalFloat(formData.get("factor"));

  const validationError = validateFoodEquivalenceInput({ foodId, equivalentFoodId, factor });
  if (validationError) return { error: validationError };

  try {
    await createFoodEquivalenceRecord({
      foodId,
      equivalentFoodId,
      factor: factor ?? undefined,
      note: parseOptionalText(formData.get("note")) ?? undefined,
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar a equivalência.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteFoodEquivalenceAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const equivalenceId = String(formData.get("equivalenceId") || "");
  if (!equivalenceId) return;
  try {
    await deleteFoodEquivalenceRecord(equivalenceId);
  } catch (err) {
    console.error("Não foi possível excluir a equivalência:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Ciclo de vida do plano — rascunho / publicar / descartar / duplicar / template / metas
// ============================================================================

export async function createDraftAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const name = String(formData.get("name") || "").trim();
  const source = String(formData.get("source") || "").trim();

  if (!clientId) return { error: "Aluno inválido." };

  try {
    let fromPlanId: string | undefined;
    if (source.startsWith("plan:") || source.startsWith("template:")) {
      fromPlanId = source.split(":")[1];
    }
    await createNutritionDraftRecord(clientId, { name: name || undefined, fromPlanId });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar o rascunho.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function discardDraftAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  if (!planId) return { error: "Rascunho inválido." };

  try {
    await discardNutritionDraftRecord(planId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível descartar o rascunho.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function publishDraftAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  if (!planId) return { error: "Rascunho inválido." };

  try {
    await publishNutritionPlanRecord(planId);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível publicar a nutrição.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function saveAsTemplateAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const name = String(formData.get("name") || "").trim();
  if (!planId || !name) return { error: "Informe o nome do template." };

  try {
    await duplicateNutritionPlanRecord({ sourcePlanId: planId, asTemplate: true, name });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível salvar o template.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function applyTemplateAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!clientId || !templateId) return { error: "Selecione um template." };

  try {
    await duplicateNutritionPlanRecord({ sourcePlanId: templateId, targetClientId: clientId, asTemplate: false });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível aplicar o template.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function duplicateToClientAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const targetClientId = String(formData.get("targetClientId") || "");
  if (!planId || !targetClientId) return { error: "Selecione o aluno de destino." };

  try {
    await duplicateNutritionPlanRecord({ sourcePlanId: planId, targetClientId, asTemplate: false });
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
    await deleteNutritionTemplateRecord(templateId);
  } catch (err) {
    console.error("Não foi possível excluir o template:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function updateGoalsAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  if (!planId) return { error: "Plano inválido." };

  const input = {
    targetKcal: parseOptionalInt(formData.get("target_kcal")),
    targetProteinG: parseOptionalFloat(formData.get("target_protein_g")),
    targetCarbsG: parseOptionalFloat(formData.get("target_carbs_g")),
    targetFatG: parseOptionalFloat(formData.get("target_fat_g")),
    targetWaterMl: parseOptionalInt(formData.get("target_water_ml")),
  };

  const validationError = validateNutritionGoalsInput(input);
  if (validationError) return { error: validationError };

  try {
    await updateNutritionGoalsRecord(planId, input);
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível salvar as metas.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

// ============================================================================
// Refeições
// ============================================================================

export async function addMealAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const name = String(formData.get("name") || "").trim();
  const dayOfWeek = parseDayOfWeek(formData.get("day_of_week"));
  const time = parseOptionalText(formData.get("time"));
  const notes = parseOptionalText(formData.get("notes"));

  const validationError = validateMealInput({ name, time, dayOfWeek, notes });
  if (validationError) return { error: validationError };

  if (!planId) return { error: "Plano inválido." };

  try {
    await addMealRecord(planId, { name, time, day_of_week: dayOfWeek, notes });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar a refeição.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function updateMealAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  const name = String(formData.get("name") || "").trim();
  const dayOfWeek = parseDayOfWeek(formData.get("day_of_week"));
  const time = parseOptionalText(formData.get("time"));
  const notes = parseOptionalText(formData.get("notes"));

  const validationError = validateMealInput({ name, time, dayOfWeek, notes });
  if (validationError) return { error: validationError };

  if (!mealId) return { error: "Refeição inválida." };

  try {
    await updateMealRecord(mealId, { name, time, day_of_week: dayOfWeek, notes });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar a refeição.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteMealAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  if (!mealId) return;
  try {
    await deleteMealRecord(mealId);
  } catch (err) {
    console.error("Não foi possível remover a refeição:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function duplicateMealAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  if (!mealId) return;
  try {
    await duplicateMealRecord(mealId);
  } catch (err) {
    console.error("Não foi possível duplicar a refeição:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

/** Move uma refeição ↑/↓ DENTRO DO MESMO "dia" — `orderJson` já vem só com os ids das
 * refeições daquele dia exato (calculado no componente, mesmo padrão de `dayOrderIds` do
 * treino), então `dayOfWeek` (também enviado) é só repassado pra `reorderMeals`. */
export async function moveMealAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const mealId = String(formData.get("mealId") || "");
  const direction = Number(formData.get("direction")) === -1 ? -1 : 1;
  const orderJson = String(formData.get("orderJson") || "[]");
  const dayOfWeekRaw = String(formData.get("dayOfWeek") || "");
  const dayOfWeek = dayOfWeekRaw ? Number(dayOfWeekRaw) : null;

  try {
    const currentOrder: string[] = JSON.parse(orderJson);
    const index = currentOrder.indexOf(mealId);
    if (index === -1) return;
    const nextOrder = moveItem(currentOrder, index, direction as -1 | 1);
    if (nextOrder === currentOrder) return;
    await reorderMealsRecord(planId, dayOfWeek, nextOrder);
  } catch (err) {
    console.error("Não foi possível reordenar as refeições:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function duplicateDayAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const planId = String(formData.get("planId") || "");
  const sourceDay = parseDayOfWeek(formData.get("sourceDay"));
  const targetDay = parseDayOfWeek(formData.get("targetDay"));
  const sourceIsEveryday = String(formData.get("sourceDay") || "") === "";
  const targetIsEveryday = String(formData.get("targetDay") || "") === "";

  if (!planId) return { error: "Plano inválido." };
  if ((sourceIsEveryday ? null : sourceDay) === (targetIsEveryday ? null : targetDay)) {
    return { error: "Escolha um dia de destino diferente do dia de origem." };
  }

  try {
    const count = await duplicateNutritionDayRecord(
      planId,
      sourceIsEveryday ? null : sourceDay,
      targetIsEveryday ? null : targetDay
    );
    if (count === 0) return { error: "Não há refeições no dia de origem para duplicar." };
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível duplicar o dia.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

// ============================================================================
// Itens da refeição
// ============================================================================

export async function addMealItemAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  const foodId = String(formData.get("foodId") || "");
  const quantity = parseOptionalFloat(formData.get("quantity"));
  const unit = parseOptionalText(formData.get("unit"));

  const validationError = validateMealItemInput({ foodId, quantity, unit });
  if (validationError) return { error: validationError };

  if (!mealId) return { error: "Refeição inválida." };

  try {
    await addMealItemRecord(mealId, foodId, {
      quantity,
      unit,
      notes: parseOptionalText(formData.get("notes")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível adicionar o alimento.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function updateMealItemAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const itemId = String(formData.get("itemId") || "");
  const quantity = parseOptionalFloat(formData.get("quantity"));
  const unit = parseOptionalText(formData.get("unit"));

  if (quantity != null && quantity < 0) return { error: "Quantidade não pode ser negativa." };
  if (unit && unit.length > 20) return { error: "Unidade deve ter até 20 caracteres." };
  if (!itemId) return { error: "Item inválido." };

  try {
    await updateMealItemRecord(itemId, {
      quantity,
      unit,
      notes: parseOptionalText(formData.get("notes")),
      macros: parseMacros(formData),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível editar o item.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteMealItemAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const itemId = String(formData.get("itemId") || "");
  if (!itemId) return;
  try {
    await deleteMealItemRecord(itemId);
  } catch (err) {
    console.error("Não foi possível remover o item:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

export async function moveMealItemAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  const itemId = String(formData.get("itemId") || "");
  const direction = Number(formData.get("direction")) === -1 ? -1 : 1;
  const orderJson = String(formData.get("orderJson") || "[]");

  try {
    const currentOrder: string[] = JSON.parse(orderJson);
    const index = currentOrder.indexOf(itemId);
    if (index === -1) return;
    const nextOrder = moveItem(currentOrder, index, direction as -1 | 1);
    if (nextOrder === currentOrder) return;
    await reorderMealItemsRecord(mealId, nextOrder);
  } catch (err) {
    console.error("Não foi possível reordenar os itens:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}

// ============================================================================
// Substituições equivalentes (por item)
// ============================================================================

export async function addMealSubstitutionAction(
  _prevState: NutricaoActionState,
  formData: FormData
): Promise<NutricaoActionState> {
  const clientId = String(formData.get("clientId") || "");
  const itemId = String(formData.get("itemId") || "");
  const alternativeFoodId = parseOptionalText(formData.get("alternativeFoodId"));
  const alternativeLabel = parseOptionalText(formData.get("alternativeLabel"));

  const validationError = validateSubstitutionInput({ alternativeFoodId, alternativeLabel });
  if (validationError) return { error: validationError };

  if (!itemId) return { error: "Item inválido." };

  try {
    await addMealSubstitutionRecord(itemId, {
      alternativeFoodId,
      alternativeLabel,
      alternativeQty: parseOptionalText(formData.get("alternativeQty")),
      note: parseOptionalText(formData.get("note")),
    });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível adicionar a substituição.") };
  }

  if (clientId) revalidatePath(pathFor(clientId));
  return { success: true };
}

export async function deleteMealSubstitutionAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const substitutionId = String(formData.get("substitutionId") || "");
  if (!substitutionId) return;
  try {
    await deleteMealSubstitutionRecord(substitutionId);
  } catch (err) {
    console.error("Não foi possível remover a substituição:", err);
  }
  if (clientId) revalidatePath(pathFor(clientId));
}
