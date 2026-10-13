"use client";

import { useActionState, useEffect, useState } from "react";
import type { Food } from "@/lib/repository";
import { foodBase, formatNumber } from "@/lib/food-macros";
import { Button, Input, labelClass } from "@/components/ui";
import { saveFoodAction, type GlobalNutritionState } from "./actions";

const initial: GlobalNutritionState = null;

const dec = (v: number | undefined | null, max = 2) => (v == null ? "" : formatNumber(v, max));

/**
 * Formulário de criar/editar alimento — o MESMO usado em `/coach/nutricao` e no atalho
 * "Criar alimento" do editor de dieta do aluno. Os valores se referem à porção-base
 * (`macros.base_qty` + unidade; padrão 100 g/ml ou 1 unidade).
 */
export default function FoodForm({
  food,
  onDone,
  initialName = "",
}: {
  food: Food | null;
  onDone: (created?: { id: string }) => void;
  initialName?: string;
}) {
  const [state, action, pending] = useActionState(saveFoodAction, initial);
  const [unit, setUnit] = useState(food?.unit ?? "g");
  const base = food ? foodBase(food) : { qty: 100, unit: "g" };

  useEffect(() => {
    if (state?.success) onDone(state.foodId ? { id: state.foodId } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const m = food?.macros ?? {};
  const field = "w-full";
  return (
    <form action={action} className="flex flex-col gap-3">
      {food && <input type="hidden" name="foodId" value={food.id} />}
      <label className={labelClass}>
        Nome
        <Input name="name" required defaultValue={food?.name ?? initialName} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={labelClass}>
          Porção-base
          <Input
            name="base_qty"
            type="text"
            inputMode="decimal"
            defaultValue={dec(food ? base.qty : unit === "g" || unit === "ml" ? 100 : 1)}
            className={field}
          />
        </label>
        <label className={labelClass}>
          Unidade
          <Input name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g" />
        </label>
        <label className={labelClass}>
          Categoria
          <Input name="category" defaultValue={food?.category ?? ""} placeholder="Proteína…" />
        </label>
      </div>
      <p className="text-xs text-ink-muted">
        Os valores abaixo são para {dec(food ? base.qty : 100)} {unit || "g"} do alimento (ex.: por 100 g).
        Deixe em branco o que não souber — aparece como “—”, nunca como zero.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Kcal
          <Input name="kcal" type="text" inputMode="decimal" defaultValue={dec(m.kcal)} />
        </label>
        <label className={labelClass}>
          Proteína (g)
          <Input name="protein_g" type="text" inputMode="decimal" defaultValue={dec(m.protein_g)} />
        </label>
        <label className={labelClass}>
          Carboidrato (g)
          <Input name="carbs_g" type="text" inputMode="decimal" defaultValue={dec(m.carbs_g)} />
        </label>
        <label className={labelClass}>
          Gordura (g)
          <Input name="fat_g" type="text" inputMode="decimal" defaultValue={dec(m.fat_g)} />
        </label>
      </div>
      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">{state.error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="tertiary" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
