"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Food, FoodEquivalenceWithFoods } from "@/lib/repository";
import { createFoodEquivalenceAction, deleteFoodEquivalenceAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const SELECT =
  "min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/**
 * Equivalências reaproveitáveis por conta (`food_equivalences`, item 20) — diferente da
 * substituição pontual de um item da refeição: aqui é "alimento X sempre equivale a
 * alimento Y", disponível pra qualquer plano/refeição futura. `<details>` fechado por
 * padrão pra não competir por espaço com o construtor do plano.
 */
export default function FoodEquivalencesPanel({
  clientId,
  foods,
  equivalences,
}: {
  clientId: string;
  foods: Food[];
  equivalences: FoodEquivalenceWithFoods[];
}) {
  if (foods.length < 2) return null;

  return (
    <details className="rounded-lg border border-line bg-surface p-4">
      <summary className="cursor-pointer select-none font-medium text-ink">
        Equivalências entre alimentos {equivalences.length > 0 && `(${equivalences.length})`}
      </summary>

      <p className="mt-2 text-xs text-ink-faint">
        Equivalências reaproveitáveis por qualquer plano (ex.: &quot;100g de arroz equivale a 150g de batata
        doce&quot;) — diferente da substituição de um item específico de uma refeição.
      </p>

      {equivalences.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-lg border border-line">
          {equivalences.map((eq) => (
            <li key={eq.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
              <span className="text-ink">
                {eq.food?.name ?? "Alimento removido"} ≈ {eq.factor}× {eq.equivalent_food?.name ?? "Alimento removido"}
                {eq.note && <span className="text-ink-faint"> — {eq.note}</span>}
              </span>
              <form action={deleteFoodEquivalenceAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="equivalenceId" value={eq.id} />
                <button type="submit" className="min-h-11 rounded-md border border-line px-3 text-xs text-late-text hover:border-late">
                  Excluir
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <CreateEquivalenceForm clientId={clientId} foods={foods} />
    </details>
  );
}

function CreateEquivalenceForm({ clientId, foods }: { clientId: string; foods: Food[] }) {
  const [state, action, pending] = useActionState(createFoodEquivalenceAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
      <input type="hidden" name="clientId" value={clientId} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Alimento</span>
        <select name="foodId" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Selecione…
          </option>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Fator</span>
        <input name="factor" type="number" min={0} step="any" defaultValue={1} className={`${SELECT} w-24`} />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Equivale a</span>
        <select name="equivalentFoodId" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            Selecione…
          </option>
          {foods.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-1 flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observação (opcional)</span>
        <input name="note" type="text" className={SELECT} />
      </label>

      {state?.error && <p className="w-full text-sm text-coral-text">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md border border-line px-4 text-sm text-ink hover:border-brand disabled:opacity-60"
      >
        {pending ? "Salvando…" : "+ Adicionar equivalência"}
      </button>
    </form>
  );
}
