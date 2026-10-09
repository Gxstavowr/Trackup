"use client";

import { useActionState, useEffect, useState } from "react";
import type { Food, FoodMacros, MealItemWithFood, MealWithItems } from "@/lib/repository";
import { dayOfWeekLabel, sumMacros, WEEKDAY_OPTIONS } from "@/lib/nutrition-builder";
import {
  addMealSubstitutionAction,
  deleteMealAction,
  deleteMealItemAction,
  deleteMealSubstitutionAction,
  duplicateMealAction,
  moveMealAction,
  moveMealItemAction,
  updateMealAction,
  updateMealItemAction,
  type NutricaoActionState,
} from "./actions";
import AddMealItemForm from "./add-meal-item-form";

const initialState: NutricaoActionState = null;
const ICON_BTN =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const TEXT_BTN =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

function macrosSummary(macros: FoodMacros): string {
  return (
    [
      macros.kcal != null && `${macros.kcal} kcal`,
      macros.protein_g != null && `${macros.protein_g}g prot`,
      macros.carbs_g != null && `${macros.carbs_g}g carbo`,
      macros.fat_g != null && `${macros.fat_g}g gord`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem macros"
  );
}

/**
 * Uma refeição do plano: cabeçalho (nome/horário/dia da semana/observações), itens (com
 * quantidade/macros/substituições equivalentes) e ações do item 20 — reordenar (dentro do
 * mesmo "dia"), duplicar, editar, remover, adicionar alimento. `editable=false` (plano
 * publicado/arquivado/template em preview) some com toda ação.
 */
export default function MealCard({
  clientId,
  planId,
  meal,
  siblingIds,
  isFirst,
  isLast,
  foods,
  editable,
}: {
  clientId: string;
  planId: string;
  meal: MealWithItems;
  siblingIds: string[];
  isFirst: boolean;
  isLast: boolean;
  foods: Food[];
  editable: boolean;
}) {
  const [editingMeal, setEditingMeal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const itemOrderIds = meal.items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => item.id);
  const totals = sumMacros(meal.items);

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-ink">{meal.name}</h3>
            <span className="rounded-full bg-brand-tint px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-brand">
              {dayOfWeekLabel(meal.day_of_week)}
            </span>
            {meal.time && <span className="text-xs text-ink-faint">{meal.time.slice(0, 5)}</span>}
          </div>
          {meal.notes && <p className="mt-1 text-xs text-ink-faint">{meal.notes}</p>}
          {meal.items.length > 0 && <p className="mt-1 text-xs text-ink-faint">Total: {macrosSummary(totals)}</p>}
        </div>

        {editable && (
          <div className="flex flex-wrap gap-1.5">
            <form action={moveMealAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="mealId" value={meal.id} />
              <input type="hidden" name="direction" value={-1} />
              <input type="hidden" name="dayOfWeek" value={meal.day_of_week ?? ""} />
              <input type="hidden" name="orderJson" value={JSON.stringify(siblingIds)} />
              <button type="submit" disabled={isFirst} className={ICON_BTN} aria-label="Mover refeição para cima">
                ↑
              </button>
            </form>
            <form action={moveMealAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="mealId" value={meal.id} />
              <input type="hidden" name="direction" value={1} />
              <input type="hidden" name="dayOfWeek" value={meal.day_of_week ?? ""} />
              <input type="hidden" name="orderJson" value={JSON.stringify(siblingIds)} />
              <button type="submit" disabled={isLast} className={ICON_BTN} aria-label="Mover refeição para baixo">
                ↓
              </button>
            </form>
            <button type="button" onClick={() => setEditingMeal((v) => !v)} className={TEXT_BTN}>
              {editingMeal ? "Cancelar" : "Editar"}
            </button>
            <form action={duplicateMealAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={meal.id} />
              <button type="submit" className={TEXT_BTN}>
                Duplicar
              </button>
            </form>
            <form action={deleteMealAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={meal.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Remover
              </button>
            </form>
          </div>
        )}
      </div>

      {editable && editingMeal && (
        <EditMealForm clientId={clientId} meal={meal} onDone={() => setEditingMeal(false)} />
      )}

      {meal.items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Nenhum alimento nesta refeição ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {meal.items
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((item) => (
              <li key={item.id}>
                <MealItemRow
                  clientId={clientId}
                  mealId={meal.id}
                  item={item}
                  foods={foods}
                  editable={editable}
                  editing={editingItemId === item.id}
                  onToggleEdit={() => setEditingItemId((current) => (current === item.id ? null : item.id))}
                  itemOrderIds={itemOrderIds}
                  isFirst={itemOrderIds[0] === item.id}
                  isLast={itemOrderIds[itemOrderIds.length - 1] === item.id}
                />
              </li>
            ))}
        </ul>
      )}

      {editable && (
        <div className="mt-4 border-t border-line pt-4">
          {addingItem ? (
            <AddMealItemForm clientId={clientId} mealId={meal.id} foods={foods} />
          ) : (
            <button
              type="button"
              onClick={() => setAddingItem(true)}
              className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand"
            >
              + Adicionar alimento
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function EditMealForm({
  clientId,
  meal,
  onDone,
}: {
  clientId: string;
  meal: MealWithItems;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateMealAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="mealId" value={meal.id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required defaultValue={meal.name} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Horário</span>
          <input name="time" type="time" defaultValue={meal.time?.slice(0, 5) ?? ""} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Dia da semana</span>
          <select name="day_of_week" defaultValue={meal.day_of_week ?? ""} className={INPUT}>
            <option value="">Todo dia</option>
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações</span>
        <textarea name="notes" rows={2} defaultValue={meal.notes ?? ""} className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar refeição"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function MealItemRow({
  clientId,
  mealId,
  item,
  foods,
  editable,
  editing,
  onToggleEdit,
  itemOrderIds,
  isFirst,
  isLast,
}: {
  clientId: string;
  mealId: string;
  item: MealItemWithFood;
  foods: Food[];
  editable: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  itemOrderIds: string[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const [addingSubstitution, setAddingSubstitution] = useState(false);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="font-medium text-ink">{item.food?.name ?? "Alimento removido"}</span>
          <p className="text-sm text-ink-muted">
            {[item.qty, macrosSummary(item.macros)].filter(Boolean).join(" · ")}
          </p>
          {item.notes && <p className="text-xs text-ink-faint">{item.notes}</p>}
        </div>

        {editable && (
          <div className="flex flex-wrap gap-1.5">
            <form action={moveMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={mealId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value={-1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(itemOrderIds)} />
              <button type="submit" disabled={isFirst} className={ICON_BTN} aria-label="Mover para cima">
                ↑
              </button>
            </form>
            <form action={moveMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={mealId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value={1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(itemOrderIds)} />
              <button type="submit" disabled={isLast} className={ICON_BTN} aria-label="Mover para baixo">
                ↓
              </button>
            </form>
            <button type="button" onClick={onToggleEdit} className={TEXT_BTN}>
              {editing ? "Cancelar" : "Editar"}
            </button>
            <form action={deleteMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Remover
              </button>
            </form>
          </div>
        )}
      </div>

      {editable && editing && <EditMealItemForm clientId={clientId} item={item} onDone={onToggleEdit} />}

      {item.substitutions.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 border-t border-line pt-2">
          {item.substitutions.map((sub) => (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span>
                Substituição: {sub.alternative_food?.name ?? sub.alternative_label ?? "Alternativa"}
                {sub.alternative_qty ? ` — ${sub.alternative_qty}` : ""}
                {sub.note ? ` (${sub.note})` : ""}
              </span>
              {editable && (
                <form action={deleteMealSubstitutionAction}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="substitutionId" value={sub.id} />
                  <button type="submit" className="text-late-text hover:underline">
                    Remover
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable &&
        (addingSubstitution ? (
          <AddSubstitutionForm
            clientId={clientId}
            itemId={item.id}
            foods={foods}
            excludeFoodId={item.food_id}
            onDone={() => setAddingSubstitution(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingSubstitution(true)}
            className="mt-1 self-start text-xs text-brand hover:underline"
          >
            + Substituição equivalente
          </button>
        ))}
    </div>
  );
}

function EditMealItemForm({
  clientId,
  item,
  onDone,
}: {
  clientId: string;
  item: MealItemWithFood;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateMealItemAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="itemId" value={item.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Quantidade</span>
          <input name="quantity" type="number" min={0} step="any" defaultValue={item.quantity ?? ""} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Unidade</span>
          <input name="unit" type="text" defaultValue={item.unit ?? ""} className={INPUT} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Kcal</span>
          <input name="kcal" type="number" min={0} step="any" defaultValue={item.macros.kcal ?? ""} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Proteína (g)</span>
          <input
            name="protein_g"
            type="number"
            min={0}
            step="any"
            defaultValue={item.macros.protein_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Carbo (g)</span>
          <input
            name="carbs_g"
            type="number"
            min={0}
            step="any"
            defaultValue={item.macros.carbs_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Gordura (g)</span>
          <input name="fat_g" type="number" min={0} step="any" defaultValue={item.macros.fat_g ?? ""} className={INPUT} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações</span>
        <input name="notes" type="text" defaultValue={item.notes ?? ""} className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar item"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AddSubstitutionForm({
  clientId,
  itemId,
  foods,
  excludeFoodId,
  onDone,
}: {
  clientId: string;
  itemId: string;
  foods: Food[];
  excludeFoodId: string | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(addMealSubstitutionAction, initialState);
  const options = foods.filter((f) => f.id !== excludeFoodId);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-md border border-dashed border-line p-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Alimento alternativo (opcional)</span>
          <select name="alternativeFoodId" defaultValue="" className={INPUT}>
            <option value="">Nenhum (usar rótulo livre)</option>
            {options.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Ou descreva a alternativa</span>
          <input name="alternativeLabel" type="text" placeholder="2 fatias de pão integral" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Quantidade</span>
          <input name="alternativeQty" type="text" placeholder="150g" className={INPUT} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-ink-muted">Observação (opcional)</span>
        <input name="note" type="text" className={INPUT} />
      </label>

      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md border border-line px-3 text-xs text-ink hover:border-brand disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Adicionar substituição"}
        </button>
        <button type="button" onClick={onDone} className={`${TEXT_BTN} text-xs`}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
