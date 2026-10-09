"use client";

import { useActionState } from "react";
import { createSubscriptionAction, type PagamentoActionState } from "./actions";

const initialState: PagamentoActionState = null;

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

/** Empty state + formulário "Criar assinatura" — plano, valor em reais e periodicidade
 * (as 4 opções do CHECK constraint de `subscriptions.period`). */
export default function CreateSubscriptionForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createSubscriptionAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-dashed border-line p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm text-ink-muted">Este aluno ainda não tem uma assinatura.</p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nome do plano</span>
        <input
          name="plan_name"
          type="text"
          required
          placeholder="Plano Mensal"
          className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Valor (R$)</span>
          <input
            name="price_reais"
            type="text"
            inputMode="decimal"
            required
            placeholder="249,00"
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Periodicidade</span>
          <select
            name="period"
            required
            defaultValue=""
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="" disabled>
              Selecione…
            </option>
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
        {pending ? "Criando…" : "Criar assinatura"}
      </button>
    </form>
  );
}
