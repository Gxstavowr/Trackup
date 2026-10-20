"use client";

import { useActionState } from "react";
import { Field, Input, SubmitButton, Textarea } from "@/components/ui";
import { setPlatformPriceAction, type PriceFormState } from "./actions";

/** Formulário do novo preço. Só coleta texto; validação e gravação acontecem na Server Action. */
export default function PriceForm({ defaultDate }: { defaultDate: string }) {
  const [state, action] = useActionState<PriceFormState, FormData>(setPlatformPriceAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor mensal (R$)" helper="Ex.: 149,90">
          <Input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" />
        </Field>
        <Field label="Vale a partir de" helper="Fuso de São Paulo">
          <Input name="effective_from" type="date" required defaultValue={defaultDate} />
        </Field>
      </div>
      <Field label="Observação (opcional)" helper="Até 300 caracteres. Não coloque dados pessoais.">
        <Textarea name="note" maxLength={300} rows={2} />
      </Field>

      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm font-semibold text-success">
          {state.success}
        </p>
      )}

      <SubmitButton variant="primary" pendingLabel="Salvando…" className="self-start">
        Registrar preço
      </SubmitButton>
    </form>
  );
}
