"use server";

import { revalidatePath } from "next/cache";
import {
  addCustomMetric,
  setMetricGoal,
  setMetricTracked,
} from "@/lib/metrics-settings";
import type { MetricDirection } from "@/lib/metrics-catalog";
import { actionErrorMessage } from "@/lib/action-errors";

/**
 * Server Actions da configuração de métricas por aluno (item 17 do master TODO) — painel em
 * `metric-settings-panel.tsx`, dados em `lib/metrics-settings.ts`.
 */

export type MetricSettingsActionState = { error?: string; success?: boolean } | null;

function pathFor(clientId: string): string {
  return `/coach/alunos/${clientId}`;
}

/** Server Action do formulário "Nova métrica" (custom, só deste aluno). */
export async function addCustomMetricAction(
  _prevState: MetricSettingsActionState,
  formData: FormData
): Promise<MetricSettingsActionState> {
  const clientId = String(formData.get("clientId") || "");
  const label = String(formData.get("label") || "").trim();
  const unit = String(formData.get("unit") || "").trim();

  if (!clientId) return { error: "Aluno inválido." };
  if (!label) return { error: "Dê um nome para a métrica." };
  if (label.length > 60) return { error: "Use no máximo 60 caracteres." };
  if (unit.length > 20) return { error: "Unidade muito longa." };

  try {
    await addCustomMetric(clientId, { label, unit: unit || null });
  } catch (err) {
    return { error: actionErrorMessage(err, "Não foi possível criar a métrica.") };
  }

  revalidatePath(pathFor(clientId));
  return { success: true };
}

/**
 * Alterna acompanhar/ocultar (SOFT — nunca apaga histórico, só troca `tracked`). Form simples sem
 * `useActionState`, mesmo padrão de `publishWorkoutPlanAction` (app/coach/alunos/[id]/treino/actions.ts)
 * — uma falha aqui não precisa de feedback dedicado na UI (a lista simplesmente não muda).
 */
export async function toggleMetricTrackedAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const metricKey = String(formData.get("metricKey") || "");
  const nextTracked = formData.get("nextTracked") === "true";
  if (!clientId || !metricKey) return;

  await setMetricTracked(clientId, metricKey, nextTracked);
  revalidatePath(pathFor(clientId));
}

function parseDirection(raw: FormDataEntryValue | null): MetricDirection | null {
  const value = String(raw || "");
  return value === "increase" || value === "decrease" || value === "maintain" ? value : null;
}

/** Define a meta (valor-alvo + direção) de uma métrica pro aluno. Mesmo padrão sem estado do toggle. */
export async function setMetricGoalAction(formData: FormData): Promise<void> {
  const clientId = String(formData.get("clientId") || "");
  const metricKey = String(formData.get("metricKey") || "");
  if (!clientId || !metricKey) return;

  const rawTarget = String(formData.get("targetValue") || "").trim().replace(",", ".");
  const targetValue = rawTarget === "" ? null : Number(rawTarget);
  if (targetValue != null && !Number.isFinite(targetValue)) return; // valor inválido: não altera nada

  await setMetricGoal(clientId, metricKey, {
    targetValue,
    goalDirection: parseDirection(formData.get("goalDirection")),
  });
  revalidatePath(pathFor(clientId));
}
