"use client";

import { useActionState, useEffect, useRef } from "react";
import { createFoodAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";

/** Formulário "Novo alimento" — nome, unidade, categoria (biblioteca com busca/filtro, item
 * 20) e macros (calorias/proteína/carboidrato/gordura). */
export default function CreateFoodForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createFoodAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-line p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <span className="text-sm font-medium text-ink">Novo alimento</span>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={`${LABEL} sm:col-span-2`}>
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Unidade</span>
          <input name="unit" type="text" placeholder="g" defaultValue="g" className={INPUT} />
        </label>
      </div>

      <label className={LABEL}>
        <span className="text-ink-muted">Categoria</span>
        <input name="category" type="text" placeholder="Proteína, carboidrato, vegetal..." className={INPUT} />
      </label>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className="text-ink-muted">Kcal</span>
          <input name="kcal" type="number" min={0} step="any" className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Proteína (g)</span>
          <input name="protein_g" type="number" min={0} step="any" className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Carbo (g)</span>
          <input name="carbs_g" type="number" min={0} step="any" className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Gordura (g)</span>
          <input name="fat_g" type="number" min={0} step="any" className={INPUT} />
        </label>
      </div>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Criando…" : "Adicionar alimento"}
      </button>
    </form>
  );
}
