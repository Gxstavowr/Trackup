"use client";

import { useActionState, useEffect, useState } from "react";
import type { Food } from "@/lib/repository";
import { archiveFoodAction, unarchiveFoodAction, updateFoodAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";
const TEXT_BTN =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink";

function macrosLabel(food: Food): string {
  return (
    [
      `unidade: ${food.unit}`,
      food.macros.kcal != null && `${food.macros.kcal} kcal`,
      food.macros.protein_g != null && `${food.macros.protein_g}g prot`,
      food.macros.carbs_g != null && `${food.macros.carbs_g}g carbo`,
      food.macros.fat_g != null && `${food.macros.fat_g}g gord`,
    ]
      .filter(Boolean)
      .join(" · ")
  );
}

/** Uma linha da biblioteca de alimentos — nome/categoria/macros + editar (inline) e
 * arquivar/reativar (soft delete), item 20. */
export default function FoodRow({ clientId, food }: { clientId: string; food: Food }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">
            {food.name} {food.is_archived && <span className="text-xs text-ink-faint">(arquivado)</span>}
          </span>
          <span className="text-xs text-ink-faint">
            {[food.category, macrosLabel(food)].filter(Boolean).join(" · ")}
          </span>
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing((v) => !v)} className={TEXT_BTN}>
            {editing ? "Cancelar" : "Editar"}
          </button>
          {food.is_archived ? (
            <form action={unarchiveFoodAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="foodId" value={food.id} />
              <button type="submit" className={TEXT_BTN}>
                Reativar
              </button>
            </form>
          ) : (
            <form action={archiveFoodAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="foodId" value={food.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Arquivar
              </button>
            </form>
          )}
        </div>
      </div>

      {editing && <EditFoodForm clientId={clientId} food={food} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditFoodForm({ clientId, food, onDone }: { clientId: string; food: Food; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateFoodAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="foodId" value={food.id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${LABEL} sm:col-span-2`}>
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required defaultValue={food.name} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Unidade</span>
          <input name="unit" type="text" defaultValue={food.unit} className={INPUT} />
        </label>
      </div>

      <label className={LABEL}>
        <span className="text-ink-muted">Categoria</span>
        <input name="category" type="text" defaultValue={food.category ?? ""} className={INPUT} />
      </label>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className="text-ink-muted">Kcal</span>
          <input name="kcal" type="number" min={0} step="any" defaultValue={food.macros.kcal ?? ""} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Proteína (g)</span>
          <input
            name="protein_g"
            type="number"
            min={0}
            step="any"
            defaultValue={food.macros.protein_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Carbo (g)</span>
          <input
            name="carbs_g"
            type="number"
            min={0}
            step="any"
            defaultValue={food.macros.carbs_g ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Gordura (g)</span>
          <input name="fat_g" type="number" min={0} step="any" defaultValue={food.macros.fat_g ?? ""} className={INPUT} />
        </label>
      </div>

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
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
