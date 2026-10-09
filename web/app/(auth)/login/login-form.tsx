"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { loginCoach, loginStudentMagicLink, type LoginState } from "./actions";

const initialState: LoginState = null;

export default function LoginForm() {
  const [mode, setMode] = useState<"coach" | "aluno">("coach");

  return (
    <div>
      <div className="mb-6 flex rounded-md border border-line bg-surface-sunken p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("coach")}
          className={`min-h-11 flex-1 rounded-[6px] py-2 font-medium transition-colors ${
            mode === "coach"
              ? "bg-brand text-on-accent"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Sou coach
        </button>
        <button
          type="button"
          onClick={() => setMode("aluno")}
          className={`min-h-11 flex-1 rounded-[6px] py-2 font-medium transition-colors ${
            mode === "aluno"
              ? "bg-brand text-on-accent"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Sou aluno(a)
        </button>
      </div>

      {mode === "coach" ? <CoachLoginForm /> : <StudentLoginForm />}
    </div>
  );
}

function CoachLoginForm() {
  const [state, action, pending] = useActionState(loginCoach, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="font-display text-hero text-ink">Entrar</h1>

      <Field label="E-mail" name="email" type="email" autoComplete="email" />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
      />

      {state?.error && <ErrorMessage>{state.error}</ErrorMessage>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <Link href="/esqueci-senha" className="hover:text-brand">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="hover:text-brand">
          Criar conta
        </Link>
      </div>
    </form>
  );
}

function StudentLoginForm() {
  const [state, action, pending] = useActionState(
    loginStudentMagicLink,
    initialState
  );

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <h1 className="font-display text-hero text-ink">Verifique seu e-mail</h1>
        <p className="text-sm text-ink-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="font-display text-hero text-ink">Entrar</h1>
      <p className="text-sm text-ink-muted">
        Enviamos um link de acesso para o seu e-mail — sem senha.
      </p>

      <Field label="E-mail" name="email" type="email" autoComplete="email" />

      {state?.error && <ErrorMessage>{state.error}</ErrorMessage>}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-ink-muted">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
      />
    </label>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
      {children}
    </p>
  );
}
