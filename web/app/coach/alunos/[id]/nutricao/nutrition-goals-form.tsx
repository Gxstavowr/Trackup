"use client";

import { useActionState, useState } from "react";
import type { NutritionPlan } from "@/lib/repository";
import { updateGoalsAction, type NutricaoActionState } from "./actions";
import { inputClass, labelClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

const initialState: NutricaoActionState = null;

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
        className={buttonClass({ variant: "secondary", className: "self-start" })}
      >
        + Definir metas e hidratação
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 card p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={plan.id} />
      <span className="text-sm font-medium text-ink">Metas e hidratação</span>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={labelClass}>
          <span className="text-ink-muted">Kcal/dia</span>
          <input
            name="target_kcal"
            type="number"
            min={0}
            defaultValue={plan.target_kcal ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="text-ink-muted">Proteína (g)</span>
          <input
            name="target_protein_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_protein_g ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="text-ink-muted">Carboidrato (g)</span>
          <input
            name="target_carbs_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_carbs_g ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          <span className="text-ink-muted">Gordura (g)</span>
          <input
            name="target_fat_g"
            type="number"
            min={0}
            step="any"
            defaultValue={plan.target_fat_g ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <label className={`${labelClass} sm:max-w-[220px]`}>
        <span className="text-ink-muted">Hidratação — meta de água (ml/dia)</span>
        <input
          name="target_water_ml"
          type="number"
          min={0}
          placeholder="2000"
          defaultValue={plan.target_water_ml ?? ""}
          className={inputClass}
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
        className={buttonClass({ variant: "secondary", className: "self-start" })}
      >
        {pending ? "Salvando…" : "Salvar metas"}
      </button>
    </form>
  );
}
