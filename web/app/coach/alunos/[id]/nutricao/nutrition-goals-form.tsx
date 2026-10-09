"use client";

import { useActionState, useState } from "react";
import type { NutritionPlan } from "@/lib/repository";
import { updateGoalsAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";

/**
 * Metas nutricionais do plano (kcal/proteína/carboidrato/gordura, item 20) e hidratação
 * (meta de água diária, item 20) — colunas `target_*` de `nutrition_plans` (0003).
 * `<details>` fechado por padrão só quando ainda não há nenhuma meta definida (senão fica
 * sempre visível, é informação relevante do plano).
 */
export default function NutritionGoalsForm({ clientId, plan }: { clientId: string; plan: NutritionPlan }) {
  const [state, action, pending] = useActionState(updateGoalsAction, initialState);
  const hasGoals =
    plan.target_kcal != null ||
    plan.target_protein_g != null ||
    plan.target_carbs_g != null ||
    plan.target_fat_g != null ||
    plan.target_water_ml != null;
  const [open, setOpen] = useState(hasGoals);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start min-h-11 rounded-md border border-line px-4 text-sm text-ink hover:border-brand"
      >
        + Definir metas nutricionais e hidratação
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={plan.id} />
      <span className="text-sm font-medium text-ink">Metas nutricionais</span>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className="text-ink-muted">Kcal/dia</span>
          <input
            name="target_kcal"
            type="number"
            min={0}
            defaultValue={plan.target_kcal ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Proteína (g)</span>
          <input
            name="target_protein_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_protein_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Carboidrato (g)</span>
          <input
            name="target_carbs_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_carbs_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Gordura (g)</span>
          <input
            name="target_fat_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_fat_g ?? ""}
            className={INPUT}
          />
        </label>
      </div>

      <label className={`${LABEL} sm:max-w-[220px]`}>
        <span className="text-ink-muted">Hidratação — meta de água (ml/dia)</span>
        <input
          name="target_water_ml"
          type="number"
          min={0}
          placeholder="2000"
          defaultValue={plan.target_water_ml ?? ""}
          className={INPUT}
        />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar metas"}
      </button>
    </form>
  );
}
