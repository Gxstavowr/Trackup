"use server";

import { revalidatePath } from "next/cache";
import { upsertMealLog, upsertWaterLog } from "@/lib/repository";
import { uploadMealPhoto } from "@/lib/storage/meal-photos";
import { clampWaterMl, type MealLogStatus } from "@/lib/nutrition-session";
import { toFriendlyActionError } from "@/lib/nutrition-builder";

/**
 * Server Actions da experiência de nutrição do aluno (item 21 do master TODO). Mesmo padrão
 * do resto do portal (`app/portal/treino/actions.ts`): confiam no `clientId` vindo do
 * FormData pras tabelas de negócio — a policy de RLS (`meal_logs_client_*`/`water_logs_client_*`,
 * 0003) é quem garante que só o próprio aluno (ou o coach dele) consegue escrever pra aquele
 * `client_id`, não precisa reconferir a sessão aqui. A ÚNICA exceção é o upload de foto
 * (`logMealPhotoAction`), que TOCA STORAGE com o client admin por baixo — `uploadMealPhoto`
 * (`lib/storage/meal-photos.ts`) reconfirma a sessão contra `clientId` antes de qualquer
 * chamada ao Storage, mesmo padrão de `uploadCheckinPhotoAction`.
 */

function revalidateNutricao() {
  revalidatePath("/portal/nutricao");
  revalidatePath("/portal");
}

/** Mensagem de erro pra mostrar na tela do aluno: se um `clientId` forjado esbarrar na policy
 * de RLS (`meal_logs_client_*`/`water_logs_client_*`), o Postgres devolve texto técnico cru
 * ("new row violates row-level security policy…") — nunca mostrar isso; troca pelo `fallback`
 * contextual da própria ação (item 25/37 do TODO). */
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

function isMealLogStatus(value: unknown): value is MealLogStatus {
  return value === "done" || value === "partial" || value === "skipped";
}

export type MealLogActionState = {
  error?: string;
  success?: boolean;
} | null;

/**
 * Registra a aderência de uma refeição no dia (item 21 — "marcar como realizada" +
 * "registrar aderência" + "sinalizar dificuldade" são a MESMA ação: status done/partial/
 * skipped já É a aderência). `storagePath` é o que já foi enviado por
 * `logMealPhotoAction` antes deste submit (campo oculto no formulário) — `undefined`/string
 * vazia preserva a foto já registrada, nunca apaga por engano.
 */
export async function logMealAction(
  _prevState: MealLogActionState,
  formData: FormData
): Promise<MealLogActionState> {
  const clientId = String(formData.get("clientId") || "");
  const mealId = String(formData.get("mealId") || "");
  const mealName = String(formData.get("mealName") || "");
  const logDate = String(formData.get("logDate") || "");
  const statusRaw = formData.get("status");
  const difficulty = parseNumber(formData.get("difficulty"));
  const note = String(formData.get("note") || "");
  const storagePathRaw = formData.get("storagePath");
  const storagePath = typeof storagePathRaw === "string" && storagePathRaw !== "" ? storagePathRaw : undefined;

  if (!clientId || !mealId || !mealName || !logDate || !isMealLogStatus(statusRaw)) {
    return { error: "Não foi possível identificar a refeição." };
  }
  if (difficulty != null && (difficulty < 1 || difficulty > 5)) {
    return { error: "A dificuldade deve ser de 1 a 5." };
  }

  try {
    await upsertMealLog({
      clientId,
      mealId,
      mealName,
      logDate,
      status: statusRaw,
      difficulty,
      note: note || null,
      storagePath,
    });
  } catch (err) {
    return {
      error: actionErrorMessage(err, "Não foi possível registrar a refeição."),
    };
  }

  revalidateNutricao();
  return { success: true };
}

export type UploadMealPhotoState = { url: string; storagePath: string } | { error: string };

/**
 * Upload da foto opcional de uma refeição — uma chamada por refeição, disparada assim que o
 * aluno escolhe o arquivo (o cliente já manda o JPEG comprimido, `lib/storage/compress-image.ts`,
 * mesmo padrão do check-in). O `storagePath` devolvido é guardado no formulário e só vira
 * permanente quando `logMealAction` salva o registro — se o aluno nunca salvar, o objeto fica
 * órfão no bucket (mesmo trade-off aceito pelo check-in: reenviar substitui, não acumula).
 */
export async function logMealPhotoAction(formData: FormData): Promise<UploadMealPhotoState> {
  const file = formData.get("file");
  try {
    const result = await uploadMealPhoto({
      clientId: String(formData.get("clientId") || ""),
      mealId: String(formData.get("mealId") || ""),
      logDate: String(formData.get("logDate") || ""),
      file: file instanceof File ? file : null,
    });
    if (!result.url) return { error: "Foto salva, mas não foi possível gerar a pré-visualização." };
    return { url: result.url, storagePath: result.storagePath };
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível enviar a foto.") };
  }
}

export type WaterLogActionState = { error?: string; success?: boolean; amountMl?: number } | null;

/**
 * Registra o TOTAL de água do dia (item 21 — "mostrar meta de água quando acompanhada"). O
 * valor já vem somado do cliente (`clampWaterMl`, botões rápidos "+200ml"/"+300ml"/"+500ml" ou
 * "zerar") — a action reconfere o teto aqui também (defesa em profundidade, nunca confia só na
 * UI) antes de gravar.
 */
export async function logWaterAction(
  _prevState: WaterLogActionState,
  formData: FormData
): Promise<WaterLogActionState> {
  const clientId = String(formData.get("clientId") || "");
  const logDate = String(formData.get("logDate") || "");
  const amountMl = parseNumber(formData.get("amountMl"));

  if (!clientId || !logDate || amountMl == null) {
    return { error: "Não foi possível identificar o registro de água." };
  }

  const clamped = clampWaterMl(amountMl);

  try {
    await upsertWaterLog(clientId, logDate, clamped);
  } catch (err) {
    return {
      error: actionErrorMessage(err, "Não foi possível registrar a água."),
    };
  }

  revalidateNutricao();
  return { success: true, amountMl: clamped };
}
