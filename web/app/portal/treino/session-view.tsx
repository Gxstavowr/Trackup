"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { WorkoutDayWithExercises, WorkoutExerciseWithDetails, WorkoutSession, WorkoutSetLog } from "@/lib/repository";
import { formatPrescription } from "@/lib/workout-format";
import { groupDayExercises, groupKindLabel } from "@/lib/workout-builder";
import {
  buildHighlights,
  buildSessionSummary,
  computeClockOffsetMs,
  computeElapsedSeconds,
  computeSessionProgress,
  firstIncompleteIndex,
  formatElapsedClock,
  isExerciseDone,
  nextAfterSet,
  restSecondsForRound,
  setKey,
  setNumbersFor,
  type Highlight,
  type SessionSummary,
  type SetKey,
  type SummaryLogLike,
} from "@/lib/workout-session";
import { cardioSummary, completionFlash, exerciseSegments, type CompletionFlash } from "@/lib/workout-session-ui";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { CompletionMark } from "@/components/ui/completion-mark";
import { CARD } from "../portal-ui";
import {
  completeSessionAction,
  logSetAction,
  pauseSessionAction,
  resumeSessionAction,
} from "./actions";
import ExerciseFocus, { isCardioOnly, type GroupInfo, type LoggedSetsByNumber, type SetValues } from "./exercise-focus";
import RestTimer from "./rest-timer";
import { REST_ADD_MS, restReducer } from "./rest-timer-state";
import SessionSummaryScreen from "./session-summary";

type LoggedByExercise = Record<string, LoggedSetsByNumber>;

function fd(values: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v == null ? "" : String(v));
  return f;
}

/**
 * A sessão de treino em execução (V2 tarefa 20): um exercício por vez em foco (com lista de
 * todos disponível), progresso claro, timer de descanso automático, pausa/retomada, notas por
 * exercício e resumo final. O estado das séries é otimista: cada série vai ao servidor
 * (`logSetAction`, upsert por sessão+prescrição+série) e, no sucesso, atualiza o estado local.
 * O exercício em foco ao reabrir é derivado das séries já gravadas (primeiro com pendência).
 *
 * `day === null`: o coach republicou o plano no meio da sessão — ela ainda pode ser finalizada.
 */
export default function SessionView({
  clientId,
  session,
  day,
  initialLogs,
  previousPerformance,
  serverNow,
}: {
  clientId: string;
  session: WorkoutSession;
  day: WorkoutDayWithExercises | null;
  initialLogs: WorkoutSetLog[];
  previousPerformance: Record<string, WorkoutSetLog[]>;
  /** "Agora" do servidor na renderização — corrige relógio do aparelho desajustado. */
  serverNow: string;
}) {
  const [clockOffsetMs] = useState(() => computeClockOffsetMs(serverNow, Date.now()));
  const flat = [...(day?.exercises ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const [status, setStatus] = useState(session.status);
  const [pausedAt, setPausedAt] = useState<string | null>(session.paused_at);
  const [pausedTotalSec, setPausedTotalSec] = useState(session.paused_total_sec);
  const [sessionNote, setSessionNote] = useState(session.student_note ?? "");
  // Descanso: um único estado (ver rest-timer-state.ts) — pausar nunca descarta o restante.
  const [rest, dispatchRest] = useReducer(restReducer, null);
  const [view, setView] = useState<"focus" | "list">("focus");
  const [completed, setCompleted] = useState<{ summary: SessionSummary; highlights: Highlight[] } | null>(null);
  const [popped, setPopped] = useState<{ weId: string; set: number } | null>(null);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  // Feedback discreto ao concluir série/exercício (some sozinho; só texto + aria-live).
  const [flash, setFlash] = useState<CompletionFlash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(id);
  }, [flash]);

  const [logged, setLogged] = useState<LoggedByExercise>(() => {
    const map: LoggedByExercise = {};
    for (const log of initialLogs) {
      if (!log.workout_exercise_id || log.set_number == null) continue;
      const bucket = map[log.workout_exercise_id] ?? {};
      bucket[log.set_number] = { load: log.load, reps: log.reps, rir: log.perceived_rir, exerciseId: log.exercise_id };
      map[log.workout_exercise_id] = bucket;
    }
    return map;
  });
  // Substituto escolhido por exercício (id do exercício substituto; ausente = o prescrito). Ao
  // retomar, infere das séries já gravadas: todas com o mesmo substituto -> ele segue escolhido.
  const [substituteOn, setSubstituteOn] = useState<Record<string, string | null>>(() => {
    const map: Record<string, string | null> = {};
    for (const we of day?.exercises ?? []) {
      if (we.substitutes.length === 0) continue;
      const used = Object.values(logged_init(initialLogs, we.id));
      const first = used[0]?.exerciseId;
      if (
        first &&
        first !== we.exercise_id &&
        used.every((l) => l.exerciseId === first) &&
        we.substitutes.some((s) => s.id === first)
      ) {
        map[we.id] = first;
      }
    }
    return map;
  });
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    const sorted = [...initialLogs].sort((a, b) => a.completed_at.localeCompare(b.completed_at));
    for (const log of sorted) {
      if (log.workout_exercise_id && log.student_note) map[log.workout_exercise_id] = log.student_note;
    }
    return map;
  });
  const savedNotes = useRef<Record<string, string>>({ ...notes });

  const doneKeys = new Set<SetKey>();
  for (const [weId, bySet] of Object.entries(logged)) {
    for (const n of Object.keys(bySet)) doneKeys.add(setKey(weId, Number(n)));
  }
  const progress = computeSessionProgress(flat, doneKeys);
  const cardio = cardioSummary(flat);
  const exercisesDone = flat.filter((ex) => isExerciseDone(ex, doneKeys)).length;
  const allDone = flat.length > 0 && progress.done === progress.total;

  const [idx, setIdx] = useState(() => firstIncompleteIndex(flat, doneKeys) ?? 0);
  const safeIdx = Math.min(idx, Math.max(0, flat.length - 1));
  const segments = exerciseSegments(flat, doneKeys, safeIdx);
  const paused = status === "paused";
  // Direção da última troca de exercício (V5): o novo entra pelo lado para onde o aluno navegou.
  const [shownIdx, setShownIdx] = useState(safeIdx);
  const [slideDir, setSlideDir] = useState<"next" | "prev" | null>(null);
  if (shownIdx !== safeIdx) {
    setShownIdx(safeIdx);
    setSlideDir(safeIdx > shownIdx ? "next" : "prev");
  }

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [safeIdx, view, paused]);

  const getElapsed = () =>
    computeElapsedSeconds({
      started_at: session.started_at,
      paused_at: pausedAt,
      paused_total_sec: pausedTotalSec,
      ended_at: null,
    }, new Date(Date.now() + clockOffsetMs));

  function groupInfoFor(i: number): GroupInfo | null {
    const we = flat[i];
    if (!we?.group_key || !we.group_kind) return null;
    const same = (o: WorkoutExerciseWithDetails | undefined) =>
      !!o && o.group_key === we.group_key && o.group_kind === we.group_kind;
    let start = i;
    let end = i;
    while (same(flat[start - 1])) start--;
    while (same(flat[end + 1])) end++;
    return { kind: we.group_kind, key: we.group_key, pos: i - start + 1, size: end - start + 1 };
  }

  /**
   * Descanso configurado pelo coach a usar depois da série `setNumber` do exercício `i` — o da
   * própria série quando o coach variou por série, senão o `rest_sec` uniforme. Superset/
   * circuito: o descanso só acontece ao fechar a rodada, então vale o maior descanso configurado
   * no bloco para aquela série — o coach pode ter preenchido só um dos membros.
   */
  function restSecondsAfter(i: number, setNumber: number): number | null {
    const g = groupInfoFor(i);
    if (!g) return flat[i] ? restSecondsForRound([flat[i]], setNumber) : null;
    const start = i - g.pos + 1;
    return restSecondsForRound(flat.slice(start, start + g.size), setNumber);
  }

  function activeExerciseOf(we: WorkoutExerciseWithDetails) {
    const chosen = substituteOn[we.id];
    return (chosen && we.substitutes.find((s) => s.id === chosen)) || we.exercise;
  }

  async function logSet(i: number, setNumber: number, v: SetValues): Promise<string | null> {
    const we = flat[i];
    const exercise = activeExerciseOf(we);
    const res = await logSetAction(
      null,
      fd({
        clientId,
        sessionId: session.id,
        workoutExerciseId: we.id,
        exerciseId: exercise.id,
        setNumber,
        weekNumber: session.week_number,
        load: v.load,
        reps: v.reps,
        perceivedRir: v.rir,
        studentNote: notes[we.id] ?? "",
      })
    );
    if (res?.error) return res.error;

    savedNotes.current[we.id] = notes[we.id] ?? "";
    const next: LoggedByExercise = {
      ...logged,
      [we.id]: { ...(logged[we.id] ?? {}), [setNumber]: { ...v, exerciseId: exercise.id } },
    };
    setLogged(next);
    setPopped({ weId: we.id, set: setNumber });

    const keys = new Set<SetKey>();
    for (const [weId, bySet] of Object.entries(next)) for (const n of Object.keys(bySet)) keys.add(setKey(weId, Number(n)));
    const { next: nextIdx, rest: wantsRest } = nextAfterSet(flat, i, keys);
    if (nextIdx != null) setIdx(nextIdx);
    setFlash(
      completionFlash({
        flat: flat.map((f) => ({ id: f.id, sets: f.sets, block_type: f.block_type, name: activeExerciseOf(f).name })),
        idx: i,
        setNumber,
        doneBefore: doneKeys,
        doneAfter: keys,
        nextIdx,
      })
    );

    const restSec = restSecondsAfter(i, setNumber);
    if (wantsRest && nextIdx != null && restSec != null && restSec > 0) {
      const target = flat[nextIdx];
      const nextSet = setNumbersFor(target).find((n) => !keys.has(setKey(target.id, n)));
      const now = Date.now();
      dispatchRest({
        type: "start",
        now,
        key: `${we.id}-${setNumber}-${now}`,
        seconds: restSec,
        label:
          nextIdx === i
            ? `Próxima: série ${nextSet} de ${activeExerciseOf(target).name}`
            : `Próximo: ${activeExerciseOf(target).name}`,
      });
    } else if (nextIdx == null) {
      dispatchRest({ type: "skip" });
    }
    return null;
  }

  /** Salva a nota do exercício reaproveitando a última série registrada (upsert idempotente). */
  async function commitNote(i: number) {
    const we = flat[i];
    const text = notes[we.id] ?? "";
    if (text === (savedNotes.current[we.id] ?? "")) return;
    const bySet = logged[we.id];
    if (!bySet) return; // sem série ainda: a nota vai junto com a primeira
    const last = Math.max(...Object.keys(bySet).map(Number));
    const l = bySet[last];
    const res = await logSetAction(
      null,
      fd({
        clientId,
        sessionId: session.id,
        workoutExerciseId: we.id,
        exerciseId: l.exerciseId,
        setNumber: last,
        weekNumber: session.week_number,
        load: l.load,
        reps: l.reps,
        perceivedRir: l.rir,
        studentNote: text,
      })
    );
    if (!res?.error) savedNotes.current[we.id] = text;
  }

  async function pause() {
    setPauseBusy(true);
    setPauseError(null);
    const res = await pauseSessionAction(null, fd({ sessionId: session.id, clientId }));
    setPauseBusy(false);
    if (res?.error) return setPauseError(res.error);
    // Congela o descanso (não descarta): retomar o treino devolve o mesmo tempo restante.
    dispatchRest({ type: "sessionPause", now: Date.now() });
    setPausedAt(new Date().toISOString());
    setStatus("paused");
  }

  async function resume() {
    setPauseBusy(true);
    setPauseError(null);
    const res = await resumeSessionAction(null, fd({ sessionId: session.id, clientId }));
    setPauseBusy(false);
    if (res?.error) return setPauseError(res.error);
    const added = pausedAt ? Math.max(0, Math.round((Date.now() - new Date(pausedAt).getTime()) / 1000)) : 0;
    setPausedTotalSec((s) => s + added);
    setPausedAt(null);
    setStatus("in_progress");
    dispatchRest({ type: "sessionResume", now: Date.now() });
  }

  async function finish(): Promise<string | null> {
    const flatLogs: SummaryLogLike[] = [];
    for (const [weId, bySet] of Object.entries(logged)) {
      for (const [n, v] of Object.entries(bySet)) {
        flatLogs.push({ workout_exercise_id: weId, set_number: Number(n), load: v.load, reps: v.reps });
      }
    }
    const summary = buildSessionSummary(flat, flatLogs, getElapsed());
    const res = await completeSessionAction(
      null,
      fd({ sessionId: session.id, clientId, studentNote: sessionNote, summary: JSON.stringify(summary) })
    );
    if (res?.error) return res.error;

    const highlights = buildHighlights(
      flat.map((we) => {
        const sets = Object.values(logged[we.id] ?? {});
        const usedSub = sets.length > 0 && sets.every((s) => s.exerciseId !== we.exercise_id);
        const subName = usedSub ? we.substitutes.find((s) => s.id === sets[0].exerciseId)?.name : undefined;
        return {
          name: subName ?? we.exercise.name,
          // Trocar para o substituto quebra a comparação com a última vez.
          current: usedSub ? [] : sets,
          previous: previousPerformance[we.id] ?? [],
        };
      })
    ).slice(0, 4);
    setCompleted({ summary, highlights });
    return null;
  }

  if (completed) {
    return (
      <SessionSummaryScreen
        dayName={day?.name ?? "Treino"}
        summary={completed.summary}
        studentNote={sessionNote.trim() || null}
        highlights={completed.highlights}
      />
    );
  }

  const current = flat[safeIdx];

  return (
    <section className="flex flex-col gap-4">
      {/* Feedback de série/exercício: fixo logo acima da navegação, onde o aluno está olhando. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--portal-nav-h,4.5rem)+env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center px-4"
      >
        {flash && (
          <p
            key={flash.text}
            className={`tk-enter rounded-full border px-4 py-2 text-sm font-medium shadow-[var(--surface-raised-shadow)] ${
              flash.kind === "set" ? "border-line-strong bg-surface-raised text-ink" : "border-success/60 bg-success-tint text-success"
            }`}
          >
            {flash.text}
          </p>
        )}
      </div>
      <header className="flex flex-col gap-3">
        {/* Status + cronômetro numa linha própria, acima dos botões, para nunca quebrar. */}
        <span className="t-label block whitespace-nowrap text-ink-faint">
          {paused ? "Treino pausado" : "Em andamento"} ·{" "}
          <Elapsed
            startedAt={session.started_at}
            pausedAt={pausedAt}
            pausedTotalSec={pausedTotalSec}
            clockOffsetMs={clockOffsetMs}
          />
        </span>
        <div className="-mt-1.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words font-display text-2xl font-bold text-ink">{day?.name ?? "Sessão de treino"}</h1>
          </div>
          {!paused && flat.length > 0 && (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setView(view === "list" ? "focus" : "list")}
                aria-pressed={view === "list"}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {view === "list" ? "Em foco" : "Ver todos"}
              </button>
              <button type="button" onClick={pause} disabled={pauseBusy} className={buttonClass({ variant: "tertiary", size: "sm" })}>
                {pauseBusy ? "…" : "Pausar"}
              </button>
            </div>
          )}
        </div>

        {progress.total > 0 && (
          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-valuetext={`${progress.done} de ${progress.total} séries concluídas`}
              aria-label="Progresso do treino"
              className="h-2.5 overflow-hidden rounded-full bg-surface-raised"
            >
              <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${progress.pct}%` }} />
            </div>
            {segments.length > 1 && (
              <ol aria-hidden className="flex gap-1">
                {segments.map((seg, i) => (
                  <li key={seg.id} className="min-w-0 flex-1">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => {
                        setIdx(i);
                        setView("focus");
                      }}
                      className={`block h-1.5 w-full overflow-hidden rounded-full ${seg.state === "current" ? "bg-brand/30 ring-1 ring-brand" : "bg-surface-raised"}`}
                    >
                      <span
                        className={`block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${seg.state === "done" ? "bg-success" : "bg-brand"}`}
                        style={{ width: `${seg.pct}%` }}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="flex justify-between text-xs tabular-nums text-ink-muted">
              <span>
                {progress.done}/{progress.total} séries
              </span>
              <span>
                {exercisesDone}/{flat.length} exercícios
              </span>
            </p>
          </div>
        )}
        {cardio && (
          <p className="text-xs font-medium text-ink-muted">
            <Badge tone="warning">{cardio.label}</Badge> <span className="text-ink-faint">incluído no treino de hoje</span>
          </p>
        )}
        {pauseError && (
          <p role="alert" className="text-sm text-danger-text">
            {pauseError}
          </p>
        )}
      </header>

      {rest && (
        <RestTimer
          key={rest.key}
          rest={rest}
          onPause={() => dispatchRest({ type: "pause", now: Date.now() })}
          onResume={() => dispatchRest({ type: "resume", now: Date.now() })}
          onAdd={() => dispatchRest({ type: "add", ms: REST_ADD_MS, now: Date.now() })}
          onDismiss={() => dispatchRest({ type: "skip" })}
        />
      )}

      {!day ? (
        <>
          <p className={`${CARD} p-4 text-sm text-ink-muted`}>
            O treino mudou desde que esta sessão começou (seu coach publicou uma nova versão) — não é mais possível
            mostrar os exercícios dela. Finalize para liberar o treino atual.
          </p>
          <FinishPanel note={sessionNote} onNoteChange={setSessionNote} onFinish={finish} allDone={false} />
        </>
      ) : paused ? (
        <div className={`${CARD} flex flex-col gap-3 p-5`}>
          <h2 className="font-display text-xl font-bold text-ink">Treino pausado</h2>
          <p className="text-sm text-ink-muted">
            O relógio está parado e as séries já feitas continuam salvas. Continue quando estiver pronto.
          </p>
          <button
            type="button"
            onClick={resume}
            disabled={pauseBusy}
            className={buttonClass({ variant: "primary", size: "lg", width: "full", className: "min-h-14 text-lg" })}
          >
            {pauseBusy ? "Retomando…" : "Continuar treino"}
          </button>
        </div>
      ) : flat.length === 0 ? (
        <p className="text-sm text-ink-muted">Este dia não tem exercícios.</p>
      ) : view === "list" ? (
        <>
          <OverviewList
            flat={flat}
            doneKeys={doneKeys}
            currentIdx={safeIdx}
            substituteOn={substituteOn}
            onPick={(i) => {
              setIdx(i);
              setView("focus");
            }}
          />
          <FinishPanel note={sessionNote} onNoteChange={setSessionNote} onFinish={finish} allDone={allDone} />
        </>
      ) : allDone ? (
        <div className="flex flex-col gap-4">
          <div className={`${CARD} tk-success flex flex-col gap-1 p-5`}>
            <CompletionMark size={44} soft />
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">Todas as séries feitas</h2>
            <p className="text-sm text-ink-muted">Bom trabalho. Finalize para ver o resumo do treino.</p>
          </div>
          <FinishPanel note={sessionNote} onNoteChange={setSessionNote} onFinish={finish} allDone />
          <button type="button" onClick={() => setView("list")} className={buttonClass({ variant: "tertiary", size: "sm", width: "full" })}>
            Revisar exercícios
          </button>
        </div>
      ) : (
        <div key={current.id} className={slideDir === "next" ? "tk-slide-next" : slideDir === "prev" ? "tk-slide-prev" : "tk-enter"}>
          <ExerciseFocus
            key={current.id}
            we={current}
            index={safeIdx}
            total={flat.length}
            group={groupInfoFor(safeIdx)}
            loggedSets={logged[current.id] ?? {}}
            previousSets={previousPerformance[current.id]}
            substituteId={substituteOn[current.id] ?? null}
            onSubstituteChange={(id) => setSubstituteOn((s) => ({ ...s, [current.id]: id }))}
            note={notes[current.id] ?? ""}
            onNoteChange={(text) => setNotes((n) => ({ ...n, [current.id]: text }))}
            onNoteCommit={() => commitNote(safeIdx)}
            onLogSet={(setNumber, values) => logSet(safeIdx, setNumber, values)}
            popSet={popped?.weId === current.id ? popped.set : null}
            onPrev={safeIdx > 0 ? () => setIdx(safeIdx - 1) : undefined}
            onNext={safeIdx < flat.length - 1 ? () => setIdx(safeIdx + 1) : undefined}
          />
        </div>
      )}
    </section>
  );
}

/** Séries da sessão (do estado inicial) de um exercício, para inferir o uso do substituto. */
function logged_init(logs: WorkoutSetLog[], weId: string): Record<number, { exerciseId: string }> {
  const out: Record<number, { exerciseId: string }> = {};
  for (const l of logs) if (l.workout_exercise_id === weId && l.set_number != null) out[l.set_number] = { exerciseId: l.exercise_id };
  return out;
}

function Elapsed({
  startedAt,
  pausedAt,
  pausedTotalSec,
  clockOffsetMs,
}: {
  clockOffsetMs: number;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSec: number;
}) {
  const [now, setNow] = useState(() => new Date(Date.now() + clockOffsetMs));
  useEffect(() => {
    if (pausedAt) return;
    const id = setInterval(() => setNow(new Date(Date.now() + clockOffsetMs)), 1000);
    return () => clearInterval(id);
  }, [pausedAt, clockOffsetMs]);
  const sec = computeElapsedSeconds(
    { started_at: startedAt, paused_at: pausedAt, paused_total_sec: pausedTotalSec, ended_at: null },
    now
  );
  return (
    <span className="whitespace-nowrap tabular-nums" suppressHydrationWarning>
      {formatElapsedClock(sec)}
    </span>
  );
}

function OverviewList({
  flat,
  doneKeys,
  currentIdx,
  substituteOn,
  onPick,
}: {
  flat: WorkoutExerciseWithDetails[];
  doneKeys: ReadonlySet<SetKey>;
  currentIdx: number;
  substituteOn: Record<string, string | null>;
  onPick: (i: number) => void;
}) {
  const blocks = groupDayExercises(flat);
  const indexOf = (we: WorkoutExerciseWithDetails) => flat.findIndex((f) => f.id === we.id);

  function row(we: WorkoutExerciseWithDetails) {
    const i = indexOf(we);
    const nums = setNumbersFor(we);
    const done = nums.filter((n) => doneKeys.has(setKey(we.id, n))).length;
    const complete = done === nums.length;
    const chosen = substituteOn[we.id];
    const name = (chosen && we.substitutes.find((s) => s.id === chosen)?.name) || we.exercise.name;
    const isCurrent = i === currentIdx;
    return (
      <button
        type="button"
        onClick={() => onPick(i)}
        aria-current={isCurrent ? "step" : undefined}
        className={`flex min-h-14 w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
          isCurrent ? "border-brand bg-brand-tint" : "border-line bg-surface hover:border-line-strong"
        }`}
      >
        <span
          aria-hidden
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
            complete ? "bg-success-tint text-success" : "bg-surface-raised text-ink-muted"
          }`}
        >
          {complete ? <Icon name="check" size={16} /> : i + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-ink">{name}</span>
          <span className="block text-xs tabular-nums text-ink-muted">
            {formatPrescription(we).join(" · ") || (isCardioOnly(we) ? "Cardio" : "")}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">
          {done}/{nums.length}
          <span className="sr-only"> séries</span>
        </span>
      </button>
    );
  }

  return (
    <ol className="flex flex-col gap-2" aria-label="Exercícios do treino">
      {blocks.map((block, bi) =>
        block.kind === "single" ? (
          <li key={block.item.id}>{row(block.item)}</li>
        ) : (
          <li key={`${block.groupKey}-${bi}`} className="rounded-md border border-brand/30 bg-brand-tint/40 p-2">
            <Badge tone="accent" className="mb-2">
              {groupKindLabel(block.groupKind)} {block.groupKey}
            </Badge>
            <ol className="flex flex-col gap-2">
              {block.items.map((we) => (
                <li key={we.id}>{row(we)}</li>
              ))}
            </ol>
          </li>
        )
      )}
    </ol>
  );
}

function FinishPanel({
  note,
  onNoteChange,
  onFinish,
  allDone,
}: {
  note: string;
  onNoteChange: (n: string) => void;
  onFinish: () => Promise<string | null>;
  allDone: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      const err = await onFinish();
      if (err) setError(err);
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`${CARD} flex flex-col gap-3 p-4`}>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Nota sobre o treino (opcional)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Como você se sentiu, dor, dificuldade..."
          className="min-h-16 rounded-md border border-line-control bg-surface-sunken px-3 py-2 text-base text-ink outline-none placeholder:text-ink-faint focus:border-brand focus-visible:shadow-[var(--focus-ring)]"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={buttonClass({
          variant: allDone ? "primary" : "secondary",
          size: "lg",
          width: "full",
          className: allDone ? "min-h-14 text-lg" : "",
        })}
      >
        {pending ? "Finalizando…" : allDone ? "Finalizar treino" : "Encerrar treino agora"}
      </button>
      {!allDone && <p className="text-center text-xs text-ink-faint">As séries não feitas ficam de fora do resumo.</p>}
    </div>
  );
}
