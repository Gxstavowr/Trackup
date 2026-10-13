"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Food, MealItemWithFood, MealWithItems } from "@/lib/repository";
import { dayOfWeekLabel, WEEKDAY_OPTIONS } from "@/lib/nutrition-builder";
import { foodBase, formatNumber, sumKnownMacros } from "@/lib/food-macros";
import { formatItemKcal, itemKcal, KCAL_MISSING_LABEL, mealKcal, missingKcalNote } from "@/lib/meal-kcal";
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
import QuickAddFood from "./quick-add-food";
import MacroChips from "./macro-chips";
import { inputClass } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";

const initialState: NutricaoActionState = null;
const ICON_BTN =
  "inline-flex size-11 items-center justify-center rounded-md border border-line text-sm md:size-9 text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const TEXT_BTN =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 md:min-h-9 text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";

/**
 * Uma refeição do plano como cartão. Cabeçalho na mesma leitura do portal do aluno: horário
 * grande + nome, total de kcal da refeição em destaque (com "parcial" quando algum alimento
 * não tem kcal) e P/C/G; lista de itens "150 g · Arroz · 192 kcal" com quantidade editável na
 * própria linha (macros recalculados no servidor pelo alimento × quantidade), observações,
 * substituições e o seletor rápido de alimentos. kcal sai de `lib/meal-kcal.ts` — o mesmo
 * helper do portal, então editor, prévia e tela do aluno mostram o mesmo número.
 * As refeições aparecem por horário (como o aluno vê); ↑/↓ só desempatam refeições no MESMO
 * horário (`canMoveUp`/`canMoveDown`, calculados em `plan-editor.tsx`).
 * `editable=false` (plano publicado) some com toda ação.
 */
export default function MealCard({
  clientId,
  planId,
  meal,
  siblingIds,
  canMoveUp,
  canMoveDown,
  foods,
  editable,
}: {
  clientId: string;
  planId: string;
  meal: MealWithItems;
  /** Ordem atual (por horário) das refeições do mesmo `day_of_week` — base do ↑/↓. */
  siblingIds: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  foods: Food[];
  editable: boolean;
}) {
  const [editingMeal, setEditingMeal] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const items = meal.items.slice().sort((a, b) => a.sort_order - b.sort_order);
  const itemOrderIds = items.map((item) => item.id);
  const totals = sumKnownMacros(items);
  const kcal = mealKcal({ items });
  const missingNote = missingKcalNote(kcal);
  const time = meal.time ? meal.time.slice(0, 5) : null;

  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-60 items-start gap-3">
          <span
            className={`w-[4.25rem] shrink-0 font-display leading-none tabular-nums ${
              time ? "text-2xl font-extrabold text-ink" : "pt-1 text-xs font-semibold text-ink-faint"
            }`}
          >
            {time ?? "Sem horário"}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-display text-lg leading-tight text-ink">{meal.name}</h3>
              <Badge tone="accent">{dayOfWeekLabel(meal.day_of_week)}</Badge>
            </div>
            {items.length > 0 && (
              <>
                <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
                  {kcal.kcal != null ? (
                    <span className="text-base font-semibold text-brand">{formatNumber(kcal.kcal, 0)} kcal</span>
                  ) : (
                    <span className="text-sm text-ink-faint">{KCAL_MISSING_LABEL}</span>
                  )}
                  {kcal.partial && missingNote && (
                    <span className="text-xs font-medium text-ink-faint">parcial · {missingNote}</span>
                  )}
                </p>
                <MacroChips macros={totals} showKcal={false} />
              </>
            )}
            {meal.notes && (
              <p className="mt-1 break-words text-xs text-ink-muted">
                <span className="font-semibold text-info">Obs. para o aluno: </span>
                {meal.notes}
              </p>
            )}
          </div>
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(canMoveUp || canMoveDown) && (
              <>
                <form action={moveMealAction}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="planId" value={planId} />
                  <input type="hidden" name="mealId" value={meal.id} />
                  <input type="hidden" name="direction" value={-1} />
                  <input type="hidden" name="dayOfWeek" value={meal.day_of_week ?? ""} />
                  <input type="hidden" name="orderJson" value={JSON.stringify(siblingIds)} />
                  <button
                    type="submit"
                    disabled={!canMoveUp}
                    className={ICON_BTN}
                    aria-label="Mover refeição para cima (mesmo horário)"
                  >
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
                  <button
                    type="submit"
                    disabled={!canMoveDown}
                    className={ICON_BTN}
                    aria-label="Mover refeição para baixo (mesmo horário)"
                  >
                    ↓
                  </button>
                </form>
              </>
            )}
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

      {items.length === 0 ? (
        <EmptyState compact icon="nutrition" title="Nenhum alimento nesta refeição ainda" text="Use Adicionar alimento para montar a refeição." />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {items.map((item) => (
            <MealItemRow
              key={item.id}
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
          ))}
        </ul>
      )}

      {editable &&
        (addingItem ? (
          <QuickAddFood clientId={clientId} mealId={meal.id} foods={foods} onClose={() => setAddingItem(false)} />
        ) : (
          <Button type="button" variant="secondary" icon="plus" className="self-start" onClick={() => setAddingItem(true)}>
            Adicionar alimento
          </Button>
        ))}
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
    <form action={action} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="mealId" value={meal.id} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required defaultValue={meal.name} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Horário</span>
          <input name="time" type="time" defaultValue={meal.time?.slice(0, 5) ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Dia da semana</span>
          <select name="day_of_week" defaultValue={meal.day_of_week ?? ""} className={inputClass}>
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
        <span className="text-ink-muted">Observações para o aluno</span>
        <textarea name="notes" rows={2} defaultValue={meal.notes ?? ""} className={inputClass} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar refeição"}
        </Button>
        <Button type="button" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Quantidade editável na própria linha: salva ao sair do campo / Enter, só se mudou. */
function InlineQuantity({ clientId, item, editable }: { clientId: string; item: MealItemWithFood; editable: boolean }) {
  const initial = item.quantity == null ? "" : formatNumber(item.quantity, 2);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setValue(initial);
  }

  if (!editable) {
    return (
      <span className="shrink-0 whitespace-nowrap font-display tabular-nums text-ink">
        {item.quantity == null ? "—" : `${formatNumber(item.quantity, 2)} ${item.unit ?? ""}`.trim()}
      </span>
    );
  }

  function commit() {
    if (value.trim() === initial) return;
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("itemId", item.id);
    fd.set("quantity", value);
    startTransition(async () => {
      const res = await updateMealItemAction(null, fd);
      setError(res?.error ?? null);
      if (res?.error) setValue(initial);
    });
  }

  return (
    <span className="flex shrink-0 flex-col">
      <span className="flex items-center gap-1">
        <input
          aria-label={`Quantidade de ${item.food?.name ?? "item"}`}
          value={value}
          inputMode="decimal"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={`${inputClass} !min-h-9 !w-[4.5rem] !px-2 text-right tabular-nums ${pending ? "opacity-60" : ""}`}
        />
        <span className="text-sm text-ink-muted">{item.unit ?? ""}</span>
      </span>
      {error && <span className="text-xs text-coral-text">{error}</span>}
    </span>
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
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InlineQuantity clientId={clientId} item={item} editable={editable} />
        <div className="min-w-0 flex-1 basis-40">
          <p className="break-words font-medium text-ink">{item.food?.name ?? "Alimento removido"}</p>
          {item.notes && <p className="break-words text-xs text-ink-muted">{item.notes}</p>}
        </div>
        <span
          className={`shrink-0 text-right tabular-nums ${
            itemKcal(item) == null ? "text-xs text-ink-faint" : "text-sm font-semibold text-ink"
          }`}
        >
          {formatItemKcal(itemKcal(item))}
        </span>
        <MacroChips macros={item.macros} showKcal={false} />

        {editable && (
          <div className="flex items-center gap-1">
            <form action={moveMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={mealId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value={-1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(itemOrderIds)} />
              <button type="submit" disabled={isFirst} className={ICON_BTN} aria-label="Mover alimento para cima">
                ↑
              </button>
            </form>
            <form action={moveMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="mealId" value={mealId} />
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="direction" value={1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(itemOrderIds)} />
              <button type="submit" disabled={isLast} className={ICON_BTN} aria-label="Mover alimento para baixo">
                ↓
              </button>
            </form>
            <button type="button" onClick={onToggleEdit} className={TEXT_BTN}>
              {editing ? "Fechar" : "Obs."}
            </button>
            <form action={deleteMealItemAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`} aria-label="Remover alimento">
                ×
              </button>
            </form>
          </div>
        )}
      </div>

      {editable && editing && <EditMealItemForm clientId={clientId} item={item} onDone={onToggleEdit} />}

      {item.substitutions.length > 0 && (
        <ul className="flex flex-col gap-1 border-l-2 border-line pl-3">
          {item.substitutions.map((sub) => (
            <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span className="min-w-0 break-words">
                <b className="font-medium text-ink-faint">ou</b>{" "}
                {sub.alternative_qty ? `${sub.alternative_qty} · ` : ""}
                {sub.alternative_food?.name ?? sub.alternative_label ?? "Alternativa"}
                {sub.note ? ` (${sub.note})` : ""}
              </span>
              <span className="flex items-center gap-2">
                {sub.alternative_food && <MacroChips macros={sub.macros} />}
                {editable && (
                  <form action={deleteMealSubstitutionAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="substitutionId" value={sub.id} />
                    <button type="submit" className="text-late-text hover:underline">
                      Remover
                    </button>
                  </form>
                )}
              </span>
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
            className="min-h-9 self-start text-xs text-brand hover:underline"
          >
            + Substituição
          </button>
        ))}
    </li>
  );
}

/** Unidade e observações do item (a quantidade se edita direto na linha). */
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
    <form action={action} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="itemId" value={item.id} />
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Unidade</span>
          <input name="unit" type="text" defaultValue={item.unit ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Observação para o aluno</span>
          <input name="notes" type="text" defaultValue={item.notes ?? ""} className={inputClass} />
        </label>
      </div>
      <p className="text-xs text-ink-faint">
        Os macros são recalculados a partir do alimento e da quantidade
        {item.food ? ` (valores por ${formatNumber(foodBase(item.food).qty, 2)} ${foodBase(item.food).unit})` : ""}.
      </p>
      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
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
  const [qty, setQty] = useState("");

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Alimento alternativo</span>
          <select
            name="alternativeFoodId"
            defaultValue=""
            className={inputClass}
            onChange={(e) => {
              const food = options.find((f) => f.id === e.target.value);
              if (food) {
                const b = foodBase(food);
                setQty(`${formatNumber(b.qty, 2)} ${b.unit}`);
              }
            }}
          >
            <option value="">Nenhum (usar texto livre)</option>
            {options.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Ou descreva a alternativa</span>
          <input name="alternativeLabel" type="text" placeholder="2 fatias de pão integral" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-muted">Quantidade (ex.: 150 g)</span>
          <input
            name="alternativeQty"
            type="text"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-ink-muted">Observação (opcional)</span>
        <input name="note" type="text" className={inputClass} />
      </label>

      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Salvando…" : "Adicionar substituição"}
        </Button>
        <Button type="button" size="sm" variant="tertiary" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
