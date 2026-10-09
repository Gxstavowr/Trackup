"use client";

import { useActionState } from "react";
import { markPaymentPaidAction, type MarkPaidState } from "./actions";
import { BUTTON_PRIMARY } from "./ui";

/**
 * "Marcar como pago" — Server Action real (`actions.ts`), com verificação de sessão/role/posse
 * no servidor. Sucesso: a página revalida e a cobrança sai de Atrasados/Próximas (ou muda de
 * badge no histórico). Erro: mensagem clara logo abaixo do botão.
 */
export default function MarkPaidButton({
  paymentId,
  clientName,
}: {
  paymentId: string;
  clientName: string;
}) {
  const [state, formAction, pending] = useActionState<MarkPaidState, FormData>(
    markPaymentPaidAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-1 sm:items-end">
      <input type="hidden" name="paymentId" value={paymentId} />
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "Registrando…" : "Marcar como pago"}
        <span className="sr-only"> — pagamento de {clientName}</span>
      </button>
      {state?.error && (
        <p role="alert" className="max-w-56 text-xs text-late-text sm:text-right">
          {state.error}
        </p>
      )}
    </form>
  );
}
