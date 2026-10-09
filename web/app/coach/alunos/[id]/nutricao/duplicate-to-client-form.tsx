"use client";

import { useActionState, useEffect, useRef } from "react";
import type { Client } from "@/lib/repository";
import { duplicateToClientAction, type NutricaoActionState } from "./actions";

const initialState: NutricaoActionState = null;

/** "Duplicar plano para outro aluno" — duplicação de planos (item 20): mesmo plano
 * (refeições + itens + substituições) vira um RASCUNHO novo pro aluno escolhido. */
export default function DuplicateToClientForm({
  clientId,
  planId,
  otherClients,
}: {
  clientId: string;
  planId: string;
  otherClients: Client[];
}) {
  const [state, action, pending] = useActionState(duplicateToClientAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  if (otherClients.length === 0) return null;

  return (
    <details className="rounded-md border border-line">
      <summary className="min-h-11 cursor-pointer select-none px-4 py-2 text-sm text-ink-muted hover:text-ink">
        Duplicar para outro aluno
      </summary>
      <form
        ref={formRef}
        action={action}
        className="flex flex-wrap items-end gap-3 border-t border-line p-3"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="planId" value={planId} />
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Duplicar para</span>
          <select
            name="targetClientId"
            required
            defaultValue=""
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="" disabled>
              Selecione o aluno…
            </option>
            {otherClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          {pending ? "Duplicando…" : "Duplicar"}
        </button>
      </form>
    </details>
  );
}
