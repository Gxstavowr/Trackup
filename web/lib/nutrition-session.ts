/**
 * Funções PURAS da experiência de nutrição do ALUNO (item 21 do master TODO — refeições de
 * hoje, próxima refeição, resumo do dia, progresso de água). Nenhuma função aqui toca banco —
 * só transforma dado já carregado por `lib/repository.ts`, mesmo padrão de separação IO/lógica
 * de `lib/workout-session.ts` (item 19, execução do treino) e `lib/nutrition-builder.ts` (item
 * 20, construtor do coach — de propósito importado aqui: `mealsForDay`/`sumMacros`/`Macros`
 * já resolvem "refeições de um dia" e "soma de macros", sem duplicar). Os testes
 * (`lib/nutrition-session.test.ts`, `npx tsx --test lib/nutrition-session.test.ts`) cobrem a
 * lógica sem precisar de banco.
 */

import { sumMacros, type Macros, type MacroTotals, type WeekDay } from "@/lib/nutrition-builder";

// ============================================================================
// Dia da semana de hoje — converte o relógio de São Paulo (`getSaoPauloClock`,
// `lib/portal-today.ts`, 0=domingo..6=sábado) pra convenção de `meals.day_of_week`
// (1=segunda..7=domingo, usada por `mealsForDay`).
// ============================================================================

export function jsWeekdayToDayOfWeek(jsWeekday: number): WeekDay {
  return (jsWeekday === 0 ? 7 : jsWeekday) as WeekDay;
}

// ============================================================================
// Aderência da refeição — status/dificuldade (meal_logs, item 21)
// ============================================================================

export type MealLogStatus = "done" | "partial" | "skipped";

export const MEAL_STATUS_OPTIONS: { value: MealLogStatus; label: string }[] = [
  { value: "done", label: "Realizada" },
  { value: "partial", label: "Parcial" },
  { value: "skipped", label: "Não realizada" },
];

export function mealStatusLabel(status: MealLogStatus | null | undefined): string {
  return MEAL_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? "Pendente";
}

/** A refeição CONTA como "comida" pra soma de macros consumidos do dia — `done` e `partial`
 * (o aluno comeu algo dela), nunca `skipped`. Decisão simples e documentada: o schema não tem
 * "quanto" foi comido em `partial`, só que não foi 100%; contar o valor cheio é a aproximação
 * mais honesta possível sem inventar um campo de percentual que não existe. */
export function mealCountsAsEaten(status: MealLogStatus | null | undefined): boolean {
  return status === "done" || status === "partial";
}

// ============================================================================
// Resumo do dia — quantas refeições em cada status + macros planejados x consumidos
// ============================================================================

export type DayMealLike = { id: string; items: { macros: Macros }[] };
export type MealLogLike = { meal_id: string | null; status: MealLogStatus };

export type DaySummary = {
  mealsTotal: number;
  mealsDone: number;
  mealsPartial: number;
  mealsSkipped: number;
  mealsPending: number;
  macrosPlanned: MacroTotals;
  macrosConsumed: MacroTotals;
};

/** Indexa os logs do dia por `meal_id` — última linha vence se por acaso vier mais de uma
 * pro mesmo `meal_id` (não deveria acontecer, a unique de `meal_logs` impede, mas a função
 * fica defensiva mesmo assim). */
export function indexMealLogsByMealId<T extends MealLogLike>(logs: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const log of logs) {
    if (log.meal_id) map.set(log.meal_id, log);
  }
  return map;
}

/**
 * Resumo do dia (item 21) a partir das refeições de HOJE (já filtradas por
 * `mealsForDay`/dia da semana) e dos logs de aderência já registrados hoje. `macrosPlanned` é
 * a soma de TODAS as refeições de hoje (o que o plano prevê); `macrosConsumed` só das
 * marcadas `done`/`partial` (ver {@link mealCountsAsEaten}) — nunca as pendentes ou puladas.
 */
export function computeDaySummary(
  todayMeals: DayMealLike[],
  logsByMealId: Map<string, MealLogLike>
): DaySummary {
  let mealsDone = 0;
  let mealsPartial = 0;
  let mealsSkipped = 0;
  const eatenMeals: DayMealLike[] = [];

  for (const meal of todayMeals) {
    const status = logsByMealId.get(meal.id)?.status;
    if (status === "done") mealsDone++;
    else if (status === "partial") mealsPartial++;
    else if (status === "skipped") mealsSkipped++;
    if (mealCountsAsEaten(status)) eatenMeals.push(meal);
  }

  return {
    mealsTotal: todayMeals.length,
    mealsDone,
    mealsPartial,
    mealsSkipped,
    mealsPending: todayMeals.length - mealsDone - mealsPartial - mealsSkipped,
    macrosPlanned: sumMacros(todayMeals.flatMap((m) => m.items)),
    macrosConsumed: sumMacros(eatenMeals.flatMap((m) => m.items)),
  };
}

// ============================================================================
// Água — meta do plano x total registrado no dia
// ============================================================================

/** Mesmo teto do CHECK constraint de `water_logs.amount_ml` (0003) — validado aqui também
 * pra dar um erro amigável na UI em vez de deixar o Postgres rejeitar sem contexto. */
export const WATER_LOG_MAX_ML = 20000;

/** Incrementos rápidos oferecidos na tela (copo/garrafa comuns). */
export const WATER_QUICK_ADD_ML = [200, 300, 500] as const;

export type WaterProgress = {
  consumedMl: number;
  targetMl: number | null;
  /** `null` quando o plano não define meta de água — não faz sentido "progresso" sem meta. */
  pct: number | null;
  remainingMl: number | null;
};

export function computeWaterProgress(consumedMl: number, targetMl: number | null | undefined): WaterProgress {
  const target = targetMl != null && targetMl > 0 ? targetMl : null;
  return {
    consumedMl,
    targetMl: target,
    pct: target != null ? Math.round((consumedMl / target) * 100) : null,
    remainingMl: target != null ? Math.max(0, target - consumedMl) : null,
  };
}

/** Soma um incremento ao total atual, sempre dentro de `[0, WATER_LOG_MAX_ML]` — nunca
 * negativo (zerar é o mínimo) nem acima do teto do banco. */
export function clampWaterMl(amountMl: number): number {
  return Math.min(WATER_LOG_MAX_ML, Math.max(0, Math.round(amountMl)));
}
