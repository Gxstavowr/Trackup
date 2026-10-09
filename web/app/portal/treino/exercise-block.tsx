"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import type { WorkoutExerciseWithDetails, WorkoutSetLog } from "@/lib/repository";
import { blockTypeLabel } from "@/lib/workout-builder";
import { setNumbersFor } from "@/lib/workout-session";
import { logSetAction, type SessionActionState } from "./actions";

const initialState: SessionActionState = null;

const INPUT_NUM =
  "h-11 w-20 min-w-0 rounded-md border border-line bg-surface-sunken px-2 text-center text-base text-ink outline-none focus:border-brand disabled:opacity-50";

/** Séries com carga/reps já registrados nesta sessão, por número de série. */
export type LoggedSetsByNumber = Record<number, { load: number | null; reps: number | null }>;

function isCardioOnly(we: WorkoutExerciseWithDetails): boolean {
  return we.block_type === "cardio" && we.reps == null && we.reps_min == null && we.reps_max == null;
}

function describeTarget(we: WorkoutExerciseWithDetails): string {
  const repRange =
    we.reps_min != null || we.reps_max != null
      ? `${we.reps_min ?? "?"}–${we.reps_max ?? "?"} reps`
      : we.reps != null
        ? `${we.reps} reps`
        : null;

  return (
    [
      repRange,
      we.duration_sec != null && `${Math.round(we.duration_sec / 60)} min`,
      we.suggested_load != null && `carga sugerida ${we.suggested_load}kg`,
      we.rir != null && `RIR alvo ${we.rir}`,
      we.tempo && `cadência ${we.tempo}`,
    ]
      .filter(Boolean)
      .join(" · ") || "Sem detalhes"
  );
}

function formatSetShort(load: number | null, reps: number | null): string {
  const loadLabel = load != null ? `${load}kg` : "—";
  const repsLabel = reps != null ? `${reps}x` : "—";
  return `${loadLabel} × ${repsLabel}`;
}

/**
 * Um exercício prescrito dentro da sessão de execução (item 19): alvo (séries/reps/descanso/
 * RIR/cadência), vídeo (link honesto — nunca player fake), substituição autorizada pelo coach
 * (`we.substitute`), desempenho anterior por série e o registro de carga/reps/RIR percebido de
 * cada série, uma por uma.
 */
export default function ExerciseBlock({
  clientId,
  sessionId,
  weekNumber,
  we,
  loggedSets,
  previousSets,
  disabled,
  onSetLogged,
  onRestStart,
}: {
  clientId: string;
  sessionId: string;
  weekNumber: number;
  we: WorkoutExerciseWithDetails;
  loggedSets: LoggedSetsByNumber;
  previousSets: WorkoutSetLog[] | undefined;
  disabled: boolean;
  onSetLogged: (setNumber: number, load: number | null, reps: number | null) => void;
  onRestStart: (seconds: number, label: string) => void;
}) {
  const [usingSubstitute, setUsingSubstitute] = useState(false);
  const activeExercise = usingSubstitute && we.substitute ? we.substitute : we.exercise;
  const cardioOnly = isCardioOnly(we);
  const doneCount = Object.keys(loggedSets).length;
  const totalSets = setNumbersFor(we).length;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-sunken/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words font-medium text-ink">{activeExercise.name}</span>
            {we.block_type !== "normal" && (
              <span className="rounded-full bg-warn-tint px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-warn">
                {blockTypeLabel(we.block_type)}
              </span>
            )}
            <span className="font-mono text-xs text-ink-faint">
              {doneCount}/{totalSets}
            </span>
          </div>
          <p className="text-sm text-ink-muted">{describeTarget(we)}</p>
          {we.rest_sec != null && <p className="text-xs text-ink-faint">Descanso alvo: {we.rest_sec}s</p>}
          {we.notes && <p className="break-words text-xs text-ink-faint">{we.notes}</p>}
          {activeExercise.instruction && (
            <p className="break-words text-xs text-ink-faint">{activeExercise.instruction}</p>
          )}
          {activeExercise.video_url && (
            <a
              href={activeExercise.video_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand hover:underline"
            >
              Ver vídeo do exercício
            </a>
          )}
          {previousSets && previousSets.length > 0 && (
            <p className="text-xs text-ink-faint">
              Última vez: {previousSets.map((p) => formatSetShort(p.load, p.reps)).join(", ")}
            </p>
          )}
        </div>

        {we.substitute && (
          <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label="Escolher exercício ou substituto">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setUsingSubstitute(false)}
              className={`min-h-9 max-w-full rounded-full border px-3 text-xs break-words disabled:opacity-50 ${
                usingSubstitute ? "border-line text-ink-muted" : "border-brand bg-brand-tint text-brand"
              }`}
            >
              {we.exercise.name}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setUsingSubstitute(true)}
              className={`min-h-9 max-w-full rounded-full border px-3 text-xs break-words disabled:opacity-50 ${
                usingSubstitute ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted"
              }`}
            >
              Substituir: {we.substitute.name}
            </button>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {setNumbersFor(we).map((setNumber) => (
          <SetRow
            key={setNumber}
            clientId={clientId}
            sessionId={sessionId}
            weekNumber={weekNumber}
            workoutExerciseId={we.id}
            exerciseId={activeExercise.id}
            exerciseName={activeExercise.name}
            setNumber={setNumber}
            cardioOnly={cardioOnly}
            showRir={we.block_type !== "cardio"}
            initial={loggedSets[setNumber]}
            previous={previousSets?.find((p) => p.set_number === setNumber) ?? null}
            disabled={disabled}
            onLogged={(load, reps) => {
              onSetLogged(setNumber, load, reps);
              if (we.rest_sec != null && we.rest_sec > 0) {
                onRestStart(we.rest_sec, activeExercise.name);
              }
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function SetRow({
  clientId,
  sessionId,
  weekNumber,
  workoutExerciseId,
  exerciseId,
  exerciseName,
  setNumber,
  cardioOnly,
  showRir,
  initial,
  previous,
  disabled,
  onLogged,
}: {
  clientId: string;
  sessionId: string;
  weekNumber: number;
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  cardioOnly: boolean;
  showRir: boolean;
  initial: { load: number | null; reps: number | null } | undefined;
  previous: WorkoutSetLog | null;
  disabled: boolean;
  onLogged: (load: number | null, reps: number | null) => void;
}) {
  const [state, action, pending] = useActionState(logSetAction, initialState);
  const [load, setLoad] = useState(initial?.load != null ? String(initial.load) : "");
  const [reps, setReps] = useState(initial?.reps != null ? String(initial.reps) : "");
  const done = initial != null || state?.success;
  const lastSubmitted = useRef<{ load: number | null; reps: number | null }>({ load: null, reps: null });

  useEffect(() => {
    if (state?.success) {
      onLogged(lastSubmitted.current.load, lastSubmitted.current.reps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <li>
      <form
        action={action}
        onSubmit={() => {
          lastSubmitted.current = {
            load: load.trim() === "" ? null : Number(load),
            reps: reps.trim() === "" ? null : Number(reps),
          };
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="workoutExerciseId" value={workoutExerciseId} />
        <input type="hidden" name="exerciseId" value={exerciseId} />
        <input type="hidden" name="setNumber" value={setNumber} />
        <input type="hidden" name="weekNumber" value={weekNumber} />

        <span className="flex h-11 w-8 shrink-0 items-center justify-center font-mono text-sm text-ink-faint">
          {setNumber}ª
        </span>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-ink-faint">Carga (kg)</span>
          <input
            name="load"
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            value={load}
            onChange={(e) => setLoad(e.target.value)}
            disabled={disabled}
            placeholder={previous?.load != null ? String(previous.load) : undefined}
            className={INPUT_NUM}
          />
        </label>

        {!cardioOnly && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-faint">Reps</span>
            <input
              name="reps"
              type="number"
              min={0}
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              disabled={disabled}
              placeholder={previous?.reps != null ? String(previous.reps) : undefined}
              className={INPUT_NUM}
            />
          </label>
        )}

        {showRir && (
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-ink-faint">RIR</span>
            <input
              name="perceivedRir"
              type="number"
              min={0}
              max={10}
              inputMode="numeric"
              disabled={disabled}
              defaultValue={previous?.perceived_rir ?? ""}
              className={`${INPUT_NUM} w-16`}
            />
          </label>
        )}

        <button
          type="submit"
          disabled={disabled || pending}
          aria-label={`Marcar ${setNumber}ª série de ${exerciseName} como concluída`}
          className={`min-h-11 rounded-md border px-4 text-sm transition-colors disabled:opacity-50 ${
            done ? "border-ok bg-ok-tint text-ok" : "border-line text-ink hover:border-brand"
          }`}
        >
          {pending ? "Salvando…" : done ? "Concluída ✓" : "Concluir série"}
        </button>

        {state?.error && <p className="w-full text-xs text-coral-text">{state.error}</p>}
      </form>
    </li>
  );
}
