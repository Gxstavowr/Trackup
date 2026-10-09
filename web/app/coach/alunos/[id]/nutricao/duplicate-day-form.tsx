"use client";

import { useActionState, useEffect, useRef } from "react";
import { WEEKDAY_OPTIONS } from "@/lib/nutrition-builder";
import { duplicateDayAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;
const SELECT =
  "min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/** "Duplicar dia" (item 20) — copia TODAS as refeições de um dia da semana pra outro,
 * dentro do mesmo plano (`duplicate_nutrition_day`, 0008). `<details>` fechado por padrão. */
export default function DuplicateDayForm({ clientId, planId }: { clientId: string; planId: string }) {
  const [state, action, pending] = useActionState(duplicateDayAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <details className="rounded-md border border-line">
      <summary className="min-h-11 cursor-pointer select-none px-4 py-2 text-sm text-ink-muted hover:text-ink">
        Duplicar dia
      </summary>
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 border-t border-line p-3">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="planId" value={planId} />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Copiar de</span>
          <select name="sourceDay" defaultValue="" className={SELECT}>
            <option value="">Todo dia</option>
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Para</span>
          <select name="targetDay" defaultValue="" className={SELECT}>
            <option value="">Todo dia</option>
            {WEEKDAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {state?.error && <p className="w-full text-sm text-coral-text">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand disabled:opacity-60"
        >
          {pending ? "Duplicando…" : "Duplicar dia"}
        </button>
      </form>
    </details>
  );
}
