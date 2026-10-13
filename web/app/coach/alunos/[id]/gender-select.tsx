"use client";

import { useActionState, useState } from "react";
import { GENDER_FORM_OPTIONS } from "@/lib/checkin-catalog";
import { selectClass } from "@/components/ui/field";
import { saveClientGenderAction, type GenderFormState } from "./gender-actions";

/**
 * Select pequeno "Sexo (para perguntas do check-in)". `initial` já vem normalizado para um dos
 * valores do formulário ("feminino" / "masculino" / "" = não informado). Salva ao trocar.
 */
export default function GenderSelect({ clientId, initial }: { clientId: string; initial: string }) {
  const [state, action, pending] = useActionState<GenderFormState, FormData>(saveClientGenderAction, null);
  const [value, setValue] = useState(initial);

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="clientId" value={clientId} />
      <label htmlFor="client-gender" className="t-label text-ink-faint">
        Sexo (para perguntas do check-in)
      </label>
      <select
        id="client-gender"
        name="gender"
        value={value}
        disabled={pending}
        onChange={(e) => {
          setValue(e.target.value);
          e.currentTarget.form?.requestSubmit();
        }}
        aria-describedby="client-gender-help client-gender-status"
        className={`${selectClass} min-h-11 max-w-xs`}
      >
        {GENDER_FORM_OPTIONS.map((o) => (
          <option key={o.value || "none"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p id="client-gender-help" className="text-xs text-ink-muted">
        Define se a pergunta sobre ciclo menstrual aparece. Não informado: ela aparece com a opção “Não se aplica”.
      </p>
      <p
        id="client-gender-status"
        aria-live="polite"
        className={`min-h-4 text-xs ${state?.error ? "text-danger-text" : "text-success"}`}
      >
        {pending ? "Salvando…" : (state?.error ?? state?.ok ?? "")}
      </p>
    </form>
  );
}
