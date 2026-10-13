"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Food, FoodEquivalenceWithFoods } from "@/lib/repository";
import { Button, Input, Select, labelClass } from "@/components/ui";
import { createEquivalenceAction, deleteEquivalenceAction, type GlobalNutritionState } from "./actions";

const initial: GlobalNutritionState = null;

/** Biblioteca de substituições: "A equivale a fator × B" (tabela `food_equivalences`). */
export default function EquivalencesPanel({
  foods,
  equivalences,
}: {
  foods: Food[];
  equivalences: FoodEquivalenceWithFoods[];
}) {
  const [state, action, pending] = useActionState(createEquivalenceAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Equivalências reaproveitáveis em qualquer plano. Ex.: 100 g de arroz equivale a 1,5 × batata-doce.
      </p>

      {equivalences.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-muted">
          Nenhuma equivalência cadastrada ainda.
        </p>
      ) : (
        <ul className="card overflow-hidden">
          {equivalences.map((eq) => (
            <li
              key={eq.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0"
            >
              <span className="min-w-0 break-words text-ink">
                <strong className="font-medium">{eq.food?.name ?? "Alimento removido"}</strong>
                <span className="text-ink-muted"> ≈ {eq.factor}× </span>
                <strong className="font-medium">{eq.equivalent_food?.name ?? "Alimento removido"}</strong>
                {eq.note && <span className="text-ink-faint"> — {eq.note}</span>}
              </span>
              <form action={deleteEquivalenceAction}>
                <input type="hidden" name="equivalenceId" value={eq.id} />
                <Button type="submit" variant="tertiary" size="sm">
                  Excluir
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {foods.length < 2 ? (
        <p className="text-sm text-ink-muted">Cadastre ao menos dois alimentos para criar equivalências.</p>
      ) : (
        <form
          ref={formRef}
          action={action}
          className="card flex flex-col gap-3 p-4 sm:grid sm:grid-cols-[1fr_6rem_1fr] sm:items-end"
        >
          <label className={labelClass}>
            Alimento
            <Select name="foodId" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>
          <label className={labelClass}>
            Fator
            <Input name="factor" type="number" min={0} step="any" defaultValue={1} />
          </label>
          <label className={labelClass}>
            Equivale a
            <Select name="equivalentFoodId" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </label>
          <label className={`${labelClass} sm:col-span-3`}>
            Observação (opcional)
            <Input name="note" />
          </label>
          {state?.error && <p className="text-sm text-coral-text sm:col-span-3">{state.error}</p>}
          <div className="sm:col-span-3">
            <Button type="submit" icon="plus" disabled={pending}>
              {pending ? "Salvando…" : "Adicionar equivalência"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
