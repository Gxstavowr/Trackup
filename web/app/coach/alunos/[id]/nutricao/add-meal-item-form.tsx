"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Food } from "@/lib/repository";
import { addMealItemAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/**
 * Formulário "Adicionar alimento" a uma refeição — escolhe da biblioteca + quantidade
 * estruturada (número + unidade, item 20). Os macros do item são um snapshot do alimento
 * selecionado (editáveis depois, ver `EditMealItemForm` em `meal-card.tsx`).
 */
export default function AddMealItemForm({
  clientId,
  mealId,
  foods,
}: {
  clientId: string;
  mealId: string;
  foods: Food[];
}) {
  const [state, action, pending] = useActionState(addMealItemAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  if (foods.length === 0) {
    return (
      <p className="text-xs text-ink-faint">
        Cadastre um alimento na biblioteca acima para adicionar aqui.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 border-t border-line pt-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="mealId" value={mealId} />

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-ink-muted">Alimento</span>
          <select name="foodId" required defaultValue="" className={INPUT}>
            <option value="" disabled>
              Selecione…
            </option>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {food.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Quantidade</span>
          <input name="quantity" type="number" min={0} step="any" placeholder="150" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Unidade</span>
          <input name="unit" type="text" placeholder="g" className={INPUT} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações (opcional)</span>
        <input name="notes" type="text" className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand disabled:opacity-60"
      >
        {pending ? "Adicionando…" : "+ Adicionar alimento"}
      </button>
    </form>
  );
}
