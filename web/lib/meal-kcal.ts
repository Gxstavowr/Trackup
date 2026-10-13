/**
 * kcal por alimento, refeição e dia (V3 tarefa 11) — camada fina sobre `lib/food-macros.ts`
 * (helper único de macros). `meal_items.macros` já guarda o valor ESCALADO pela quantidade, então
 * aqui só se soma o que existe e se conta o que falta: nunca inventa número nem trata ausência
 * como 0. Puro (sem I/O) — usado pelo portal do aluno e reaproveitável no editor do coach.
 */

import { formatNumber, sumKnownMacros, type MacrosJson } from "./food-macros";

type WithMacros = { macros: MacrosJson | null | undefined };

export type KcalSum = {
  /** Soma das kcal conhecidas; `null` se NENHUM item tem kcal. */
  kcal: number | null;
  itemCount: number;
  /** Itens sem kcal informada. */
  missingCount: number;
  /** Há soma, mas algum item ficou de fora (total "parcial"). */
  partial: boolean;
};

/** kcal de um item (já escalada pela quantidade); `null` quando não informada. */
export function itemKcal(item: WithMacros): number | null {
  const v = item.macros?.kcal;
  return v != null && Number.isFinite(v) ? v : null;
}

/** Soma as kcal de uma lista de itens, separando o que é conhecido do que falta. */
export function sumItemsKcal(items: WithMacros[]): KcalSum {
  const kcal = sumKnownMacros(items).kcal;
  const missingCount = items.filter((i) => itemKcal(i) == null).length;
  return { kcal, itemCount: items.length, missingCount, partial: kcal != null && missingCount > 0 };
}

/** Total de uma refeição. */
export function mealKcal(meal: { items: WithMacros[] }): KcalSum {
  return sumItemsKcal(meal.items);
}

/** Total de várias refeições (o dia). */
export function mealsKcal(meals: { items: WithMacros[] }[]): KcalSum {
  return sumItemsKcal(meals.flatMap((m) => m.items));
}

export const KCAL_MISSING_LABEL = "kcal não informada";

/** "192 kcal" ou "kcal não informada" (nunca "0 kcal" para dado ausente). */
export function formatItemKcal(kcal: number | null): string {
  return kcal == null ? KCAL_MISSING_LABEL : `${formatNumber(kcal, 0)} kcal`;
}

/** "520 kcal", "520 kcal · parcial" ou "kcal não informada". */
export function formatKcalSum(sum: KcalSum): string {
  if (sum.kcal == null) return KCAL_MISSING_LABEL;
  return sum.partial ? `${formatNumber(sum.kcal, 0)} kcal · parcial` : `${formatNumber(sum.kcal, 0)} kcal`;
}

/** "2 alimentos sem kcal" — explica o "parcial". `null` quando nada falta. */
export function missingKcalNote(sum: KcalSum): string | null {
  if (sum.missingCount === 0) return null;
  return `${sum.missingCount} ${sum.missingCount === 1 ? "alimento sem kcal" : "alimentos sem kcal"}`;
}
