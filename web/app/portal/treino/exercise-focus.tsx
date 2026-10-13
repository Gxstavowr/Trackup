"use client";

import { useState } from "react";
import type { WorkoutExerciseWithDetails, WorkoutSetLog } from "@/lib/repository";
import { formatPrescription } from "@/lib/workout-format";
import { blockTypeLabel, groupKindLabel } from "@/lib/workout-builder";
import { setNumbersFor } from "@/lib/workout-session";
import { formatSetTargetShort, hasSetVariation, resolveSetTarget } from "@/lib/workout-prescription";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";

/** Série já registrada nesta sessão. */
export type LoggedSet = { load: number | null; reps: number | null; rir: number | null; exerciseId: string };
export type LoggedSetsByNumber = Record<number, LoggedSet>;
export type SetValues = { load: number | null; reps: number | null; rir: number | null };

export type GroupInfo = { kind: string; key: string; pos: number; size: number };

export function isCardioOnly(we: WorkoutExerciseWithDetails): boolean {
  return we.block_type === "cardio" && we.reps == null && we.reps_min == null && we.reps_max == null;
}

const fmtKg = (n: number) => `${String(n).replace(".", ",")} kg`;

function formatSetShort(load: number | null, reps: number | null): string {
  if (load == null && reps == null) return "—";
  if (load == null) return `${reps} reps`;
  return `${fmtKg(load)} × ${reps != null ? reps : "—"}`;
}

/** Texto de desempenho anterior; null quando não há valor útil (sem carga e sem reps). */
function previousText(p: { load: number | null; reps: number | null }): string | null {
  if (p.load == null && p.reps == null) return null;
  return formatSetShort(p.load, p.reps);
}

/**
 * O exercício em foco (V2 tarefa 20): tudo o que o aluno precisa do exercício atual numa tela
 * curta — prescrição, observação do coach, última vez, instrução/vídeo, substituto, séries
 * (concluídas ficam compactas, só a atual abre) e a ação principal "Concluir série".
 */
export default function ExerciseFocus({
  we,
  index,
  total,
  group,
  loggedSets,
  previousSets,
  substituteId,
  onSubstituteChange,
  note,
  onNoteChange,
  onNoteCommit,
  onLogSet,
  popSet,
  onPrev,
  onNext,
}: {
  we: WorkoutExerciseWithDetails;
  index: number;
  total: number;
  group: GroupInfo | null;
  loggedSets: LoggedSetsByNumber;
  previousSets: WorkoutSetLog[] | undefined;
  /** Id do substituto escolhido; `null` = exercício prescrito. */
  substituteId: string | null;
  onSubstituteChange: (substituteId: string | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onNoteCommit: () => void;
  onLogSet: (setNumber: number, values: SetValues) => Promise<string | null>;
  popSet: number | null;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const cardioOnly = isCardioOnly(we);
  const chosenSub = substituteId ? (we.substitutes.find((s) => s.id === substituteId) ?? null) : null;
  const active = chosenSub ?? we.exercise;
  const varies = hasSetVariation(we);
  const setNumbers = setNumbersFor(we);
  const firstUndone = setNumbers.find((n) => !loggedSets[n]) ?? null;
  const activeSet = editing ?? firstUndone;
  const doneNumbers = setNumbers.filter((n) => loggedSets[n] && n !== activeSet);
  const pendingNumbers = setNumbers.filter((n) => !loggedSets[n] && n !== activeSet);
  const prescription = formatPrescription(we);
  const unitLabel = cardioOnly ? "Cardio" : "Série";

  const lastLogged = [...setNumbers].reverse().find((n) => loggedSets[n]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-label text-ink-faint">
            Exercício {index + 1} de {total}
          </span>
          {group && (
            <Badge tone="accent">
              {groupKindLabel(group.kind as "superset" | "circuit")} {group.key} · {group.pos}/{group.size}
            </Badge>
          )}
          {we.block_type !== "normal" && <Badge tone="warning">{blockTypeLabel(we.block_type)}</Badge>}
        </div>
        <h2 className="break-words font-display text-[1.75rem] font-bold leading-tight text-ink">{active.name}</h2>
        {chosenSub && <p className="text-xs text-ink-faint">Substituindo {we.exercise.name}</p>}
        {prescription.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Prescrição do coach">
            {prescription.map((p, i) => (
              <li
                key={i}
                className={`rounded-full px-3 py-1 text-sm tabular-nums ${
                  i === 0 ? "bg-brand-tint font-semibold text-brand" : "bg-surface-raised text-ink-muted"
                }`}
              >
                {p}
              </li>
            ))}
          </ul>
        )}
        {we.notes && (
          <p className="break-words rounded-md border-l-2 border-brand bg-surface-raised px-3 py-2 text-sm text-ink-muted">
            <span className="t-label mb-0.5 block text-ink-faint">Do seu coach</span>
            {we.notes}
          </p>
        )}
      </div>

      {we.substitutes.length > 0 && (
        <div role="group" aria-label="Exercício ou substituto" className="grid grid-cols-2 gap-1 rounded-md bg-surface-sunken p-1">
          {[
            { id: null as string | null, label: "Prescrito", name: we.exercise.name },
            ...we.substitutes.map((s, i) => ({
              id: s.id as string | null,
              label: we.substitutes.length > 1 ? `Substituto ${i + 1}` : "Substituto",
              name: s.name,
            })),
          ].map((opt) => {
            const selected = (chosenSub?.id ?? null) === opt.id;
            return (
              <button
                key={opt.id ?? "prescrito"}
                type="button"
                aria-pressed={selected}
                onClick={() => onSubstituteChange(opt.id)}
                className={`flex min-h-12 min-w-0 flex-col items-start rounded-sm px-3 py-1.5 text-left transition-colors ${
                  selected ? "bg-brand-tint ring-1 ring-brand" : "hover:bg-surface-raised"
                }`}
              >
                <span className={`t-label ${selected ? "text-brand" : "text-ink-faint"}`}>{opt.label}</span>
                <span className="w-full break-words text-xs text-ink">{opt.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {(() => {
        const texts = (previousSets ?? []).map(previousText).filter((t): t is string => t != null);
        if (texts.length === 0) return null;
        return (
          <p className="text-sm text-ink-muted">
            <span className="t-label mr-2 text-ink-faint">Última vez</span>
            <span className="tabular-nums">{texts.join("  ·  ")}</span>
          </p>
        );
      })()}

      {(active.instruction || active.video_url) && (
        <details className="group rounded-md border border-line bg-surface-sunken/60 px-3 py-2 text-sm">
          <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-ink-muted marker:hidden">
            Como fazer{active.video_url ? " · vídeo" : ""}
            <span aria-hidden className="inline-flex rotate-90 group-open:-rotate-90"><Icon name="chevron" size={16} /></span>
          </summary>
          {active.instruction && <p className="mt-1 whitespace-pre-line break-words text-ink-muted">{active.instruction}</p>}
          {active.video_url && (
            <a
              href={active.video_url}
              target="_blank"
              rel="noreferrer noopener"
              className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-2`}
            >
              Ver vídeo do exercício
            </a>
          )}
        </details>
      )}

      {(doneNumbers.length > 0 || pendingNumbers.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Séries">
          {doneNumbers.map((n) => {
            const l = loggedSets[n];
            return (
              <button
                key={n}
                type="button"
                onClick={() => setEditing(n)}
                aria-label={`${n}ª ${unitLabel.toLowerCase()} concluída: ${cardioOnly ? "concluído" : formatSetShort(l.load, l.reps)}. Toque para editar.`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-success/40 bg-success-tint px-3 text-sm tabular-nums text-success"
              >
                <span aria-hidden className={popSet === n ? "tk-pop inline-flex" : "inline-flex"}>
                  <Icon name="check" size={14} />
                </span>
                {n}ª{!cardioOnly && <span className="text-ink">{formatSetShort(l.load, l.reps)}</span>}
              </button>
            );
          })}
          {pendingNumbers.map((n) => (
            <span
              key={n}
              className="inline-flex min-h-10 items-center rounded-full border border-dashed border-line-strong px-3 text-sm tabular-nums text-ink-faint"
            >
              {n}ª
              {varies && !cardioOnly && <span className="ml-1">{formatSetTargetShort(resolveSetTarget(we, n))}</span>}
            </span>
          ))}
        </div>
      )}

      {activeSet != null ? (
        <SetEntry
          key={`${we.id}-${activeSet}-${chosenSub?.id ?? "p"}-${editing != null ? "e" : "n"}`}
          we={we}
          setNumber={activeSet}
          showTarget={varies}
          cardioOnly={cardioOnly}
          showRir={we.block_type !== "cardio"}
          editingExisting={editing != null}
          initial={loggedSets[activeSet] ?? (lastLogged != null ? loggedSets[lastLogged] : undefined)}
          alreadyLogged={!!loggedSets[activeSet]}
          previous={previousSets?.find((p) => p.set_number === activeSet) ?? null}
          totalSets={setNumbers.length}
          onCancelEdit={() => setEditing(null)}
          onLog={async (values) => {
            const err = await onLogSet(activeSet, values);
            if (!err) setEditing(null);
            return err;
          }}
        />
      ) : (
        <p className="flex items-center gap-2 rounded-md bg-success-tint px-3 py-3 text-sm font-medium text-success">
          <Icon name="check" size={18} />
          {cardioOnly ? "Cardio concluído" : "Todas as séries deste exercício concluídas"}
        </p>
      )}

      <details className="group rounded-md border border-line bg-surface-sunken/60 px-3 py-2" open={note.trim() !== "" ? true : undefined}>
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between text-sm text-ink-muted marker:hidden">
          Nota do exercício{note.trim() ? " ✓" : ""}
          <span aria-hidden className="inline-flex rotate-90 group-open:-rotate-90"><Icon name="chevron" size={16} /></span>
        </summary>
        <label className="mt-2 flex flex-col gap-1.5 text-sm">
          <span className="sr-only">Nota sobre {active.name}</span>
          <textarea
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={onNoteCommit}
            placeholder="Dor, ajuste de carga, como foi…"
            className="min-h-16 w-full rounded-md border border-line-control bg-surface-sunken px-3 py-2 text-base text-ink outline-none placeholder:text-ink-faint focus:border-brand focus-visible:shadow-[var(--focus-ring)]"
          />
          {lastLogged == null && <span className="text-xs text-ink-faint">Salva junto com a primeira série.</span>}
        </label>
      </details>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onPrev} disabled={!onPrev} className={buttonClass({ variant: "tertiary", size: "sm" })}>
          ‹ Anterior
        </button>
        <button type="button" onClick={onNext} disabled={!onNext} className={buttonClass({ variant: "tertiary", size: "sm" })}>
          Próximo ›
        </button>
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max,
  inputMode,
  placeholder,
  unit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min?: number;
  max?: number;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
  unit?: string;
}) {
  function bump(delta: number) {
    const base = value.trim() === "" ? Number(placeholder ?? 0) || 0 : Number(value) || 0;
    let next = Math.round((base + delta) * 100) / 100;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    onChange(String(next));
  }
  const btn =
    "flex size-14 shrink-0 items-center justify-center rounded-md border border-line-strong text-2xl text-ink transition-colors hover:border-brand active:bg-brand-tint";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="t-label text-ink-faint">
        {label}
        {unit ? ` (${unit})` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => bump(-step)} aria-label={`Diminuir ${label.toLowerCase()}`} className={btn}>
          −
        </button>
        <input
          type="number"
          inputMode={inputMode}
          step="any"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-14 w-full min-w-0 rounded-md border border-line-control bg-surface-sunken px-1 text-center font-display text-3xl font-bold tabular-nums text-ink outline-none placeholder:text-ink-faint focus:border-brand focus-visible:shadow-[var(--focus-ring)]"
        />
        <button type="button" onClick={() => bump(step)} aria-label={`Aumentar ${label.toLowerCase()}`} className={btn}>
          +
        </button>
      </div>
    </div>
  );
}

function SetEntry({
  we,
  setNumber,
  showTarget,
  cardioOnly,
  showRir,
  editingExisting,
  initial,
  alreadyLogged,
  previous,
  totalSets,
  onCancelEdit,
  onLog,
}: {
  we: WorkoutExerciseWithDetails;
  setNumber: number;
  /** O coach variou a prescrição por série: mostra o alvo desta série. */
  showTarget: boolean;
  cardioOnly: boolean;
  showRir: boolean;
  editingExisting: boolean;
  initial: LoggedSet | undefined;
  alreadyLogged: boolean;
  previous: WorkoutSetLog | null;
  totalSets: number;
  onCancelEdit: () => void;
  onLog: (values: SetValues) => Promise<string | null>;
}) {
  // Alvo desta série: override por série do coach (0020) ou, sem ele, a prescrição uniforme.
  const target = resolveSetTarget(we, setNumber);
  const startLoad = initial?.load ?? previous?.load ?? target.load ?? null;
  const startReps = initial?.reps ?? previous?.reps ?? target.repsMax ?? target.repsMin ?? null;
  const [load, setLoad] = useState(startLoad != null ? String(startLoad) : "");
  const [reps, setReps] = useState(startReps != null ? String(startReps) : "");
  const [rir, setRir] = useState<number | null>(alreadyLogged ? (initial?.rir ?? null) : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const err = await onLog({
        load: cardioOnly || load.trim() === "" ? null : Number(load),
        reps: cardioOnly || reps.trim() === "" ? null : Number(reps),
        rir: cardioOnly ? null : rir,
      });
      if (err) setError(err);
    } catch {
      setError("Falha de conexão. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  const label = cardioOnly ? "Concluir cardio" : editingExisting ? "Salvar série" : "Concluir série";

  return (
    <section aria-label={`${setNumber}ª série`} className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-ink">
          {cardioOnly ? "Cardio" : `Série ${setNumber} de ${totalSets}`}
        </h3>
        {previous && !cardioOnly && previousText(previous) && (
          <span className="text-xs tabular-nums text-ink-faint">Antes: {previousText(previous)}</span>
        )}
      </div>
      {showTarget && !cardioOnly && (
        <p className="-mt-1 text-sm tabular-nums text-ink-muted">
          <span className="t-label mr-2 text-ink-faint">Alvo</span>
          <span className="font-semibold text-brand">{formatSetTargetShort(target)}</span>
          {target.restSec != null && <span> · descanso {target.restSec} s</span>}
        </p>
      )}

      {cardioOnly ? (
        <p className="text-sm text-ink-muted">
          Faça o cardio prescrito
          {we.duration_sec != null && (
            <>
              {" — "}
              <span className="font-semibold text-ink">
                {we.duration_sec % 60 === 0 ? `${we.duration_sec / 60} min` : `${we.duration_sec} s`}
              </span>
            </>
          )}
          {" — e marque quando terminar."}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <Stepper
              label="Carga"
              unit="kg"
              value={load}
              onChange={setLoad}
              step={2.5}
              inputMode="decimal"
              placeholder={previous?.load != null ? String(previous.load) : undefined}
            />
            <Stepper
              label="Reps"
              value={reps}
              onChange={setReps}
              step={1}
              inputMode="numeric"
              placeholder={previous?.reps != null ? String(previous.reps) : undefined}
            />
          </div>

          {showRir && (
            <div className="flex flex-col gap-1.5">
              <span className="t-label text-ink-faint">
                RIR percebido (opcional){target.rir != null ? ` · alvo ${target.rir}` : ""}
              </span>
              <div role="group" aria-label="RIR percebido" className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={rir === v}
                    onClick={() => setRir(rir === v ? null : v)}
                    className={`flex min-h-11 flex-1 items-center justify-center rounded-md border text-base font-semibold tabular-nums transition-colors ${
                      rir === v ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted hover:border-line-strong"
                    }`}
                  >
                    {v === 4 ? "4+" : v}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className={buttonClass({ variant: "primary", size: "lg", width: "full", className: "min-h-14 text-lg" })}
      >
        {pending ? "Salvando…" : label}
      </button>
      {editingExisting && (
        <button type="button" onClick={onCancelEdit} className={buttonClass({ variant: "tertiary", size: "sm", width: "full" })}>
          Cancelar edição
        </button>
      )}
    </section>
  );
}
