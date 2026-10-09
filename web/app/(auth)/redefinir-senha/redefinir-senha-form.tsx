"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "./actions";

const initialState: UpdatePasswordState = null;

export default function RedefinirSenhaForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="font-display text-hero text-ink">Definir nova senha</h1>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nova senha</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
