"use client";

import { useActionState, useState } from "react";
import { setSubscriptionStatusAction, type PagamentoActionState } from "./actions";
import { buttonClass } from "@/components/ui/button";

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
          className={buttonClass({ variant: "secondary" })}
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
        className={buttonClass({ variant: "tertiary" })}
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
          className={buttonClass({ variant: "danger" })}
        >
          {pending ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={buttonClass({ variant: "secondary" })}
        >
          Voltar
        </button>
      </div>
      {state?.error && <p className="text-xs text-late-text">{state.error}</p>}
    </form>
  );
}
