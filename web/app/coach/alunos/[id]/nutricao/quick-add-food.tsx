"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import type { Food } from "@/lib/repository";
import { foodBase, formatBase, formatNumber, scaleFoodMacros } from "@/lib/food-macros";
import { filterFoods } from "@/lib/nutrition-builder";
import { Button, Input, Modal, inputClass } from "@/components/ui";
import FoodForm from "../../../nutricao/food-form";
import MacroChips from "./macro-chips";
import { addMealItemAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;

/**
 * Seletor rápido de alimento (substitui a biblioteca duplicada): busca por nome, escolhe,
 * confirma a quantidade (já sugerida na porção-base) com prévia dos macros calculados e
 * adiciona — sem sair da refeição. "Criar alimento" abre o MESMO formulário da biblioteca
 * geral (`/coach/nutricao`) num modal; ao salvar, o alimento novo já vem selecionado.
 */
export default function QuickAddFood({
  clientId,
  mealId,
  foods,
  onClose,
}: {
  clientId: string;
  mealId: string;
  foods: Food[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingNewId, setPendingNewId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (prev: NutricaoActionState, fd: FormData) => {
    const result = await addMealItemAction(prev, fd);
    if (result?.success) {
      setSelectedId(null);
      setSearch("");
      searchRef.current?.focus();
    }
    return result;
  }, initialState);

  const selected = foods.find((f) => f.id === selectedId) ?? null;
  const results = useMemo(() => filterFoods(foods, { search }).slice(0, 8), [foods, search]);

  function pick(food: Food) {
    const base = foodBase(food);
    setSelectedId(food.id);
    setQty(formatNumber(base.qty, 2));
    setUnit(base.unit);
  }

  // Depois de criar um alimento novo, assim que a lista atualizada chega, seleciona-o.
  if (pendingNewId) {
    const created = foods.find((f) => f.id === pendingNewId);
    if (created) {
      pick(created);
      setPendingNewId(null);
    }
  }

  const preview = selected ? scaleFoodMacros(selected, Number(qty.replace(",", ".")) || null, unit) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-sunken/40 p-3">
      <div className="flex items-center gap-2">
        <input
          ref={searchRef}
          className={inputClass}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar alimento… (ex.: arroz)"
          aria-label="Buscar alimento"
        />
        <Button type="button" variant="tertiary" onClick={onClose}>
          Fechar
        </Button>
      </div>

      {!selected && (
        <>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
            {results.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => pick(food)}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-surface-raised"
                >
                  <span className="min-w-0 break-words text-sm font-medium text-ink">{food.name}</span>
                  <span className="text-xs text-ink-faint">
                    {formatBase(food)} ·{" "}
                    {food.macros.kcal != null ? `${formatNumber(food.macros.kcal, 0)} kcal` : "— kcal"}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-3 py-3 text-sm text-ink-muted">
                {foods.length === 0 ? "Nenhum alimento cadastrado ainda." : "Nenhum alimento encontrado."}
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-11 self-start text-sm text-brand underline-offset-2 hover:underline"
          >
            + Criar alimento{search.trim() ? ` “${search.trim()}”` : ""}
          </button>
        </>
      )}

      {selected && (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="mealId" value={mealId} />
          <input type="hidden" name="foodId" value={selected.id} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">{selected.name}</p>
            <button type="button" onClick={() => setSelectedId(null)} className="text-xs text-brand hover:underline">
              Trocar alimento
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[8rem_8rem_1fr]">
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
              Quantidade
              <Input
                name="quantity"
                type="text"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink-muted">
              Unidade
              <Input name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm text-ink-muted sm:col-span-1">
              Observação (opcional)
              <Input name="notes" type="text" placeholder="ex.: pesado cozido" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>Esta quantidade:</span>
            <MacroChips macros={preview} />
            {preview && Object.keys(preview).length === 0 && (
              <span>Sem cálculo: a unidade difere de “{foodBase(selected).unit}” ou faltam valores no alimento.</span>
            )}
          </div>
          {state?.error && (
            <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
              {state.error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} icon="plus">
              {pending ? "Adicionando…" : "Adicionar à refeição"}
            </Button>
          </div>
        </form>
      )}

      {state?.success && !selected && <p className="text-xs text-success">Alimento adicionado. Busque o próximo.</p>}

      <Modal open={creating} onClose={() => setCreating(false)} title="Novo alimento">
        {creating && (
          <FoodForm
            food={null}
            initialName={search.trim()}
            onDone={(created) => {
              setCreating(false);
              if (created) setPendingNewId(created.id);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
