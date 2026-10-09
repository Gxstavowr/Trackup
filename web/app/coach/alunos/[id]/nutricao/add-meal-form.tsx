"use client";

import { useActionState, useEffect, useRef } from "react";
import { WEEKDAY_OPTIONS } from "@/lib/nutrition-builder";
import { addMealAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/** Formulário "Adicionar refeição" — nome, horário, dia da semana (ou "todo dia") e
 * observações (item 20: organizar horários + visualização diária). */
export default function AddMealForm({ clientId, planId }: { clientId: string; planId: string }) {
  const [state, action, pending] = useActionState(addMealAction, initialState);
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
      <input type="hidden" name="planId" value={planId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-1">
          <span className="text-ink-muted">Nome da refeição</span>
          <input name="name" type="text" required placeholder="Café da manhã" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Horário</span>
          <input name="time" type="time" className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Dia da semana</span>
          <select name="day_of_week" defaultValue="" className={INPUT}>
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
        <span className="text-ink-muted">Observações (opcional)</span>
        <textarea name="notes" rows={2} className={INPUT} />
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
        {pending ? "Adicionando…" : "+ Adicionar refeição"}
      </button>
    </form>
  );
}
