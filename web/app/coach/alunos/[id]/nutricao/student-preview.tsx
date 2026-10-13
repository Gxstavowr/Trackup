import { useMemo } from "react";
import type { FoodEquivalenceWithFoods, MealWithItems, NutritionPlan } from "@/lib/repository";
import { sumKnownMacros } from "@/lib/food-macros";
import { mealsKcal } from "@/lib/meal-kcal";
import { sortMealsForStudent } from "@/lib/nutrition-builder";
import { formatWaterMl } from "@/lib/nutrition-session";
import { EmptyState } from "@/components/ui/empty-state";
import DaySummaryCard from "@/app/portal/nutricao/day-summary";
import NutritionMealCard from "@/app/portal/nutricao/meal-card";

const NO_LOG = {
  initialStatus: null,
  initialDifficulty: null,
  initialNote: "",
  initialStoragePath: null,
  initialPhotoUrl: null,
} as const;

/**
 * "Como o aluno vê": renderiza os MESMOS componentes da tela `/portal/nutricao` —
 * `DaySummaryCard` (previsto x metas, modo "plan", o mesmo que o aluno vê em dia que não é hoje)
 * e `NutritionMealCard` em `readOnly` (sem registro de consumo) —, na mesma ordem
 * (`sortMealsForStudent`) e com os mesmos totais (`lib/meal-kcal.ts` + `sumKnownMacros`).
 * Assim horário, kcal por alimento/refeição ("parcial"/"kcal não informada"), observações do
 * coach, "Pode substituir por" e as equivalências da biblioteca saem idênticos ao portal, sem
 * uma segunda implementação para divergir. Fica de fora só o que depende do dia real do aluno
 * (relógio "Agora/Próxima" e registro de água/consumo).
 */
export default function StudentPreview({
  plan,
  meals,
  dayLabel,
  equivalences,
}: {
  plan: NutritionPlan;
  meals: MealWithItems[];
  dayLabel: string;
  equivalences: FoodEquivalenceWithFoods[];
}) {
  const ordered = sortMealsForStudent(meals);
  const equivalencesByFoodId = useMemo(() => {
    const map = new Map<string, FoodEquivalenceWithFoods[]>();
    for (const eq of equivalences) {
      const list = map.get(eq.food_id) ?? [];
      list.push(eq);
      map.set(eq.food_id, list);
    }
    return map;
  }, [equivalences]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-line-strong bg-surface-sunken/30 p-3 sm:p-4">
      <div>
        <p className="t-label text-ink-faint">Prévia somente leitura · {plan.name}</p>
        <h3 className="font-display text-xl text-ink">Nutrição · {dayLabel}</h3>
      </div>

      <DaySummaryCard
        mode="plan"
        plannedKcal={mealsKcal(ordered)}
        consumedKcal={null}
        plannedMacros={sumKnownMacros(ordered.flatMap((m) => m.items))}
        consumedMacros={null}
        targets={plan}
        mealsTotal={ordered.length}
        mealsEaten={0}
        mealsSkipped={0}
        dayLabel={dayLabel.toLowerCase()}
      />

      {plan.target_water_ml != null && (
        <p className="rounded-md border border-line px-3 py-2 text-sm text-ink-muted">
          Meta de água do dia: <b className="text-ink">{formatWaterMl(plan.target_water_ml)}</b>
        </p>
      )}

      {ordered.length === 0 ? (
        <EmptyState compact icon="nutrition" title="Nenhuma refeição neste dia" />
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((meal) => (
            <NutritionMealCard
              key={meal.id}
              clientId=""
              logDate=""
              meal={meal}
              readOnly
              equivalencesByFoodId={equivalencesByFoodId}
              formProps={NO_LOG}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-faint">
        No dia de hoje, o aluno também vê o horário ao vivo (Agora / Próxima), o controle de água e o botão
        “Registrar consumo” em cada refeição.
      </p>
    </div>
  );
}
