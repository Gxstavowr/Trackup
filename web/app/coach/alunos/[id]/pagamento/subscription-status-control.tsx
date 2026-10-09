"use client";

import { useActionState, useState } from "react";
import { setSubscriptionStatusAction, type PagamentoActionState } from "./actions";

const initialState: PagamentoActionState = null;

/**
 * Cancelar / reativar a assinatura, com confirmação em dois passos no cancelamento (é o que
 * entra no card "Cancelamentos" do Financeiro, no mês em que acontece). Reativar não pede
 * confirmação: desfaz um cancelamento por engano.
 */
export default function SubscriptionStatusControl({
  clientId,
  cancelled,
}: {
  clientId: string;
  cancelled: boolean;
}) {
  const [state, action, pending] = useActionState(setSubscriptionStatusAction, initialState);
  const [confirming, setConfirming] = useState(false);

  if (cancelled) {
    return (
      <form action={action} className="flex flex-col items-start gap-1">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="intent" value="reactivate" />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand disabled:opacity-60"
        >
          {pending ? "Reativando…" : "Reativar assinatura"}
        </button>
        {state?.error && <p className="text-xs text-late-text">{state.error}</p>}
      </form>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-md px-3 py-2 text-sm text-ink-muted hover:text-late-text"
      >
        Cancelar assinatura
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="intent" value="cancel" />
      <p className="text-sm text-ink">
        Cancelar a assinatura? Novas cobranças deixam de ser previstas; as já registradas continuam
        no histórico. Dá para reativar depois.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-late px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink"
        >
          Voltar
        </button>
      </div>
      {state?.error && <p className="text-xs text-late-text">{state.error}</p>}
    </form>
  );
}
