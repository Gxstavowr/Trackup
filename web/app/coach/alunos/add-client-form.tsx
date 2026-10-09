"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClientAction, type CreateClientState } from "./actions";

const initialState: CreateClientState = null;

/**
 * Modal simples "Adicionar aluno" (item 4 do TODO). Fica fechado por padrão; abre num botão no
 * topo da lista de alunos. Idade, altura e objetivo são OPCIONAIS (item 11): a lista de alunos
 * mostra "—" quando faltam. Não existe tela de edição — só se preenche aqui, ao cadastrar.
 */
export default function AddClientForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createClientAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Ajusta o estado derivado do resultado da action durante a própria renderização (em
  // vez de num useEffect) — evita o "setState síncrono dentro de efeito" que o eslint
  // (react-hooks/set-state-in-effect) sinaliza; ver https://react.dev/learn/you-might-not-need-an-effect.
  const [handledState, setHandledState] = useState<CreateClientState>(null);
  if (state?.success && state !== handledState) {
    setHandledState(state);
    setOpen(false);
  }

  useEffect(() => {
    if (handledState?.success) {
      formRef.current?.reset();
    }
  }, [handledState]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity hover:opacity-90"
      >
        + Adicionar aluno
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-[var(--surface-raised-shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-hero text-ink">Adicionar aluno</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-faint hover:text-ink"
          >
            ✕
          </button>
        </div>

        <form ref={formRef} action={action} className="flex flex-col gap-4">
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
              autoComplete="email"
              className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-muted">Telefone (opcional)</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-muted">Idade (opcional)</span>
              <input
                name="age"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                step={1}
                className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-ink-muted">Altura em cm (opcional)</span>
              <input
                name="heightCm"
                type="number"
                inputMode="numeric"
                min={50}
                max={250}
                step={1}
                placeholder="ex.: 175"
                className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-muted">Objetivo (opcional)</span>
            <input
              name="objective"
              type="text"
              maxLength={200}
              placeholder="ex.: Emagrecimento, hipertrofia"
              className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </label>

          {state?.error && (
            <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
              {state.error}
            </p>
          )}

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-md border border-line py-2.5 font-medium text-ink-muted hover:border-line-strong"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
            >
              {pending ? "Criando…" : "Criar aluno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
