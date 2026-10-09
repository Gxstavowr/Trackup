"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWorkoutDayAction, type TreinoActionState } from "./actions";

const initialState: TreinoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/** Formulário "Adicionar dia de treino" — nome, duração e observações do dia (item 18). */
export default function AddWorkoutDayForm({ clientId, planId }: { clientId: string; planId: string }) {
  const [state, action, pending] = useActionState(addWorkoutDayAction, initialState);
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
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-ink-muted">Nome do dia</span>
          <input
            name="name"
            type="text"
            required
            placeholder="Treino A — Peito e tríceps"
            className={INPUT}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Duração (min)</span>
          <input name="duration_min" type="number" min={0} className={INPUT} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações do dia (opcional)</span>
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
        {pending ? "Adicionando…" : "+ Adicionar dia de treino"}
      </button>
    </form>
  );
}
