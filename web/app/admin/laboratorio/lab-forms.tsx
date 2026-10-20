"use client";

import { useActionState, useState } from "react";
import { Button, SubmitButton } from "@/components/ui";
import {
  resetEmptyScenarioAction,
  resetFreshStudentAction,
  switchProfileAction,
  type LabFormState,
} from "./actions";

function Feedback({ state }: { state: LabFormState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm font-semibold text-danger-text">
        {state.error}
      </p>
    );
  }
  if (state?.success) {
    return (
      <p role="status" className="text-sm font-semibold text-success">
        {state.success}
      </p>
    );
  }
  return null;
}

/** "Entrar como" um perfil demo. Envia só a chave; o servidor resolve o resto. */
export function SwitchProfileForm({ profileKey, label, disabled }: { profileKey: string; label: string; disabled?: boolean }) {
  const [state, action] = useActionState<LabFormState, FormData>(switchProfileAction, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="profile" value={profileKey} />
      <SubmitButton variant="primary" size="sm" iconAfter="chevron" pendingLabel="Entrando…" disabled={disabled} className="self-start">
        {label}
      </SubmitButton>
      <Feedback state={state} />
    </form>
  );
}

/** Reset com confirmação em dois passos (sem `window.confirm`, acessível por teclado). */
export function ResetForm({
  kind,
  label,
  confirmText,
  disabled,
}: {
  kind: "empty" | "fresh";
  label: string;
  confirmText: string;
  disabled?: boolean;
}) {
  const [state, action] = useActionState<LabFormState, FormData>(
    kind === "empty" ? resetEmptyScenarioAction : resetFreshStudentAction,
    null
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-2">
      {confirming ? (
        <div role="group" aria-label="Confirmar reset" className="flex flex-col gap-2 rounded-[12px] border border-warning/40 bg-warning-tint p-3">
          <p className="text-sm text-ink">{confirmText}</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="danger" size="sm" icon="refresh" pendingLabel="Resetando…">
              Confirmar reset
            </SubmitButton>
            <Button variant="tertiary" size="sm" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" icon="refresh" disabled={disabled} onClick={() => setConfirming(true)} className="self-start">
          {label}
        </Button>
      )}
      <Feedback state={state} />
    </form>
  );
}
