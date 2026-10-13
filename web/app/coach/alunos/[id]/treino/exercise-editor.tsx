"use client";

import { useState } from "react";
import type { Exercise, WorkoutExerciseWithDetails } from "@/lib/repository";
import type { WorkoutBlockType, WorkoutGroupKind } from "@/lib/workout-builder";
import { Drawer } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, labelClass, helperClass } from "@/components/ui/field";
import Icon from "@/components/ui/icon";
import {
  MAX_SETS_PER_EXERCISE,
  hasSetVariation,
  parseRepsText,
  repsText,
  type SetPrescription,
} from "@/lib/workout-prescription";
import { updateWorkoutExerciseAction } from "./actions";
import { toFormData, useSave } from "./workout-ui";

const LETTERS = "ABCDEFGH".split("");

const BLOCKS: { value: WorkoutBlockType; label: string }[] = [
  { value: "warmup", label: "Aquecimento" },
  { value: "normal", label: "Normal" },
  { value: "cardio", label: "Cardio" },
];

function numStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

const ICON_BTN =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** Valores digitados de uma série variada (texto cru; vazio = usa o valor uniforme). */
type SetDraft = { reps: string; load: string; rir: string; rest: string };
const EMPTY_SET: SetDraft = { reps: "", load: "", rir: "", rest: "" };

function initialSetDrafts(rows: SetPrescription[]): Record<number, SetDraft> {
  const out: Record<number, SetDraft> = {};
  for (const r of rows) {
    out[r.set_number] = {
      reps: repsText(r.reps_min, r.reps_max),
      load: numStr(r.load),
      rir: numStr(r.rir),
      rest: numStr(r.rest_sec),
    };
  }
  return out;
}

function optNum(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function segClass(active: boolean): string {
  return `min-h-11 rounded-md border px-2 text-sm font-semibold transition-colors ${
    active
      ? "border-brand bg-brand-tint text-brand"
      : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
  }`;
}

/**
 * Grade "Variar por série": RIR (0–10) fica mais estreita para sobrar largura a reps/kg/descanso,
 * gap e padding enxutos e sem as setinhas do input numérico (que comiam ~15px e cortavam "120"
 * em 390px). Cabe "8-10", "102,5" e "3600" em 375–430px sem reduzir a fonte de 16px.
 */
const SET_GRID = "grid-cols-[1.5rem_repeat(2,minmax(0,1fr))_minmax(0,0.75fr)_minmax(0,1fr)] gap-1";
const SET_CELL =
  "px-1! text-center tabular-nums [appearance:textfield] " +
  "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Drawer de edição de um exercício do dia: prescrição em seções (progressive disclosure). */
export default function ExerciseEditor({
  open,
  onClose,
  clientId,
  we,
  exercises,
  usedGroupKeys,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  we: WorkoutExerciseWithDetails;
  exercises: Exercise[];
  /** Letras de grupo já usadas no dia, por tipo (para sugerir a próxima / reaproveitar). */
  usedGroupKeys: Record<WorkoutGroupKind, string[]>;
}) {
  const { run } = useSave();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [block, setBlock] = useState<WorkoutBlockType>(we.block_type);
  const [repsMode, setRepsMode] = useState<"fixed" | "range">(
    we.reps_min != null || we.reps_max != null ? "range" : "fixed"
  );
  const [sets, setSets] = useState(numStr(we.sets));
  const [reps, setReps] = useState(numStr(we.reps));
  const [repsMin, setRepsMin] = useState(numStr(we.reps_min));
  const [repsMax, setRepsMax] = useState(numStr(we.reps_max));
  const [load, setLoad] = useState(numStr(we.suggested_load));
  const [rest, setRest] = useState(numStr(we.rest_sec));
  const [rir, setRir] = useState(numStr(we.rir));
  const [tempo, setTempo] = useState(we.tempo ?? "");
  const [durationMin, setDurationMin] = useState(
    we.duration_sec != null ? String(Math.round((we.duration_sec / 60) * 100) / 100) : ""
  );
  const [groupKind, setGroupKind] = useState<WorkoutGroupKind | "">(we.group_kind ?? "");
  const [groupKey, setGroupKey] = useState(we.group_key ?? "");
  const [substituteIds, setSubstituteIds] = useState<string[]>(() => we.substitutes.map((s) => s.id));
  const [varySets, setVarySets] = useState(() => hasSetVariation(we));
  const [setDrafts, setSetDrafts] = useState<Record<number, SetDraft>>(() => initialSetDrafts(we.set_prescriptions));
  const [notes, setNotes] = useState(we.notes ?? "");

  const isCardio = block === "cardio";

  function chooseKind(kind: WorkoutGroupKind | "") {
    setGroupKind(kind);
    if (!kind) {
      setGroupKey("");
      return;
    }
    if (!groupKey) {
      const used = new Set([...usedGroupKeys.superset, ...usedGroupKeys.circuit]);
      setGroupKey(LETTERS.find((l) => !used.has(l)) ?? "A");
    }
  }

  const keyOptions = Array.from(
    new Set([...(groupKind ? usedGroupKeys[groupKind] : []), ...(groupKey ? [groupKey] : []), ...LETTERS.slice(0, 4)])
  ).sort();

  const setCount = Math.min(Math.max(0, Math.floor(Number(sets) || 0)), MAX_SETS_PER_EXERCISE);
  const uniformRepsText = repsMode === "fixed" ? reps : repsText(optNum(repsMin), optNum(repsMax));

  function editSet(n: number, field: keyof SetDraft, value: string) {
    setSetDrafts((d) => ({ ...d, [n]: { ...(d[n] ?? EMPTY_SET), [field]: value } }));
  }

  /** Linhas por série para gravar, ou mensagem de erro de digitação. */
  function buildSetRows(): SetPrescription[] | string {
    if (!varySets || isCardio) return [];
    const rows: SetPrescription[] = [];
    for (let n = 1; n <= setCount; n++) {
      const d = setDrafts[n] ?? EMPTY_SET;
      const parsedReps = parseRepsText(d.reps);
      if (!parsedReps) return `Série ${n}: use reps como 12 ou 8-10.`;
      rows.push({
        set_number: n,
        reps_min: parsedReps.min,
        reps_max: parsedReps.max,
        load: optNum(d.load),
        rir: optNum(d.rir),
        rest_sec: optNum(d.rest),
      });
    }
    return rows;
  }

  function moveSubstitute(index: number, dir: -1 | 1) {
    setSubstituteIds((ids) => {
      const target = index + dir;
      if (target < 0 || target >= ids.length) return ids;
      const copy = ids.slice();
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  }

  async function save() {
    const setRows = buildSetRows();
    if (typeof setRows === "string") {
      setError(setRows);
      return;
    }
    setPending(true);
    setError(null);
    const seconds = durationMin.trim() ? Math.round(Number(durationMin.replace(",", ".")) * 60) : "";
    const result = await run(() =>
      updateWorkoutExerciseAction(
        null,
        toFormData({
          clientId,
          workoutExerciseId: we.id,
          exerciseId: we.exercise_id,
          block_type: block,
          group_kind: groupKind,
          group_key: groupKind ? groupKey : "",
          sets,
          reps: !isCardio && repsMode === "fixed" ? reps : "",
          reps_min: !isCardio && repsMode === "range" ? repsMin : "",
          reps_max: !isCardio && repsMode === "range" ? repsMax : "",
          suggested_load: load,
          rest_sec: rest,
          rir,
          tempo,
          duration_sec: isCardio ? seconds : "",
          vary_sets: varySets && !isCardio ? "1" : "",
          set_rows: JSON.stringify(setRows),
          substitute_ids: JSON.stringify(substituteIds),
          notes,
        })
      )
    );
    setPending(false);
    if (result?.error) setError(result.error);
    else onClose();
  }

  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (const s of we.substitutes) if (!byId.has(s.id)) byId.set(s.id, s);
  const subOptions = exercises.filter(
    (e) => e.id !== we.exercise_id && !substituteIds.includes(e.id) && !e.is_archived
  );

  return (
    <Drawer open={open} onClose={onClose} title={we.exercise.name}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="t-label text-ink-muted">Tipo de bloco</h3>
          <div role="group" aria-label="Tipo de bloco" className="grid grid-cols-3 gap-1.5">
            {BLOCKS.map((b) => (
              <button
                key={b.value}
                type="button"
                aria-pressed={block === b.value}
                onClick={() => setBlock(b.value)}
                className={segClass(block === b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="t-label text-ink-muted">{isCardio ? "Duração" : "Séries e repetições"}</h3>
          {isCardio ? (
            <div className="grid grid-cols-2 gap-3">
              <label className={labelClass}>
                <span>Duração (min)</span>
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                />
              </label>
              <label className={labelClass}>
                <span>Séries / voltas</span>
                <Input type="number" min={0} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
              </label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className={labelClass}>
                  <span>Séries</span>
                  <Input type="number" min={0} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
                </label>
                <div className={labelClass}>
                  <span>Repetições</span>
                  <div
                    role="group"
                    aria-label="Formato das repetições"
                    className="grid h-11 grid-cols-2 gap-1 rounded-md border border-line p-1"
                  >
                    {(["fixed", "range"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={repsMode === m}
                        onClick={() => setRepsMode(m)}
                        className={`rounded text-xs font-semibold ${
                          repsMode === m ? "bg-brand-tint text-brand" : "text-ink-muted hover:text-ink"
                        }`}
                      >
                        {m === "fixed" ? "Fixo" : "Faixa"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {repsMode === "fixed" ? (
                <label className={labelClass}>
                  <span>Reps por série</span>
                  <Input type="number" min={0} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>
                    <span>Mínimo</span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={repsMin}
                      onChange={(e) => setRepsMin(e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    <span>Máximo</span>
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={repsMax}
                      onChange={(e) => setRepsMax(e.target.value)}
                    />
                  </label>
                </div>
              )}

              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border border-line px-3">
                <span className="text-sm font-medium text-ink">Variar por série</span>
                <input
                  type="checkbox"
                  checked={varySets}
                  onChange={(e) => setVarySets(e.target.checked)}
                  className="size-5 accent-[var(--brand)]"
                />
              </label>
              {varySets &&
                (setCount === 0 ? (
                  <p className={helperClass}>Informe o número de séries para ajustar cada uma.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <div
                      aria-hidden
                      className={`grid ${SET_GRID} text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint`}
                    >
                      <span />
                      <span>Reps</span>
                      <span>Kg</span>
                      <span>RIR</span>
                      <span>Desc. s</span>
                    </div>
                    {Array.from({ length: setCount }, (_, i) => i + 1).map((n) => {
                      const d = setDrafts[n] ?? EMPTY_SET;
                      const cell = SET_CELL;
                      return (
                        <div key={n} className={`grid ${SET_GRID} items-center`}>
                          <span className="text-sm font-bold tabular-nums text-ink-muted">{n}ª</span>
                          <Input
                            aria-label={`Série ${n}: repetições`}
                            inputMode="text"
                            maxLength={9}
                            placeholder={uniformRepsText || "—"}
                            value={d.reps}
                            onChange={(e) => editSet(n, "reps", e.target.value)}
                            className={cell}
                          />
                          <Input
                            aria-label={`Série ${n}: carga em kg`}
                            type="number"
                            min={0}
                            step="0.5"
                            inputMode="decimal"
                            placeholder={load || "—"}
                            value={d.load}
                            onChange={(e) => editSet(n, "load", e.target.value)}
                            className={cell}
                          />
                          <Input
                            aria-label={`Série ${n}: RIR`}
                            type="number"
                            min={0}
                            max={10}
                            inputMode="numeric"
                            placeholder={rir || "—"}
                            value={d.rir}
                            onChange={(e) => editSet(n, "rir", e.target.value)}
                            className={cell}
                          />
                          <Input
                            aria-label={`Série ${n}: descanso em segundos`}
                            type="number"
                            min={0}
                            step="5"
                            inputMode="numeric"
                            placeholder={rest || "—"}
                            value={d.rest}
                            onChange={(e) => editSet(n, "rest", e.target.value)}
                            className={cell}
                          />
                        </div>
                      );
                    })}
                    <p className={helperClass}>Campo vazio usa o valor geral do exercício. Reps: 12 ou 8-10.</p>
                  </div>
                ))}
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="t-label text-ink-muted">Intensidade</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelClass}>
              <span>Carga sugerida (kg)</span>
              <Input
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              <span>Descanso (s)</span>
              <Input type="number" min={0} step="5" inputMode="numeric" value={rest} onChange={(e) => setRest(e.target.value)} />
            </label>
            <label className={labelClass}>
              <span>RIR (0–10)</span>
              <Input type="number" min={0} max={10} inputMode="numeric" value={rir} onChange={(e) => setRir(e.target.value)} />
            </label>
            <label className={labelClass}>
              <span>Cadência</span>
              <Input type="text" maxLength={20} placeholder="3-0-1-0" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="t-label text-ink-muted">Superset ou circuito</h3>
          <div role="group" aria-label="Agrupamento" className="grid grid-cols-3 gap-1.5">
            {(
              [
                ["", "Nenhum"],
                ["superset", "Superset"],
                ["circuit", "Circuito"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v || "none"}
                type="button"
                aria-pressed={groupKind === v}
                onClick={() => chooseKind(v)}
                className={segClass(groupKind === v)}
              >
                {label}
              </button>
            ))}
          </div>
          {groupKind && (
            <div className="flex flex-col gap-2">
              <span className={labelClass}>Grupo</span>
              <div role="group" aria-label="Letra do grupo" className="flex flex-wrap gap-1.5">
                {keyOptions.map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={groupKey === k}
                    onClick={() => setGroupKey(k)}
                    className={`size-11 rounded-md border text-sm font-bold ${
                      groupKey === k ? "border-brand bg-brand-tint text-brand" : "border-line text-ink-muted hover:text-ink"
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <p className={helperClass}>
                Exercícios consecutivos com o mesmo tipo e letra formam um bloco. Deixe-os lado a lado na ordem do dia.
                O aluno descansa só ao fim de cada rodada, pelo maior descanso configurado no bloco.
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="t-label text-ink-muted">Substituição e observações</h3>
          <div className={labelClass}>
            <span>Substitutos permitidos</span>
            {substituteIds.length > 0 && (
              <ol className="flex flex-col gap-1.5">
                {substituteIds.map((id, i) => {
                  const name = byId.get(id)?.name ?? "Exercício";
                  return (
                    <li key={id} className="flex items-center gap-1.5 rounded-md border border-line bg-surface-sunken/60 pl-3">
                      <span className="min-w-0 flex-1 break-words text-sm font-normal text-ink">
                        <span className="mr-1.5 tabular-nums text-ink-faint">{i + 1}.</span>
                        {name}
                      </span>
                      <button
                        type="button"
                        className={ICON_BTN}
                        disabled={i === 0}
                        onClick={() => moveSubstitute(i, -1)}
                        aria-label={`Subir ${name}`}
                      >
                        <Icon name="chevron" size={18} className="-rotate-90" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN}
                        disabled={i === substituteIds.length - 1}
                        onClick={() => moveSubstitute(i, 1)}
                        aria-label={`Descer ${name}`}
                      >
                        <Icon name="chevron" size={18} className="rotate-90" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN}
                        onClick={() => setSubstituteIds((ids) => ids.filter((x) => x !== id))}
                        aria-label={`Remover ${name}`}
                      >
                        <Icon name="x" size={16} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <Select
              aria-label="Adicionar substituto"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setSubstituteIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
              }}
            >
              <option value="">{substituteIds.length > 0 ? "Adicionar outro substituto…" : "Adicionar substituto…"}</option>
              {subOptions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </Select>
          </div>
          <label className={labelClass}>
            <span>Observações para o aluno</span>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" />
          </label>
        </section>

        {error && (
          <p role="alert" className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={save} disabled={pending} className="flex-1">
            {pending ? "Salvando…" : "Salvar exercício"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
