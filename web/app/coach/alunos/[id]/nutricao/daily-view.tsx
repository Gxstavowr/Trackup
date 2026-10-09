"use client";

import { useState } from "react";
import type { Food, MealWithItems, NutritionPlan } from "@/lib/repository";
import { macroProgress, mealsForDay, sumMacros, WEEKDAY_OPTIONS, type WeekDay } from "@/lib/nutrition-builder";
import MealCard from "./meal-card";

/**
 * Visualização diária (item 20): abas de dia da semana — cada uma mostra as refeições
 * daquele dia + as marcadas "todo dia", ordenadas ("todo dia" primeiro, depois por
 * `sort_order`), com o total de macros do dia e o progresso em relação às metas do plano
 * (`target_*`, quando definidas). Reordenar/duplicar/remover continuam operando dentro do
 * "dia" EXATO de cada refeição (`siblingsFor`) — a mistura visual de "todo dia" + dia
 * específico é só de leitura, a ordenação real de cada grupo continua independente (mesma
 * regra das funções SQL `reorder_nutrition_meals`/`duplicate_nutrition_day`, 0008).
 */
export default function DailyView({
  clientId,
  planId,
  meals,
  foods,
  plan,
  editable,
}: {
  clientId: string;
  planId: string;
  meals: MealWithItems[];
  foods: Food[];
  plan: NutritionPlan | null;
  editable: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<WeekDay>(1);

  const dayMeals = mealsForDay(meals, selectedDay)
    .slice()
    .sort((a, b) => (a.day_of_week == null ? 0 : 1) - (b.day_of_week == null ? 0 : 1) || a.sort_order - b.sort_order);

  const totals = sumMacros(dayMeals.flatMap((m) => m.items));
  const progress = plan
    ? macroProgress(totals, {
        target_kcal: plan.target_kcal,
        target_protein_g: plan.target_protein_g,
        target_carbs_g: plan.target_carbs_g,
        target_fat_g: plan.target_fat_g,
      })
    : null;

  function siblingsFor(meal: MealWithItems): string[] {
    return meals
      .filter((m) => m.day_of_week === meal.day_of_week)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => m.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Dia da semana">
        {WEEKDAY_OPTIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="tab"
            aria-selected={selectedDay === d.value}
            onClick={() => setSelectedDay(d.value)}
            className={`min-h-11 rounded-md border px-3 text-sm transition-colors ${
              selectedDay === d.value
                ? "border-brand bg-brand-tint text-brand"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface-sunken/40 px-3 py-2 text-xs text-ink-muted">
        <span>
          Total do dia: {totals.kcal} kcal
          {progress?.kcal != null && ` (${progress.kcal}% da meta)`}
        </span>
        <span>
          Proteína: {totals.protein_g}g{progress?.protein_g != null && ` (${progress.protein_g}%)`}
        </span>
        <span>
          Carbo: {totals.carbs_g}g{progress?.carbs_g != null && ` (${progress.carbs_g}%)`}
        </span>
        <span>
          Gordura: {totals.fat_g}g{progress?.fat_g != null && ` (${progress.fat_g}%)`}
        </span>
        {plan?.target_water_ml != null && <span>Meta de água: {plan.target_water_ml}ml</span>}
      </div>

      {dayMeals.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhuma refeição configurada para este dia ainda.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {dayMeals.map((meal) => {
            const siblingIds = siblingsFor(meal);
            return (
              <MealCard
                key={meal.id}
                clientId={clientId}
                planId={planId}
                meal={meal}
                siblingIds={siblingIds}
                isFirst={siblingIds[0] === meal.id}
                isLast={siblingIds[siblingIds.length - 1] === meal.id}
                foods={foods}
                editable={editable}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
