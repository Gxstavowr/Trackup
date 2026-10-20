"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { helperClass, labelClass, textareaClass } from "@/components/ui/field";
import { voidScheduledChangeAction, type PackageActionState } from "./actions";
import { REASON_MAX } from "./contract-logic";

/** "Anular mudança agendada" com confirmação em linha e motivo opcional. */
export default function VoidChangeButton({ clientId, contractId }: { clientId: string; contractId: string }) {
  const [state, formAction, pending] = useActionState<PackageActionState, FormData>(voidScheduledChangeAction, null);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button variant="secondary" width="mobile" icon="x" onClick={() => setConfirming(true)}>
        Anular mudança agendada
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-danger/40 bg-danger-tint/40 p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="contractId" value={contractId} />
      <p className="text-sm text-ink">
        A mudança não vai entrar em vigor e o pacote atual continua valendo. O registro anulado fica no histórico.
      </p>
      <label className={labelClass}>
        <span>Motivo da anulação</span>
        <textarea name="reason" maxLength={REASON_MAX} className={textareaClass} placeholder="Ex.: aluno recusou a mudança." />
        <span className={helperClass}>Opcional.</span>
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="tertiary" width="mobile" onClick={() => setConfirming(false)} disabled={pending}>
          Voltar
        </Button>
        <Button type="submit" variant="danger" width="mobile" pending={pending} pendingLabel="Anulando…">
          Confirmar anulação
        </Button>
      </div>
    </form>
  );
}
