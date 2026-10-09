"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupCoach, type SignupState } from "./actions";

const initialState: SignupState = null;

export default function CadastroForm() {
  const [state, action, pending] = useActionState(signupCoach, initialState);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <h1 className="font-display text-hero text-ink">Quase lá</h1>
        <p className="text-sm text-ink-muted">{state.message}</p>
        <Link
          href="/login"
          className="mt-2 text-sm font-medium text-brand hover:underline"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="font-display text-hero text-ink">Criar conta de coach</h1>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nome</span>
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </label>

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

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Senha</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </label>

      <label className="flex items-start gap-2.5 text-sm text-ink-muted">
        <input
          name="accept_terms"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
        />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className="text-brand hover:underline">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" target="_blank" className="text-brand hover:underline">
            Política de Privacidade
          </Link>
          .
        </span>
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
        {pending ? "Criando conta…" : "Criar conta"}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Já tem conta?{" "}
        <Link href="/login" className="text-brand hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
