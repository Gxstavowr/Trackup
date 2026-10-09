"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCustomMetricAction, type MetricSettingsActionState } from "./metric-settings-actions";

const initialState: MetricSettingsActionState = null;

/**
 * Formulário "Nova métrica" — cria uma métrica CUSTOM (só deste aluno), já acompanhada.
 * Mesmo padrão de `AddExerciseToDayForm` (treino/add-exercise-to-day-form.tsx).
 */
export default function AddCustomMetricForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(addCustomMetricAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3 border-t border-line pt-4">
      <input type="hidden" name="clientId" value={clientId} />

      <div className="grid gap-3 sm:grid-cols-5">
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-3">
          <span className="text-ink-muted">Nome da métrica</span>
          <input
            name="label"
            type="text"
            required
            maxLength={60}
            placeholder="Ex.: Circunferência do braço"
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="text-ink-muted">Unidade (opcional)</span>
          <input
            name="unit"
            type="text"
            maxLength={20}
            placeholder="Ex.: cm"
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
          />
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
        className="min-h-11 self-start rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand disabled:opacity-60"
      >
        {pending ? "Criando…" : "+ Nova métrica"}
      </button>
    </form>
  );
}
