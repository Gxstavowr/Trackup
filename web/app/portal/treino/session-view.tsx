"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { WorkoutDayWithExercises, WorkoutExerciseWithDetails, WorkoutSession, WorkoutSetLog } from "@/lib/repository";
import { groupDayExercises, groupKindLabel } from "@/lib/workout-builder";
import {
  buildSessionSummary,
  computeElapsedSeconds,
  computeSessionProgress,
  formatDuration,
  setKey,
  type SessionSummary,
  type SetKey,
  type SummaryLogLike,
} from "@/lib/workout-session";
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD } from "../portal-ui";
import { completeSessionAction, pauseSessionAction, resumeSessionAction, type SessionActionState } from "./actions";
import ExerciseBlock, { type LoggedSetsByNumber } from "./exercise-block";
import RestTimer from "./rest-timer";
import SessionSummaryScreen from "./session-summary";

const initialState: SessionActionState = null;

type LoggedSetsByExercise = Record<string, LoggedSetsByNumber>;
type RestTimerState = { key: string; seconds: number; label: string };

/**
 * A sessão de treino em execução (item 19) — orquestra progresso da sessão, blocos do dia
 * (aquecimento/normal/cardio/superset/circuito, via `groupDayExercises` do item 18), timer de
 * descanso, pausa/retomada e finalização com resumo. Estado (séries marcadas, pausa, nota)
 * vive aqui e é otimista: cada `ExerciseBlock`/botão só atualiza o servidor via Server Action
 * e, no sucesso, atualiza este estado local — nenhuma tela recarrega/pisca a cada série.
 *
 * `day === null` é o caso raro em que o coach republicou o plano NO MEIO desta sessão (a versão
 * que ela referenciava foi arquivada) — a sessão continua podendo ser pausada/retomada/
 * finalizada (ela já existe no banco), só não há mais exercício pra mostrar/registrar.
 */
export default function SessionView({
  clientId,
  session,
  day,
  initialLogs,
  previousPerformance,
}: {
  clientId: string;
  session: WorkoutSession;
  day: WorkoutDayWithExercises | null;
  initialLogs: WorkoutSetLog[];
  previousPerformance: Record<string, WorkoutSetLog[]>;
}) {
  const [status, setStatus] = useState(session.status);
  const [pausedAt, setPausedAt] = useState<string | null>(session.paused_at);
  const [pausedTotalSec, setPausedTotalSec] = useState(session.paused_total_sec);
  const [note, setNote] = useState(session.student_note ?? "");
  const [restTimer, setRestTimer] = useState<RestTimerState | null>(null);
  const [completedSummary, setCompletedSummary] = useState<SessionSummary | null>(null);
  const [, forceTick] = useState(0);

  const [loggedSets, setLoggedSets] = useState<LoggedSetsByExercise>(() => {
    const map: LoggedSetsByExercise = {};
    for (const log of initialLogs) {
      if (!log.workout_exercise_id || log.set_number == null) continue;
      const bucket = map[log.workout_exercise_id] ?? {};
      bucket[log.set_number] = { load: log.load, reps: log.reps };
      map[log.workout_exercise_id] = bucket;
    }
    return map;
  });

  // Só pra re-renderizar o relógio de duração a cada segundo (pausar/retomar já é otimista,
  // não depende deste tick — ver `computeElapsedSeconds`).
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const exercises = day?.exercises ?? [];
  const doneKeys = new Set<SetKey>();
  for (const [workoutExerciseId, bySet] of Object.entries(loggedSets)) {
    for (const setNumberStr of Object.keys(bySet)) {
      doneKeys.add(setKey(workoutExerciseId, Number(setNumberStr)));
    }
  }
  const progress = computeSessionProgress(exercises, doneKeys);
  const elapsedSec = computeElapsedSeconds({
    started_at: session.started_at,
    paused_at: pausedAt,
    paused_total_sec: pausedTotalSec,
    ended_at: null,
  });
  const blocks = groupDayExercises(exercises);
  const paused = status === "paused";

  const flatLogsForSummary: SummaryLogLike[] = [];
  for (const [workoutExerciseId, bySet] of Object.entries(loggedSets)) {
    for (const [setNumberStr, values] of Object.entries(bySet)) {
      flatLogsForSummary.push({
        workout_exercise_id: workoutExerciseId,
        set_number: Number(setNumberStr),
        load: values.load,
        reps: values.reps,
      });
    }
  }

  function renderExercise(we: WorkoutExerciseWithDetails) {
    return (
      <ExerciseBlock
        key={we.id}
        clientId={clientId}
        sessionId={session.id}
        weekNumber={session.week_number}
        we={we}
        loggedSets={loggedSets[we.id] ?? {}}
        previousSets={previousPerformance[we.id]}
        disabled={paused}
        onSetLogged={(setNumber, load, reps) =>
          setLoggedSets((prev) => ({
            ...prev,
            [we.id]: { ...(prev[we.id] ?? {}), [setNumber]: { load, reps } },
          }))
        }
        onRestStart={(seconds, label) =>
          setRestTimer({ key: `${we.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`, seconds, label })
        }
      />
    );
  }

  if (completedSummary) {
    return (
      <SessionSummaryScreen
        dayName={day?.name ?? "Treino"}
        summary={completedSummary}
        studentNote={note.trim() || null}
      />
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            {paused ? "Treino pausado" : "Treino em andamento"}
          </span>
          <h2 className="break-words font-display text-2xl text-ink">{day?.name ?? "Sessão de treino"}</h2>
          <p className="text-sm text-ink-muted">
            {formatDuration(elapsedSec)}
            {progress.total > 0 && ` · ${progress.done}/${progress.total} séries`}
          </p>
        </div>

        {paused ? (
          <ResumeButton
            sessionId={session.id}
            clientId={clientId}
            onSuccess={() => {
              const addedSec = pausedAt
                ? Math.max(0, Math.round((Date.now() - new Date(pausedAt).getTime()) / 1000))
                : 0;
              setPausedTotalSec((s) => s + addedSec);
              setPausedAt(null);
              setStatus("in_progress");
            }}
          />
        ) : (
          <PauseButton
            sessionId={session.id}
            clientId={clientId}
            onSuccess={() => {
              setPausedAt(new Date().toISOString());
              setStatus("paused");
            }}
          />
        )}
      </header>

      {progress.total > 0 && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-label="Progresso da sessão"
          className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress.pct}%` }} />
        </div>
      )}

      {restTimer && (
        <RestTimer
          key={restTimer.key}
          seconds={restTimer.seconds}
          label={restTimer.label}
          onDismiss={() => setRestTimer(null)}
        />
      )}

      {!day ? (
        <p className={`${CARD} p-4 text-sm text-ink-muted`}>
          O treino mudou desde que esta sessão começou (seu coach publicou uma nova versão) — não
          é mais possível mostrar os exercícios dela. Finalize para liberar o treino atual.
        </p>
      ) : paused ? (
        <p className="text-sm text-ink-muted">Retome o treino para continuar registrando as séries.</p>
      ) : blocks.length === 0 ? (
        <p className="text-sm text-ink-muted">Este dia não tem exercícios.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {blocks.map((block, blockIndex) =>
            block.kind === "single" ? (
              <li key={block.item.id}>{renderExercise(block.item)}</li>
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
                    <li key={we.id}>{renderExercise(we)}</li>
                  ))}
                </ul>
              </li>
            )
          )}
        </ul>
      )}

      <FinishForm
        sessionId={session.id}
        clientId={clientId}
        exercises={exercises}
        loggedLogs={flatLogsForSummary}
        elapsedSec={elapsedSec}
        note={note}
        onNoteChange={setNote}
        onFinished={setCompletedSummary}
      />
    </section>
  );
}

function PauseButton({
  sessionId,
  clientId,
  onSuccess,
}: {
  sessionId: string;
  clientId: string;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(pauseSessionAction, initialState);

  useEffect(() => {
    if (state?.success) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" disabled={pending} className={BUTTON_GHOST}>
        {pending ? "Pausando…" : "Pausar treino"}
      </button>
      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}
    </form>
  );
}

function ResumeButton({
  sessionId,
  clientId,
  onSuccess,
}: {
  sessionId: string;
  clientId: string;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(resumeSessionAction, initialState);

  useEffect(() => {
    if (state?.success) onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="clientId" value={clientId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Retomando…" : "Continuar treino"}
      </button>
      {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}
    </form>
  );
}

function FinishForm({
  sessionId,
  clientId,
  exercises,
  loggedLogs,
  elapsedSec,
  note,
  onNoteChange,
  onFinished,
}: {
  sessionId: string;
  clientId: string;
  exercises: WorkoutExerciseWithDetails[];
  loggedLogs: SummaryLogLike[];
  elapsedSec: number;
  note: string;
  onNoteChange: (note: string) => void;
  onFinished: (summary: SessionSummary) => void;
}) {
  const [state, action, pending] = useActionState(completeSessionAction, initialState);
  const summaryInputRef = useRef<HTMLInputElement>(null);
  const lastSummary = useRef<SessionSummary | null>(null);

  useEffect(() => {
    if (state?.success && lastSummary.current) {
      onFinished(lastSummary.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <form
        action={action}
        onSubmit={() => {
          const summary = buildSessionSummary(exercises, loggedLogs, elapsedSec);
          lastSummary.current = summary;
          if (summaryInputRef.current) summaryInputRef.current.value = JSON.stringify(summary);
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="clientId" value={clientId} />
        <input ref={summaryInputRef} type="hidden" name="summary" defaultValue="{}" />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-ink-muted">Notas sobre o treino (opcional)</span>
          <textarea
            name="studentNote"
            rows={2}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Como você se sentiu, dor, dificuldade..."
            className="min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </label>

        {state?.error && <p className="text-xs text-coral-text">{state.error}</p>}

        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Finalizando…" : "Finalizar treino"}
        </button>
      </form>
    </div>
  );
}
