"use client";

import { useActionState, useEffect, useRef } from "react";
import { createExerciseAction, type TreinoActionState } from "./actions";

const initialState: TreinoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";

/** Formulário "Novo exercício" — exercício PERSONALIZADO do coach: nome, categoria, grupo
 * muscular, equipamento, instrução e vídeo demonstrativo (item 18). */
export default function CreateExerciseForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(createExerciseAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-line p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <span className="text-sm font-medium text-ink">Novo exercício personalizado</span>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Categoria</span>
          <input name="category" type="text" required placeholder="Peito, costas, pernas..." className={INPUT} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className="text-ink-muted">Grupo muscular</span>
          <input name="muscle_group" type="text" placeholder="Peitoral, quadríceps..." className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Equipamento</span>
          <input name="equipment" type="text" placeholder="Barra, halteres, peso do corpo..." className={INPUT} />
        </label>
      </div>

      <label className={LABEL}>
        <span className="text-ink-muted">Instrução (opcional)</span>
        <textarea name="instruction" rows={2} className={INPUT} />
      </label>

      <label className={LABEL}>
        <span className="text-ink-muted">Vídeo demonstrativo (URL, opcional)</span>
        <input name="video_url" type="url" placeholder="https://..." className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Criando…" : "Adicionar exercício"}
      </button>
    </form>
  );
}
