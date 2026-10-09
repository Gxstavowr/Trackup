"use client";

import { useActionState, useState } from "react";
import { createPrivacyRequestAction, type PrivacyRequestState } from "./actions";

const initialState: PrivacyRequestState = null;

const FIELD =
  "min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand";

export default function PrivacyRequestForm() {
  const [state, action, pending] = useActionState(createPrivacyRequestAction, initialState);
  const [type, setType] = useState("correction");

  return (
    <form action={action} className="flex flex-col gap-3">
      <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={FIELD}>
        <option value="correction">Corrigir um dado</option>
        <option value="deletion">Excluir todos os meus dados</option>
        <option value="access">Saber com quem meus dados são compartilhados</option>
        <option value="other">Outro</option>
      </select>
      <textarea
        name="details"
        rows={3}
        maxLength={2000}
        required={type === "correction"}
        placeholder={type === "correction" ? "O que está errado e qual o valor certo?" : "Detalhes (opcional)"}
        className={`${FIELD} resize-y`}
      />
      {type === "deletion" && (
        <label className="flex items-start gap-2.5 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="confirm"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
          />
          Entendo que a exclusão é definitiva e encerra meu acompanhamento. Recomendo baixar meus
          dados antes.
        </label>
      )}

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p className="rounded-md border border-brand/40 bg-brand-tint px-3 py-2 text-sm text-ink">
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-fit items-center rounded-md bg-brand px-5 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar pedido"}
      </button>
    </form>
  );
}
