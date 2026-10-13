"use client";

import { useActionState, useState } from "react";
import type { MealWithItems, NutritionPlanWithMeals } from "@/lib/repository";
import { dayOfWeekLabel, WEEKDAY_OPTIONS, type WeekDay } from "@/lib/nutrition-builder";
import { macrosSummaryText, sumKnownMacros } from "@/lib/food-macros";
import { Button, Modal, Select, labelClass } from "@/components/ui";
import { copyMealAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;

function mealLabel(meal: MealWithItems): string {
  const kcal = macrosSummaryText({ kcal: sumKnownMacros(meal.items).kcal });
  return [meal.time?.slice(0, 5), meal.name, kcal].filter(Boolean).join(" · ");
}

/**
 * "Copiar refeição": traz uma refeição de outro dia do mesmo plano ou de um template para o
 * dia selecionado (refeição + alimentos + substituições), sem migration — leitura + inserts.
 */
export default function CopyMealDialog({
  clientId,
  planId,
  targetDay,
  meals,
  templates,
}: {
  clientId: string;
  planId: string;
  targetDay: WeekDay;
  meals: MealWithItems[];
  templates: NutritionPlanWithMeals[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: NutricaoActionState, fd: FormData) => {
    const result = await copyMealAction(prev, fd);
    if (result?.success) setOpen(false);
    return result;
  }, initialState);

  const sameDays = WEEKDAY_OPTIONS.map((d) => ({
    label: d.label,
    meals: meals.filter((m) => m.day_of_week === d.value && m.day_of_week !== targetDay),
  })).filter((g) => g.meals.length > 0);
  const everyday = meals.filter((m) => m.day_of_week == null);
  const templatesWithMeals = templates.filter((t) => t.meals.length > 0);
  const hasSources = sameDays.length > 0 || everyday.length > 0 || templatesWithMeals.length > 0;

  return (
    <>
      <Button type="button" variant="secondary" icon="plus" onClick={() => setOpen(true)}>
        Copiar refeição de outro dia ou template
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Copiar refeição">
        {open && (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="clientId" value={clientId} />
            <input type="hidden" name="planId" value={planId} />
            {!hasSources ? (
              <p className="text-sm text-ink-muted">
                Ainda não há refeições em outros dias nem templates com refeições para copiar.
              </p>
            ) : (
              <>
                <label className={labelClass}>
                  Refeição de origem
                  <Select name="sourceMealId" required defaultValue="">
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {everyday.length > 0 && (
                      <optgroup label="Neste plano · Todo dia">
                        {everyday.map((m) => (
                          <option key={m.id} value={m.id}>
                            {mealLabel(m)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {sameDays.map((g) => (
                      <optgroup key={g.label} label={`Neste plano · ${g.label}`}>
                        {g.meals.map((m) => (
                          <option key={m.id} value={m.id}>
                            {mealLabel(m)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {templatesWithMeals.map((t) => (
                      <optgroup key={t.id} label={`Template · ${t.name}`}>
                        {t.meals.map((m) => (
                          <option key={m.id} value={m.id}>
                            {mealLabel(m)} ({dayOfWeekLabel(m.day_of_week)})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </label>
                <label className={labelClass}>
                  Copiar para
                  <Select name="targetDay" defaultValue={String(targetDay)}>
                    <option value="">Todo dia</option>
                    {WEEKDAY_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </>
            )}
            {state?.error && (
              <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
                {state.error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              {hasSources && (
                <Button type="submit" disabled={pending}>
                  {pending ? "Copiando…" : "Copiar"}
                </Button>
              )}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
