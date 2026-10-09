"use client";

import { useActionState } from "react";
import { startSessionAction, type SessionActionState } from "./actions";

const initialState: SessionActionState = null;

/** CTA "Iniciar treino" de um dia, na lista de dias (sem sessão aberta). `primary` destaca o
 * dia recomendado de hoje (`pickNextWorkoutDay`) com o botão de destaque em vez do neutro. */
export default function StartSessionButton({
  clientId,
  planId,
  dayId,
  weekNumber,
  primary,
}: {
  clientId: string;
  planId: string;
  dayId: string;
  weekNumber: number;
  primary: boolean;
}) {
  const [state, action, pending] = useActionState(startSessionAction, initialState);

  return (
    <form action={action} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="weekNumber" value={weekNumber} />
      <button
        type="submit"
        disabled={pending}
        className={
          primary
            ? "inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
            : "inline-flex min-h-11 items-center justify-center rounded-md border border-line px-4 text-sm text-ink hover:border-brand disabled:opacity-60"
        }
      >
        {pending ? "Iniciando…" : "Iniciar treino"}
      </button>
      {state?.error && <p className="max-w-40 text-right text-xs text-coral-text">{state.error}</p>}
    </form>
  );
}
