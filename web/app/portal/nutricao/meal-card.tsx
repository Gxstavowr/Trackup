"use client";

import { useState } from "react";
import type { FoodEquivalenceWithFoods, FoodMacros, MealItemWithFood, MealWithItems } from "@/lib/repository";
import { sumMacros } from "@/lib/nutrition-builder";
import { mealStatusLabel, type MealLogStatus } from "@/lib/nutrition-session";
import { CARD } from "../portal-ui";
import MealLogForm from "./meal-log-form";

function macrosSummary(macros: FoodMacros): string | null {
  const parts = [
    macros.kcal != null && `${macros.kcal} kcal`,
    macros.protein_g != null && `${macros.protein_g}g prot`,
    macros.carbs_g != null && `${macros.carbs_g}g carbo`,
    macros.fat_g != null && `${macros.fat_g}g gord`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function statusBadgeClass(status: MealLogStatus | null): string {
  if (status === "done") return "bg-ok-tint text-ok";
  if (status === "partial") return "bg-warn-tint text-warn";
  if (status === "skipped") return "bg-late-tint text-late-text";
  return "";
}

/**
 * Uma refeição do dia na tela do aluno (item 21): cabeçalho com horário/badge de status/
 * "Próxima refeição", detalhes sob demanda (itens, quantidades, macros, substituições
 * específicas do item + equivalências gerais da conta que se aplicam ao alimento) e o
 * registro de aderência (`MealLogForm`, sempre visível — marcar rápido não deveria exigir
 * abrir os detalhes primeiro).
 */
export default function NutritionMealCard({
  clientId,
  logDate,
  meal,
  status,
  isNext,
  equivalencesByFoodId,
  formProps,
}: {
  clientId: string;
  logDate: string;
  meal: MealWithItems;
  status: MealLogStatus | null;
  isNext: boolean;
  equivalencesByFoodId: Map<string, FoodEquivalenceWithFoods[]>;
  formProps: {
    initialStatus: MealLogStatus | null;
    initialDifficulty: number | null;
    initialNote: string;
    initialStoragePath: string | null;
    initialPhotoUrl: string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const totals = sumMacros(meal.items);
  const totalsLabel = macrosSummary(totals);

  return (
    <li className={`${CARD} p-4 flex flex-col gap-3 ${isNext ? "border-brand" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-medium text-ink">{meal.name}</h3>
            {isNext && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-brand">
                Próxima
              </span>
            )}
            {status && (
              <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${statusBadgeClass(status)}`}>
                {mealStatusLabel(status)}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {[
              meal.time && meal.time.slice(0, 5),
              `${meal.items.length} ${meal.items.length === 1 ? "item" : "itens"}`,
              totalsLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {meal.notes && <p className="mt-1 break-words text-xs text-ink-faint">{meal.notes}</p>}
        </div>

        {meal.items.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-11 shrink-0 rounded-md border border-line px-3 text-xs text-ink hover:border-brand"
          >
            {expanded ? "Ocultar detalhes" : "Ver detalhes"}
          </button>
        )}
      </div>

      {expanded && meal.items.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line pt-3">
          {meal.items.map((item) => (
            <MealItemDetail key={item.id} item={item} equivalences={item.food_id ? equivalencesByFoodId.get(item.food_id) : undefined} />
          ))}
        </ul>
      )}

      <MealLogForm
        clientId={clientId}
        logDate={logDate}
        mealId={meal.id}
        mealName={meal.name}
        initialStatus={formProps.initialStatus}
        initialDifficulty={formProps.initialDifficulty}
        initialNote={formProps.initialNote}
        initialStoragePath={formProps.initialStoragePath}
        initialPhotoUrl={formProps.initialPhotoUrl}
      />
    </li>
  );
}

function MealItemDetail({
  item,
  equivalences,
}: {
  item: MealItemWithFood;
  equivalences: FoodEquivalenceWithFoods[] | undefined;
}) {
  const macrosLabel = macrosSummary(item.macros);
  const hasSwaps = item.substitutions.length > 0 || (equivalences && equivalences.length > 0);

  return (
    <li className="rounded-md border border-line bg-surface-sunken/40 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="break-words font-medium text-ink">{item.food?.name ?? "Alimento removido"}</span>
        {item.qty && <span className="text-ink-muted">{item.qty}</span>}
      </div>
      {macrosLabel && <p className="text-xs text-ink-faint">{macrosLabel}</p>}
      {item.notes && <p className="break-words text-xs text-ink-faint">{item.notes}</p>}

      {hasSwaps && (
        <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Pode substituir por
          </span>
          {item.substitutions.map((sub) => (
            <p key={sub.id} className="break-words text-xs text-ink-muted">
              {sub.alternative_food?.name ?? sub.alternative_label ?? "Alternativa"}
              {sub.alternative_qty ? ` — ${sub.alternative_qty}` : ""}
              {sub.note ? ` (${sub.note})` : ""}
            </p>
          ))}
          {equivalences?.map((eq) => (
            <p key={eq.id} className="break-words text-xs text-ink-muted">
              Equivale a {eq.equivalent_food?.name ?? "outro alimento"}
              {eq.factor != null && eq.factor !== 1 ? ` (fator ${eq.factor})` : ""}
              {eq.note ? ` — ${eq.note}` : ""}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}
