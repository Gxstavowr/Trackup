"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
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
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="dayId" value={dayId} />
      <input type="hidden" name="weekNumber" value={weekNumber} />
      <button
        type="submit"
        disabled={pending}
        className={buttonClass({ variant: primary ? "primary" : "secondary", size: "lg", width: "full" })}
      >
        {pending ? "Iniciando…" : "Iniciar treino"}
      </button>
      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}
    </form>
  );
}
