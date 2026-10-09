import {
  getActiveNutritionPlanForClient,
  getFoodEquivalencesForFoods,
  getMealLogsForDate,
  getWaterLogForDate,
  type FoodEquivalenceWithFoods,
} from "@/lib/repository";
import { getSaoPauloClock, pickNextMeal, todayDateSP } from "@/lib/portal-today";
import { mealsForDay } from "@/lib/nutrition-builder";
import { computeDaySummary, indexMealLogsByMealId, jsWeekdayToDayOfWeek } from "@/lib/nutrition-session";
import { getMealPhotoUrl } from "@/lib/storage/meal-photos";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import DaySummaryCard from "./day-summary";
import NutritionMealCard from "./meal-card";
import WaterTracker from "./water-tracker";

/**
 * Tela "Nutrição" do aluno (item 21 do master TODO — expansão completa da fatia mínima do
 * item 4, espelhando `/portal/treino`, item 19): refeições de HOJE (o schema não tem "dia"
 * próprio — é `meals.day_of_week`, 1=segunda..7=domingo, `null`=todo dia; `mealsForDay`,
 * `lib/nutrition-builder.ts`, já resolve isso pro coach e é reaproveitada aqui tal e qual),
 * próxima refeição, detalhes sob demanda (itens/quantidades/macros/substituições/
 * equivalências), aderência real (`meal_logs`) com dificuldade e foto opcionais, meta de água
 * (`water_logs` x `target_water_ml`) e resumo do dia. Só lê o plano PUBLICADO
 * (`getActiveNutritionPlanForClient` já filtra `is_draft = false`).
 */
export default async function PortalNutritionPage() {
  const { client } = await requireClient();

  const now = new Date();
  const clock = getSaoPauloClock(now);
  const logDate = todayDateSP(now);
  const todayDow = jsWeekdayToDayOfWeek(clock.weekday);

  const plan = await getActiveNutritionPlanForClient(client.id);

  if (!plan) {
    return (
      <>
        <PageHeader title="Nutrição" />
        <EmptyState
          title="Nenhum plano de nutrição publicado ainda"
          text="Seu coach ainda não publicou um plano de nutrição para você. Assim que estiver pronto, ele aparece aqui."
        />
      </>
    );
  }

  // "Todo dia" primeiro, depois por sort_order dentro de cada grupo — mesma ordenação visual
  // da visualização diária do coach (`daily-view.tsx`, item 20), só de leitura aqui.
  const todayMeals = mealsForDay(plan.meals, todayDow)
    .slice()
    .sort((a, b) => (a.day_of_week == null ? 0 : 1) - (b.day_of_week == null ? 0 : 1) || a.sort_order - b.sort_order);

  const foodIdsToday = Array.from(
    new Set(todayMeals.flatMap((m) => m.items.map((item) => item.food_id)).filter((id): id is string => id != null))
  );

  const [logs, waterLog, equivalences] = await Promise.all([
    getMealLogsForDate(client.id, logDate),
    getWaterLogForDate(client.id, logDate),
    getFoodEquivalencesForFoods(foodIdsToday),
  ]);

  const logsByMealId = indexMealLogsByMealId(logs);
  const summary = computeDaySummary(todayMeals, logsByMealId);
  const next = pickNextMeal(todayMeals, clock.minutes);

  const equivalencesByFoodId = new Map<string, FoodEquivalenceWithFoods[]>();
  for (const eq of equivalences) {
    const list = equivalencesByFoodId.get(eq.food_id) ?? [];
    list.push(eq);
    equivalencesByFoodId.set(eq.food_id, list);
  }

  // Assina (em paralelo) a foto de cada refeição que já tem uma registrada hoje.
  const photoUrlByMealId = new Map<string, string | null>();
  await Promise.all(
    logs
      .filter((log) => log.meal_id && log.storage_path)
      .map(async (log) => {
        photoUrlByMealId.set(log.meal_id as string, await getMealPhotoUrl(client.id, log.storage_path));
      })
  );

  return (
    <>
      <PageHeader title="Nutrição" eyebrow={plan.name} />

      <DaySummaryCard summary={summary} targets={plan} />

      {plan.target_water_ml != null && (
        <WaterTracker
          clientId={client.id}
          logDate={logDate}
          initialAmountMl={waterLog?.amount_ml ?? 0}
          targetMl={plan.target_water_ml}
        />
      )}

      {todayMeals.length === 0 ? (
        <div className={`${CARD} p-4`}>
          <p className="text-sm text-ink-muted">
            {plan.meals.length === 0
              ? "Este plano ainda não tem refeições configuradas."
              : "Nenhuma refeição configurada para hoje — confira outro dia com seu coach, se for o caso."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {todayMeals.map((meal) => {
            const log = logsByMealId.get(meal.id) ?? null;
            return (
              <NutritionMealCard
                key={meal.id}
                clientId={client.id}
                logDate={logDate}
                meal={meal}
                status={log?.status ?? null}
                isNext={next?.meal.id === meal.id}
                equivalencesByFoodId={equivalencesByFoodId}
                formProps={{
                  initialStatus: log?.status ?? null,
                  initialDifficulty: log?.difficulty ?? null,
                  initialNote: log?.note ?? "",
                  initialStoragePath: log?.storage_path ?? null,
                  initialPhotoUrl: photoUrlByMealId.get(meal.id) ?? null,
                }}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
