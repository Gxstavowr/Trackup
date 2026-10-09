"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = null;

export default function EsqueciSenhaForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState
  );

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <h1 className="font-display text-hero text-ink">Verifique seu e-mail</h1>
        <p className="text-sm text-ink-muted">{state.message}</p>
        <Link
          href="/login"
          className="mt-2 text-sm font-medium text-brand hover:underline"
        >
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="font-display text-hero text-ink">Esqueci minha senha</h1>
      <p className="text-sm text-ink-muted">
        Informe o e-mail da sua conta de coach para receber um link de redefinição.
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">E-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
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
        {pending ? "Enviando…" : "Enviar link"}
      </button>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/login" className="text-brand hover:underline">
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}
