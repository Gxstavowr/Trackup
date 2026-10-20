import {
  getActiveNutritionPlanForClient,
  getFoodEquivalencesForFoods,
  getMealLogsForDate,
  getWaterLogForDate,
  type FoodEquivalenceWithFoods,
} from "@/lib/repository";
import { getSaoPauloClock, todayDateSP } from "@/lib/portal-today";
import { daysWithMeals, mealsForDay, sortMealsForStudent, type WeekDay } from "@/lib/nutrition-builder";
import { computeDaySummary, indexMealLogsByMealId, jsWeekdayToDayOfWeek, mealCountsAsEaten } from "@/lib/nutrition-session";
import { getMealPhotoUrl } from "@/lib/storage/meal-photos";
import Link from "next/link";
import { sumKnownMacros } from "@/lib/food-macros";
import { mealsKcal } from "@/lib/meal-kcal";
import type { ClockLogStatus } from "@/lib/meal-clock";
import { EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import { accessForModule, getMyOnboardingStatus } from "@/lib/onboarding/status";
import ModuleLock from "@/components/portal/module-lock";
import ModulePreparing from "@/components/portal/module-preparing";
import { MealClockProvider, NextMealStrip } from "../meal-clock";
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
const DAY_SHORT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const DAY_LONG = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

export default async function PortalNutritionPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams;
  const { client } = await requireClient();

  // V5 (itens 15/16): módulo fora do pacote -> cadeado; incluído e não publicado -> em preparação.
  // Retorna ANTES de buscar o plano: o servidor não carrega dados de módulo não liberado.
  // Aluno legado (sem pacote) não passa por aqui: comportamento anterior.
  const status = await getMyOnboardingStatus(client.id);
  if (status.error) {
    return (
      <>
        <PageHeader title="Nutrição" />
        <p role="status" className="text-sm text-ink-muted">
          Não foi possível carregar seu plano agora. Tente de novo.
        </p>
      </>
    );
  }
  const access = accessForModule(status, "nutrition");
  if (access && access.state !== "available") {
    return (
      <>
        <PageHeader title="Nutrição" />
        {access.state === "not_contracted" ? (
          <ModuleLock module="nutrition" pkg={status.package} />
        ) : (
          <ModulePreparing
            module="nutrition"
            dueAt={access.dueAt}
            isOverdue={access.isOverdue}
            awaitingQuestionnaire={access.state === "awaiting_questionnaire"}
          />
        )}
      </>
    );
  }

  const now = new Date();
  const clock = getSaoPauloClock(now);
  const logDate = todayDateSP(now);
  const todayDow = jsWeekdayToDayOfWeek(clock.weekday);
  const diaNum = Number(dia);
  const viewDow = (Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= 7 ? diaNum : todayDow) as WeekDay;
  const isToday = viewDow === todayDow;

  const plan = await getActiveNutritionPlanForClient(client.id);

  if (!plan) {
    return (
      <>
        <PageHeader title="Nutrição" />
        <EmptyState
          icon="nutrition"
          title="Nenhum plano de nutrição publicado ainda"
          text="Seu coach ainda não publicou um plano de nutrição para você. Assim que estiver pronto, ele aparece aqui."
        />
      </>
    );
  }

  // "Todo dia" primeiro, depois por sort_order dentro de cada grupo — mesma ordenação visual
  // da visualização diária do coach (`daily-view.tsx`, item 20), só de leitura aqui.
  const todayMeals = sortMealsForStudent(mealsForDay(plan.meals, viewDow));

  const foodIdsToday = Array.from(
    new Set(todayMeals.flatMap((m) => m.items.map((item) => item.food_id)).filter((id): id is string => id != null))
  );

  // Registros (aderência/água) só existem para HOJE; outros dias são só consulta do plano.
  const [logs, waterLog, equivalences] = await Promise.all([
    isToday ? getMealLogsForDate(client.id, logDate) : Promise.resolve([]),
    isToday ? getWaterLogForDate(client.id, logDate) : Promise.resolve(null),
    getFoodEquivalencesForFoods(foodIdsToday),
  ]);

  const logsByMealId = indexMealLogsByMealId(logs);
  const summary = computeDaySummary(todayMeals, logsByMealId);

  // Totais com o helper único (`—`/null quando o dado não existe; nunca 0 inventado).
  const allItems = todayMeals.flatMap((m) => m.items);
  const eatenItems = todayMeals
    .filter((m) => mealCountsAsEaten(logsByMealId.get(m.id)?.status))
    .flatMap((m) => m.items);
  const planned = sumKnownMacros(allItems);
  // Sem refeição registrada como feita/parcial: `null` ("nada registrado"), nunca 0 kcal.
  const consumed = eatenItems.length === 0 ? null : sumKnownMacros(eatenItems);
  const plannedKcal = mealsKcal(todayMeals);
  const consumedKcal = eatenItems.length === 0 ? null : mealsKcal([{ items: eatenItems }]);

  // Relógio ao vivo (Agora / Próxima / horário passou) — `app/portal/meal-clock.tsx` +
  // `lib/meal-clock.ts`, mesma regra da Home. Só faz sentido no dia de hoje.
  const clockMeals = plan.meals.map((m) => ({ id: m.id, name: m.name, time: m.time, day_of_week: m.day_of_week }));
  const clockStatuses: Record<string, ClockLogStatus> = {};
  for (const [mealId, log] of logsByMealId) clockStatuses[mealId] = log.status;

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

  const variesByDay = daysWithMeals(plan.meals).length > 0;

  const dayContent = (
    <>
      <DaySummaryCard
        mode={isToday ? "today" : "plan"}
        plannedKcal={plannedKcal}
        consumedKcal={isToday ? consumedKcal : null}
        plannedMacros={planned}
        consumedMacros={isToday ? consumed : null}
        targets={plan}
        mealsTotal={summary.mealsTotal}
        mealsEaten={summary.mealsDone + summary.mealsPartial}
        mealsSkipped={summary.mealsSkipped}
        dayLabel={DAY_LONG[viewDow - 1]}
      />

      {isToday && plan.target_water_ml != null && (
        <WaterTracker
          clientId={client.id}
          logDate={logDate}
          initialAmountMl={waterLog?.amount_ml ?? 0}
          targetMl={plan.target_water_ml}
        />
      )}

      {todayMeals.length === 0 ? (
        <EmptyState
          compact
          icon="nutrition"
          title={plan.meals.length === 0 ? "Este plano ainda não tem refeições" : "Nenhuma refeição neste dia"}
          text="Confira com seu coach se deveria haver algo por aqui."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {todayMeals.map((meal) => {
            const log = logsByMealId.get(meal.id) ?? null;
            return (
              <NutritionMealCard
                key={meal.id}
                clientId={client.id}
                logDate={logDate}
                meal={meal}
                readOnly={!isToday}
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

  return (
    <>
      <PageHeader title="Nutrição" eyebrow={plan.name} />

      {variesByDay && (
        <nav aria-label="Dia da semana" className="grid grid-cols-7 gap-1">
          {DAY_SHORT.map((label, i) => {
            const dow = i + 1;
            const selected = dow === viewDow;
            return (
              <Link
                key={label}
                href={dow === todayDow ? "/portal/nutricao" : `/portal/nutricao?dia=${dow}`}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 flex-col items-center justify-center rounded-md border text-xs font-semibold ${
                  selected ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted"
                }`}
              >
                {label}
                {dow === todayDow && <span aria-hidden className="mt-0.5 size-1 rounded-full bg-current" />}
              </Link>
            );
          })}
        </nav>
      )}

      {!isToday && (
        <p className="rounded-md bg-info-tint px-3 py-2 text-sm text-ink">
          Plano de <b>{DAY_LONG[viewDow - 1]}</b> — só consulta. O registro é feito no próprio dia.
        </p>
      )}

      {isToday ? (
        <MealClockProvider meals={clockMeals} statuses={clockStatuses} initialNowMs={now.getTime()}>
          <NextMealStrip />
          {dayContent}
        </MealClockProvider>
      ) : (
        dayContent
      )}

      <Link href="/portal/avaliacao#mudancas" className="inline-flex min-h-11 items-center self-start text-sm text-ink-muted hover:text-ink hover:underline">
        Ver histórico de mudanças
      </Link>
    </>
  );
}
