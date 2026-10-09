"use client";

import { useActionState, useEffect, useState } from "react";
import type { Exercise, WorkoutDayWithExercises, WorkoutExerciseWithDetails } from "@/lib/repository";
import { blockTypeLabel, groupDayExercises, groupKindLabel } from "@/lib/workout-builder";
import {
  addExerciseToDayAction,
  deleteWorkoutDayAction,
  deleteWorkoutExerciseAction,
  duplicateWorkoutDayAction,
  duplicateWorkoutExerciseAction,
  moveWorkoutDayAction,
  moveWorkoutExerciseAction,
  updateWorkoutDayAction,
  updateWorkoutExerciseAction,
  type TreinoActionState,
} from "./actions";
import WorkoutExerciseFields from "./workout-exercise-fields";

const ICON_BTN =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-line text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const TEXT_BTN =
  "inline-flex min-h-11 items-center rounded-md border border-line px-3 text-sm text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-40";
const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

const initialState: TreinoActionState = null;

function describePrescription(we: WorkoutExerciseWithDetails): string {
  const repRange =
    we.reps_min != null || we.reps_max != null
      ? `${we.reps_min ?? "?"}–${we.reps_max ?? "?"} reps`
      : we.reps != null
        ? `${we.reps} reps`
        : null;

  return (
    [
      we.sets != null && `${we.sets} séries`,
      repRange,
      we.suggested_load != null && `${we.suggested_load}kg`,
      we.rest_sec != null && `${we.rest_sec}s descanso`,
      we.rir != null && `RIR ${we.rir}`,
      we.tempo && `cadência ${we.tempo}`,
      we.duration_sec != null && `${we.duration_sec}s`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem detalhes"
  );
}

/** Um dia de treino: blocos (aquecimento/normal/cardio, com superset/circuito agrupados
 * visualmente), reordenar/duplicar/remover dia e exercício, editar prescrição inline,
 * adicionar exercício. `editable=false` (plano publicado/arquivado/template em preview) some
 * com toda ação e mostra só a leitura. */
export default function DayCard({
  clientId,
  planId,
  day,
  dayOrderIds,
  isFirst,
  isLast,
  exercises,
  editable,
}: {
  clientId: string;
  planId: string;
  day: WorkoutDayWithExercises;
  dayOrderIds: string[];
  isFirst: boolean;
  isLast: boolean;
  exercises: Exercise[];
  editable: boolean;
}) {
  const [editingDay, setEditingDay] = useState(false);
  const [addingExercise, setAddingExercise] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);

  const blocks = groupDayExercises(day.exercises);
  const exerciseOrderIds = day.exercises
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((we) => we.id);

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-ink">{day.name}</h3>
          <p className="text-xs text-ink-faint">
            {[day.duration_min != null && `${day.duration_min} min`, day.notes].filter(Boolean).join(" · ")}
          </p>
        </div>

        {editable && (
          <div className="flex flex-wrap gap-1.5">
            <form action={moveWorkoutDayAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="dayId" value={day.id} />
              <input type="hidden" name="direction" value={-1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(dayOrderIds)} />
              <button type="submit" disabled={isFirst} className={ICON_BTN} aria-label="Mover dia para cima">
                ↑
              </button>
            </form>
            <form action={moveWorkoutDayAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="dayId" value={day.id} />
              <input type="hidden" name="direction" value={1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(dayOrderIds)} />
              <button type="submit" disabled={isLast} className={ICON_BTN} aria-label="Mover dia para baixo">
                ↓
              </button>
            </form>
            <button type="button" onClick={() => setEditingDay((v) => !v)} className={TEXT_BTN}>
              {editingDay ? "Cancelar" : "Editar dia"}
            </button>
            <form action={duplicateWorkoutDayAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="dayId" value={day.id} />
              <button type="submit" className={TEXT_BTN}>
                Duplicar dia
              </button>
            </form>
            <form action={deleteWorkoutDayAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="dayId" value={day.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Remover
              </button>
            </form>
          </div>
        )}
      </div>

      {editable && editingDay && (
        <EditDayForm clientId={clientId} day={day} onDone={() => setEditingDay(false)} />
      )}

      {blocks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Nenhum exercício neste dia ainda.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {blocks.map((block, blockIndex) =>
            block.kind === "single" ? (
              <li key={block.item.id}>
                <ExerciseRow
                  clientId={clientId}
                  we={block.item}
                  exercises={exercises}
                  editable={editable}
                  editing={editingExerciseId === block.item.id}
                  onToggleEdit={() =>
                    setEditingExerciseId((current) => (current === block.item.id ? null : block.item.id))
                  }
                  dayId={day.id}
                  exerciseOrderIds={exerciseOrderIds}
                  isFirst={exerciseOrderIds[0] === block.item.id}
                  isLast={exerciseOrderIds[exerciseOrderIds.length - 1] === block.item.id}
                />
              </li>
            ) : (
              <li
                key={`${block.groupKey}-${blockIndex}`}
                className="rounded-md border border-brand/30 bg-brand-tint/40 p-3"
              >
                <span className="mb-2 inline-block rounded-full bg-brand-tint px-2.5 py-0.5 font-mono text-xs uppercase tracking-wide text-brand">
                  {groupKindLabel(block.groupKind)} {block.groupKey}
                </span>
                <ul className="flex flex-col gap-3">
                  {block.items.map((we) => (
                    <li key={we.id}>
                      <ExerciseRow
                        clientId={clientId}
                        we={we}
                        exercises={exercises}
                        editable={editable}
                        editing={editingExerciseId === we.id}
                        onToggleEdit={() =>
                          setEditingExerciseId((current) => (current === we.id ? null : we.id))
                        }
                        dayId={day.id}
                        exerciseOrderIds={exerciseOrderIds}
                        isFirst={exerciseOrderIds[0] === we.id}
                        isLast={exerciseOrderIds[exerciseOrderIds.length - 1] === we.id}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )
          )}
        </ul>
      )}

      {editable && (
        <div className="mt-4 border-t border-line pt-4">
          {addingExercise ? (
            <AddExerciseForm
              clientId={clientId}
              dayId={day.id}
              exercises={exercises}
              onDone={() => setAddingExercise(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingExercise(true)}
              className="min-h-11 rounded-md border border-line px-4 py-2 text-sm text-ink hover:border-brand"
            >
              + Adicionar exercício
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function EditDayForm({
  clientId,
  day,
  onDone,
}: {
  clientId: string;
  day: WorkoutDayWithExercises;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateWorkoutDayAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-dashed border-line p-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="dayId" value={day.id} />
      <label className="flex flex-1 flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nome do dia</span>
        <input name="name" type="text" required defaultValue={day.name} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Duração (min)</span>
        <input
          name="duration_min"
          type="number"
          min={0}
          defaultValue={day.duration_min ?? ""}
          className={`${INPUT} w-28`}
        />
      </label>
      <label className="flex w-full flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Observações do dia</span>
        <textarea name="notes" rows={2} defaultValue={day.notes ?? ""} className={INPUT} />
      </label>
      {state?.error && (
        <p className="w-full rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${TEXT_BTN} border-brand text-brand`}>
        {pending ? "Salvando…" : "Salvar dia"}
      </button>
    </form>
  );
}

function AddExerciseForm({
  clientId,
  dayId,
  exercises,
  onDone,
}: {
  clientId: string;
  dayId: string;
  exercises: Exercise[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(addExerciseToDayAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (exercises.length === 0) {
    return (
      <p className="text-xs text-ink-faint">
        Cadastre um exercício na biblioteca acima para adicionar aqui.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="dayId" value={dayId} />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Exercício</span>
        <select name="exerciseId" required defaultValue="" className={INPUT}>
          <option value="" disabled>
            Selecione…
          </option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
            </option>
          ))}
        </select>
      </label>

      <WorkoutExerciseFields exercises={exercises} />

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
          {pending ? "Adicionando…" : "Adicionar exercício"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ExerciseRow({
  clientId,
  we,
  exercises,
  editable,
  editing,
  onToggleEdit,
  dayId,
  exerciseOrderIds,
  isFirst,
  isLast,
}: {
  clientId: string;
  we: WorkoutExerciseWithDetails;
  exercises: Exercise[];
  editable: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  dayId: string;
  exerciseOrderIds: string[];
  isFirst: boolean;
  isLast: boolean;
}) {
  const showBlockBadge = we.block_type !== "normal";

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{we.exercise.name}</span>
            {showBlockBadge && (
              <span className="rounded-full bg-warn-tint px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-warn">
                {blockTypeLabel(we.block_type)}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">{describePrescription(we)}</p>
          {we.substitute && (
            <p className="text-xs text-ink-faint">Substituto: {we.substitute.name}</p>
          )}
          {we.notes && <p className="text-xs text-ink-faint">{we.notes}</p>}
          {we.exercise.instruction && <p className="text-xs text-ink-faint">{we.exercise.instruction}</p>}
          {we.exercise.video_url && (
            <a
              href={we.exercise.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand hover:underline"
            >
              Ver vídeo demonstrativo
            </a>
          )}
        </div>

        {editable && (
          <div className="flex flex-wrap gap-1.5">
            <form action={moveWorkoutExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="dayId" value={dayId} />
              <input type="hidden" name="workoutExerciseId" value={we.id} />
              <input type="hidden" name="direction" value={-1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(exerciseOrderIds)} />
              <button type="submit" disabled={isFirst} className={ICON_BTN} aria-label="Mover para cima">
                ↑
              </button>
            </form>
            <form action={moveWorkoutExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="dayId" value={dayId} />
              <input type="hidden" name="workoutExerciseId" value={we.id} />
              <input type="hidden" name="direction" value={1} />
              <input type="hidden" name="orderJson" value={JSON.stringify(exerciseOrderIds)} />
              <button type="submit" disabled={isLast} className={ICON_BTN} aria-label="Mover para baixo">
                ↓
              </button>
            </form>
            <button type="button" onClick={onToggleEdit} className={TEXT_BTN}>
              {editing ? "Cancelar" : "Editar"}
            </button>
            <form action={duplicateWorkoutExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="workoutExerciseId" value={we.id} />
              <button type="submit" className={TEXT_BTN}>
                Duplicar
              </button>
            </form>
            <form action={deleteWorkoutExerciseAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="workoutExerciseId" value={we.id} />
              <button type="submit" className={`${TEXT_BTN} text-late-text`}>
                Remover
              </button>
            </form>
          </div>
        )}
      </div>

      {editable && editing && (
        <EditExerciseForm clientId={clientId} we={we} exercises={exercises} onDone={onToggleEdit} />
      )}
    </div>
  );
}

function EditExerciseForm({
  clientId,
  we,
  exercises,
  onDone,
}: {
  clientId: string;
  we: WorkoutExerciseWithDetails;
  exercises: Exercise[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateWorkoutExerciseAction, initialState);

  useEffect(() => {
    if (state?.success) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="workoutExerciseId" value={we.id} />
      <input type="hidden" name="exerciseId" value={we.exercise_id} />
      <p className="text-xs text-ink-faint">Exercício: {we.exercise.name} (trocar = remover e adicionar de novo)</p>

      <WorkoutExerciseFields exercises={exercises} excludeExerciseId={we.exercise_id} defaultValues={we} />

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
          {pending ? "Salvando…" : "Salvar alterações"}
        </button>
        <button type="button" onClick={onDone} className={TEXT_BTN}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
