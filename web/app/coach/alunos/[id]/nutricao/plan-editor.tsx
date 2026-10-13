"use client";

import { useState } from "react";
import type {
  Food,
  FoodEquivalenceWithFoods,
  MealWithItems,
  NutritionPlan,
  NutritionPlanWithMeals,
} from "@/lib/repository";
import {
  daysWithMeals,
  mealsForDay,
  sortMealsForStudent,
  WEEKDAY_OPTIONS,
  type WeekDay,
} from "@/lib/nutrition-builder";
import { formatNumber, sumKnownMacros, type KnownTotals } from "@/lib/food-macros";
import { KCAL_MISSING_LABEL, mealsKcal, missingKcalNote, type KcalSum } from "@/lib/meal-kcal";
import MealCard from "./meal-card";
import AddMealForm from "./add-meal-form";
import CopyMealDialog from "./copy-meal-dialog";
import StudentPreview from "./student-preview";
import DuplicateDayForm from "./duplicate-day-form";

/** "07:30" / null — chave de horário para saber se duas refeições estão empatadas. */
function timeKey(meal: MealWithItems): string | null {
  return meal.time ? meal.time.slice(0, 5) : null;
}

/**
 * Editor do plano (rascunho) ou visão do publicado: abas de dia da semana, barra de totais do
 * dia contra as metas, cartões de refeição editáveis e a alternância "Editar / Como o aluno
 * vê" (que renderiza os próprios componentes do portal — ver `student-preview.tsx`).
 * As refeições do dia aparecem na MESMA ordem do aluno (`sortMealsForStudent`: por horário,
 * sem horário no fim); ↑/↓ só desempatam refeições no mesmo horário. kcal via
 * `lib/meal-kcal.ts` (mesmo helper do portal), macros via `sumKnownMacros`.
 */
export default function PlanEditor({
  clientId,
  planId,
  meals,
  foods,
  plan,
  templates,
  editable,
  equivalences = [],
}: {
  clientId: string;
  planId: string;
  meals: MealWithItems[];
  foods: Food[];
  plan: NutritionPlan;
  templates: NutritionPlanWithMeals[];
  editable: boolean;
  /** Equivalências da biblioteca para os alimentos do plano — a prévia as mostra como o portal. */
  equivalences?: FoodEquivalenceWithFoods[];
}) {
  const firstDay = daysWithMeals(meals)[0] ?? 1;
  const [selectedDay, setSelectedDay] = useState<WeekDay>(firstDay);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const dayMeals = sortMealsForStudent(mealsForDay(meals, selectedDay));
  const items = dayMeals.flatMap((m) => m.items);
  const totals = sumKnownMacros(items);
  const dayKcal = mealsKcal(dayMeals);

  /**
   * Refeições do mesmo `day_of_week` na ordem exibida (por horário). O ↑/↓ grava essa ordem com
   * o vizinho trocado — só muda algo visível quando os dois têm o mesmo horário, por isso só é
   * oferecido nesse caso.
   */
  function siblingsFor(meal: MealWithItems): MealWithItems[] {
    return sortMealsForStudent(meals.filter((m) => m.day_of_week === meal.day_of_week));
  }

  const dayLabel = WEEKDAY_OPTIONS.find((d) => d.value === selectedDay)?.label ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Dia da semana">
          {WEEKDAY_OPTIONS.map((d) => {
            const count = mealsForDay(meals, d.value).length;
            return (
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
                {d.label.slice(0, 3)}
                <span className="ml-1.5 text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Modo de visualização">
          {(
            [
              ["edit", editable ? "Editar" : "Detalhes"],
              ["preview", editable ? "Como o aluno verá" : "Como o aluno vê hoje"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`min-h-11 rounded px-3 text-sm ${
                mode === value ? "bg-brand-tint text-brand" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "preview" ? (
        // A prévia já traz o resumo do dia do próprio portal; não repete o painel do coach.
        <StudentPreview plan={plan} meals={dayMeals} dayLabel={dayLabel} equivalences={equivalences} />
      ) : (
        <>
          <DayTotals dayLabel={dayLabel} totals={totals} kcal={dayKcal} plan={plan} hasItems={items.length > 0} />

          {dayMeals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">
              Nenhuma refeição configurada para {dayLabel.toLowerCase()} ainda.
              {editable && " Crie uma abaixo ou copie de outro dia."}
            </p>
          ) : (
            <>
              <p className="text-xs text-ink-faint">
                Refeições em ordem de horário, como o aluno vê. Para mudar a ordem, ajuste o horário.
              </p>
              <ul className="flex flex-col gap-4">
                {dayMeals.map((meal) => {
                  const siblings = siblingsFor(meal);
                  const index = siblings.findIndex((m) => m.id === meal.id);
                  const prev = siblings[index - 1];
                  const next = siblings[index + 1];
                  return (
                    <MealCard
                      key={meal.id}
                      clientId={clientId}
                      planId={planId}
                      meal={meal}
                      siblingIds={siblings.map((m) => m.id)}
                      canMoveUp={!!prev && timeKey(prev) === timeKey(meal)}
                      canMoveDown={!!next && timeKey(next) === timeKey(meal)}
                      foods={foods}
                      editable={editable}
                    />
                  );
                })}
              </ul>
            </>
          )}

          {editable && (
            <div className="flex flex-col gap-3">
              <AddMealForm clientId={clientId} planId={planId} defaultDay={selectedDay} />
              <div className="flex flex-wrap items-start gap-3">
                <CopyMealDialog
                  clientId={clientId}
                  planId={planId}
                  targetDay={selectedDay}
                  meals={meals}
                  templates={templates}
                />
                {meals.length > 0 && <DuplicateDayForm clientId={clientId} planId={planId} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const MACRO_ROWS: { key: keyof KnownTotals; label: string; target: keyof NutritionPlan; unit: string; digits: number }[] = [
  { key: "protein_g", label: "Proteína", target: "target_protein_g", unit: " g", digits: 1 },
  { key: "carbs_g", label: "Carboidrato", target: "target_carbs_g", unit: " g", digits: 1 },
  { key: "fat_g", label: "Gordura", target: "target_fat_g", unit: " g", digits: 1 },
];

function barTone(pct: number): string {
  if (pct > 110) return "bg-warning";
  if (pct >= 90) return "bg-success";
  return "bg-brand";
}

function Bar({ value, target }: { value: number | null; target: number | null }) {
  if (value == null || target == null || target <= 0) return null;
  const pct = Math.round((value / target) * 100);
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
      <span className={`block h-full rounded-full ${barTone(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  );
}

/** Total do dia x metas do plano: barra de kcal + P/C/G, e a meta de água. Sem meta, só o total. */
function DayTotals({
  dayLabel,
  totals,
  kcal,
  plan,
  hasItems,
}: {
  dayLabel: string;
  totals: KnownTotals;
  /** kcal do dia por `lib/meal-kcal.ts` (soma do conhecido + quantos itens faltam). */
  kcal: KcalSum;
  plan: NutritionPlan;
  hasItems: boolean;
}) {
  const kcalTarget = plan.target_kcal;
  const kcalPct = kcal.kcal != null && kcalTarget ? Math.round((kcal.kcal / kcalTarget) * 100) : null;
  const missingNote = missingKcalNote(kcal);
  const hasAnyGoal =
    plan.target_kcal != null ||
    plan.target_protein_g != null ||
    plan.target_carbs_g != null ||
    plan.target_fat_g != null;

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label={`Total de ${dayLabel}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="t-label text-ink-faint">Total de {dayLabel.toLowerCase()}</p>
          {kcal.kcal != null ? (
            <p className="font-display text-2xl tabular-nums text-ink">
              {formatNumber(kcal.kcal, 0)}
              <span className="ml-1 text-sm text-ink-muted">
                kcal{kcalTarget != null ? ` de ${formatNumber(kcalTarget, 0)}` : ""}
                {kcalPct != null ? ` · ${kcalPct}%` : ""}
              </span>
              {kcal.partial && <span className="ml-2 text-xs font-semibold text-ink-faint">parcial</span>}
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-faint">
              {hasItems ? KCAL_MISSING_LABEL : "Nenhum alimento neste dia"}
              {kcalTarget != null && <span className="text-ink-muted"> · meta {formatNumber(kcalTarget, 0)} kcal</span>}
            </p>
          )}
        </div>
        {plan.target_water_ml != null && (
          <p className="text-sm text-ink-muted">
            Meta de água: <b className="font-medium text-ink">{formatNumber(plan.target_water_ml / 1000, 2)} L</b>
          </p>
        )}
      </div>
      <Bar value={kcal.kcal} target={kcalTarget} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MACRO_ROWS.map((row) => {
          const target = plan[row.target] as number | null;
          const value = totals[row.key];
          return (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-ink-muted">{row.label}</span>
                <span className="tabular-nums text-ink">
                  {value == null ? "—" : `${formatNumber(value, row.digits)}${row.unit}`}
                  {target != null && <span className="text-ink-faint"> / {formatNumber(target, 0)}{row.unit}</span>}
                </span>
              </div>
              <Bar value={value} target={target} />
            </div>
          );
        })}
      </div>

      {hasItems && missingNote && (
        <p className="text-xs text-ink-faint">
          {kcal.partial ? "Total parcial: " : ""}
          {missingNote} (falta valor no alimento ou a unidade difere da porção-base). O aluno vê “{KCAL_MISSING_LABEL}”
          nesses itens.
        </p>
      )}
      {!hasAnyGoal && (
        <p className="text-xs text-ink-faint">Sem metas definidas — informe-as em “Metas e hidratação” para ver o progresso.</p>
      )}
    </section>
  );
}
