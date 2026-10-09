"use client";

import { useActionState, useEffect, useState } from "react";
import type { Exercise } from "@/lib/repository";
import { archiveExerciseAction, unarchiveExerciseAction, updateExerciseAction, type TreinoActionState } from "./actions";

const initialState: TreinoActionState = null;
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";
const TEXT_BTN =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink";

/** Uma linha da biblioteca — nome/categoria/grupo/equipamento + toggle "Editar" (form inline,
 * mesmos campos de `CreateExerciseForm`) e arquivar/reativar (soft delete, item 18). */
export default function ExerciseRow({ clientId, exercise }: { clientId: string; exercise: Exercise }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">
            {exercise.name} {exercise.is_archived && <span className="text-xs text-ink-faint">(arquivado)</span>}
          </span>
          <span className="text-xs text-ink-faint">
            {[exercise.category, exercise.muscle_group, exercise.equipment].filter(Boolean).join(" · ")}
            {exercise.is_custom ? " · personalizado" : ""}
          </span>
          {exercise.video_url && (
            <a href={exercise.video_url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline">
              Ver vídeo demonstrativo
            </a>
          )}
        </div>

        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing((v) => !v)} className={TEXT_BTN}>
            {editing ? "Cancelar" : "Editar"}
          </button>
          {exercise.is_archived ? (
            <form action={unarchiveExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="exerciseId" value={exercise.id} />
              <button type="submit" className={TEXT_BTN}>
                Reativar
              </button>
            </form>
          ) : (
            <form action={archiveExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="exerciseId" value={exercise.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Arquivar
              </button>
            </form>
          )}
        </div>
      </div>

      {editing && <EditExerciseForm clientId={clientId} exercise={exercise} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditExerciseForm({
  clientId,
  exercise,
  onDone,
}: {
  clientId: string;
  exercise: Exercise;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateExerciseAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="exerciseId" value={exercise.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className="text-ink-muted">Nome</span>
          <input name="name" type="text" required defaultValue={exercise.name} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Categoria</span>
          <input name="category" type="text" required defaultValue={exercise.category} className={INPUT} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className="text-ink-muted">Grupo muscular</span>
          <input name="muscle_group" type="text" defaultValue={exercise.muscle_group ?? ""} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Equipamento</span>
          <input name="equipment" type="text" defaultValue={exercise.equipment ?? ""} className={INPUT} />
        </label>
      </div>

      <label className={LABEL}>
        <span className="text-ink-muted">Instrução</span>
        <textarea name="instruction" rows={2} defaultValue={exercise.instruction ?? ""} className={INPUT} />
      </label>

      <label className={LABEL}>
        <span className="text-ink-muted">Vídeo demonstrativo (URL)</span>
        <input name="video_url" type="url" defaultValue={exercise.video_url ?? ""} className={INPUT} />
      </label>

      {state?.error && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-brand px-4 py-2 font-medium text-on-accent transition-opacity disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
