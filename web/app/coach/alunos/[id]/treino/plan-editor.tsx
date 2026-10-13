"use client";

import { useEffect, useRef, useState } from "react";
import type { Exercise, WorkoutDayWithExercises, WorkoutExerciseWithDetails, WorkoutPlanWithDays } from "@/lib/repository";
import { blockTypeLabel, groupDayExercises, groupKindLabel, type WorkoutGroupKind } from "@/lib/workout-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Modal } from "@/components/ui/overlay";
import { Input, Textarea, labelClass } from "@/components/ui/field";
import {
  addWorkoutDayAction,
  deleteWorkoutDayAction,
  deleteWorkoutExerciseAction,
  duplicateWorkoutDayAction,
  duplicateWorkoutExerciseAction,
  moveWorkoutDayAction,
  moveWorkoutExerciseAction,
  updateWorkoutDayAction,
} from "./actions";
import ExerciseEditor from "./exercise-editor";
import { formatSetTargets } from "@/lib/workout-prescription";
import ExercisePicker from "./exercise-picker";
import { formatPrescription, toFormData, useSave } from "./workout-ui";

const ICON_BTN =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

const SUGGESTED_DAY_NAMES = ["Treino A", "Treino B", "Treino C", "Treino D", "Treino E"];

/** Editor do plano: dias como abas (com contagem), cartões compactos por exercício, gaveta de
 * edição, seletor da biblioteca. `editable=false` = leitura (plano publicado). */
export default function PlanEditor({
  clientId,
  plan,
  exercises,
  editable,
}: {
  clientId: string;
  plan: WorkoutPlanWithDays;
  exercises: Exercise[];
  editable: boolean;
}) {
  const [activeId, setActiveId] = useState(plan.days[0]?.id ?? "");
  const [addingDay, setAddingDay] = useState(false);
  const { run } = useSave();

  const days = plan.days;
  const activeIndex = days.findIndex((d) => d.id === activeId);
  const active = activeIndex >= 0 ? days[activeIndex] : days[0];
  const dayOrderIds = days.map((d) => d.id);

  function moveDay(dir: -1 | 1) {
    if (!active) return;
    void run(() =>
      moveWorkoutDayAction(
        toFormData({
          clientId,
          planId: plan.id,
          dayId: active.id,
          direction: dir,
          orderJson: JSON.stringify(dayOrderIds),
        })
      )
    );
  }

  // Quando um dia novo aparece (criar/duplicar), a aba dele fica ativa.
  const prevCount = useRef(days.length);
  useEffect(() => {
    if (days.length > prevCount.current) setActiveId(days[days.length - 1].id);
    prevCount.current = days.length;
  }, [days]);

  async function duplicateDay() {
    if (!active) return;
    await run(() => duplicateWorkoutDayAction(toFormData({ clientId, dayId: active.id })));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Dias de treino" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
          {days.map((day) => {
            const selected = day.id === active?.id;
            return (
              <button
                key={day.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setActiveId(day.id)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold transition-colors ${
                  selected
                    ? "border-brand bg-brand-tint text-ink"
                    : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                <span className="max-w-[10rem] truncate">{day.name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    selected ? "bg-brand text-on-accent" : "bg-surface-raised text-ink-muted"
                  }`}
                >
                  {day.exercises.length}
                </span>
              </button>
            );
          })}
        </div>
        {editable && (
          <Button variant="secondary" icon="plus" onClick={() => setAddingDay(true)} className="shrink-0">
            <span className="hidden sm:inline">Novo dia</span>
            <span className="sr-only sm:hidden">Novo dia</span>
          </Button>
        )}
      </div>

      {days.length === 0 && (
        <div className="rounded-lg border border-dashed border-line p-6 text-center">
          <p className="text-sm text-ink-muted">
            {editable
              ? "Nenhum dia ainda. Crie o primeiro dia de treino (Treino A, B, C…)."
              : "Este plano não tem dias."}
          </p>
          {editable && (
            <Button className="mt-3" icon="plus" onClick={() => setAddingDay(true)}>
              Criar primeiro dia
            </Button>
          )}
        </div>
      )}

      {active && (
        <DayPanel
          key={active.id}
          clientId={clientId}
          day={active}
          exercises={exercises}
          editable={editable}
          isFirst={activeIndex <= 0}
          isLast={activeIndex === days.length - 1}
          onMove={moveDay}
          onDuplicate={duplicateDay}
          onRemoved={() => setActiveId("")}
        />
      )}

      {addingDay && (
        <AddDayModal
          clientId={clientId}
          planId={plan.id}
          existingNames={days.map((d) => d.name)}
          onClose={() => setAddingDay(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DayPanel({
  clientId,
  day,
  exercises,
  editable,
  isFirst,
  isLast,
  onMove,
  onDuplicate,
  onRemoved,
}: {
  clientId: string;
  day: WorkoutDayWithExercises;
  exercises: Exercise[];
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemoved: () => void;
}) {
  const { run } = useSave();
  const [picking, setPicking] = useState(false);
  const [editingDay, setEditingDay] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const sorted = [...day.exercises].sort((a, b) => a.sort_order - b.sort_order);
  const orderIds = sorted.map((we) => we.id);
  const blocks = groupDayExercises(day.exercises);
  const usedKeys: Record<WorkoutGroupKind, string[]> = { superset: [], circuit: [] };
  for (const we of sorted) {
    if (we.group_kind && we.group_key && !usedKeys[we.group_kind].includes(we.group_key)) {
      usedKeys[we.group_kind].push(we.group_key);
    }
  }
  const totalSets = sorted.reduce((sum, we) => sum + (we.sets ?? 0), 0);

  function move(we: WorkoutExerciseWithDetails, dir: -1 | 1) {
    void run(() =>
      moveWorkoutExerciseAction(
        toFormData({
          clientId,
          dayId: day.id,
          workoutExerciseId: we.id,
          direction: dir,
          orderJson: JSON.stringify(orderIds),
        })
      )
    );
  }

  function renderCard(we: WorkoutExerciseWithDetails, indexInGroup?: number) {
    return (
      <ExerciseCard
        key={we.id}
        clientId={clientId}
        we={we}
        exercises={exercises}
        editable={editable}
        isFirst={orderIds[0] === we.id}
        isLast={orderIds[orderIds.length - 1] === we.id}
        usedGroupKeys={usedKeys}
        position={indexInGroup}
        onMove={(dir) => move(we, dir)}
      />
    );
  }

  return (
    <section aria-label={day.name} className="card flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-subtitle break-words">{day.name}</h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {[
              `${sorted.length} ${sorted.length === 1 ? "exercício" : "exercícios"}`,
              totalSets > 0 && `${totalSets} séries`,
              day.duration_min != null && `~${day.duration_min} min`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {day.notes && <p className="mt-1 break-words text-xs text-ink-faint">{day.notes}</p>}
        </div>

        {editable && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={ICON_BTN} disabled={isFirst} onClick={() => onMove(-1)} aria-label="Mover dia para a esquerda">
              <Icon name="chevron" size={18} className="rotate-180" />
            </button>
            <button type="button" className={ICON_BTN} disabled={isLast} onClick={() => onMove(1)} aria-label="Mover dia para a direita">
              <Icon name="chevron" size={18} />
            </button>
            <Button variant="secondary" size="sm" onClick={() => setEditingDay(true)}>
              Editar dia
            </Button>
            <Button variant="secondary" size="sm" onClick={onDuplicate}>
              Duplicar dia
            </Button>
            {confirmRemove ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await run(() => deleteWorkoutDayAction(toFormData({ clientId, dayId: day.id })));
                    onRemoved();
                  }}
                >
                  Remover mesmo?
                </Button>
                <Button variant="tertiary" size="sm" onClick={() => setConfirmRemove(false)}>
                  Não
                </Button>
              </>
            ) : (
              <Button variant="tertiary" size="sm" icon="trash" onClick={() => setConfirmRemove(true)} aria-label="Remover dia">
                <span className="sr-only sm:not-sr-only">Remover</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">
          Nenhum exercício neste dia ainda.
        </div>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {blocks.map((block, i) =>
            block.kind === "single" ? (
              <li key={block.item.id}>{renderCard(block.item)}</li>
            ) : (
              <li key={`${block.groupKey}-${i}`}>
                <div
                  className={`rounded-lg border-l-4 bg-surface-sunken/50 py-2 pl-3 pr-2 ${
                    block.groupKind === "superset" ? "border-brand" : "border-info"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={block.groupKind === "superset" ? "accent" : "info"}>
                      {groupKindLabel(block.groupKind)} {block.groupKey}
                    </Badge>
                    <span className="text-xs text-ink-faint">
                      {block.items.length} exercícios{" "}
                      {block.groupKind === "superset" ? "seguidos, sem pausa" : "em sequência"}
                    </span>
                  </div>
                  <ol className="flex flex-col gap-2">
                    {block.items.map((we, idx) => (
                      <li key={we.id}>{renderCard(we, idx + 1)}</li>
                    ))}
                  </ol>
                </div>
              </li>
            )
          )}
        </ol>
      )}

      {editable && (
        <Button variant="secondary" icon="plus" width="mobile" className="self-start" onClick={() => setPicking(true)}>
          Adicionar exercício
        </Button>
      )}

      {editable && (
        <ExercisePicker
          open={picking}
          onClose={() => setPicking(false)}
          clientId={clientId}
          dayId={day.id}
          dayName={day.name}
          exercises={exercises}
        />
      )}
      {editable && editingDay && (
        <EditDayModal clientId={clientId} day={day} onClose={() => setEditingDay(false)} />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function ExerciseCard({
  clientId,
  we,
  exercises,
  editable,
  isFirst,
  isLast,
  usedGroupKeys,
  position,
  onMove,
}: {
  clientId: string;
  we: WorkoutExerciseWithDetails;
  exercises: Exercise[];
  editable: boolean;
  isFirst: boolean;
  isLast: boolean;
  usedGroupKeys: Record<WorkoutGroupKind, string[]>;
  position?: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const { run } = useSave();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const parts = formatPrescription(we);
  const perSet = formatSetTargets(we);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {position != null && (
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-raised text-xs font-bold tabular-nums text-ink-muted">
                {position}
              </span>
            )}
            <h4 className="break-words font-semibold text-ink">{we.exercise.name}</h4>
            {we.block_type !== "normal" && <Badge tone="warning">{blockTypeLabel(we.block_type)}</Badge>}
          </div>

          <p className="mt-1 break-words text-sm tabular-nums text-ink">
            {parts.length > 0 ? parts.join(" · ") : <span className="text-ink-faint">Sem prescrição — toque em Editar</span>}
          </p>
          {perSet.length > 0 && (
            <p className="mt-0.5 break-words text-xs tabular-nums text-ink-muted">{perSet.join(" · ")}</p>
          )}
          {we.exercise.muscle_group && <p className="mt-0.5 text-xs text-ink-faint">{we.exercise.muscle_group}</p>}
          {we.substitutes.length > 0 && (
            <p className="mt-1 break-words text-xs text-ink-muted">
              <span className="font-semibold">{we.substitutes.length === 1 ? "Substituto:" : "Substitutos:"}</span>{" "}
              {we.substitutes.map((s) => s.name).join(", ")}
            </p>
          )}
          {we.notes && <p className="mt-1 break-words text-xs italic text-ink-muted">“{we.notes}”</p>}
        </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[20rem] sm:justify-end">
          <button type="button" className={ICON_BTN} disabled={isFirst} onClick={() => onMove(-1)} aria-label={`Subir ${we.exercise.name}`}>
            <Icon name="chevron" size={18} className="-rotate-90" />
          </button>
          <button type="button" className={ICON_BTN} disabled={isLast} onClick={() => onMove(1)} aria-label={`Descer ${we.exercise.name}`}>
            <Icon name="chevron" size={18} className="rotate-90" />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => run(() => duplicateWorkoutExerciseAction(toFormData({ clientId, workoutExerciseId: we.id })))}
          >
            Duplicar
          </Button>
          <span className="relative ml-auto sm:ml-0">
            {menu ? (
              <span className="flex items-center gap-1.5">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => run(() => deleteWorkoutExerciseAction(toFormData({ clientId, workoutExerciseId: we.id })))}
                >
                  Remover mesmo?
                </Button>
                <Button variant="tertiary" size="sm" onClick={() => setMenu(false)}>
                  Não
                </Button>
              </span>
            ) : (
              <Button variant="tertiary" size="sm" icon="trash" onClick={() => setMenu(true)} aria-label={`Remover ${we.exercise.name}`} />
            )}
          </span>
        </div>
      )}
      </div>

      {editable && editing && (
        <ExerciseEditor
          open
          onClose={() => setEditing(false)}
          clientId={clientId}
          we={we}
          exercises={exercises}
          usedGroupKeys={usedGroupKeys}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AddDayModal({
  clientId,
  planId,
  existingNames,
  onClose,
}: {
  clientId: string;
  planId: string;
  existingNames: string[];
  onClose: () => void;
}) {
  const { run } = useSave();
  const suggestion = SUGGESTED_DAY_NAMES.find((n) => !existingNames.includes(n)) ?? `Treino ${existingNames.length + 1}`;
  const [name, setName] = useState(suggestion);
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await run(() =>
      addWorkoutDayAction(null, toFormData({ clientId, planId, name, duration_min: duration, notes }))
    );
    setPending(false);
    if (result?.error) setError(result.error);
    else onClose();
  }

  return (
    <Modal open onClose={onClose} title="Novo dia de treino">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_DAY_NAMES.filter((n) => !existingNames.includes(n)).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setName(n)}
              className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand"
            >
              {n}
            </button>
          ))}
        </div>
        <label className={labelClass}>
          <span>Nome do dia</span>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Treino A — Peito e tríceps" />
        </label>
        <label className={labelClass}>
          <span>Duração estimada (min)</span>
          <Input type="number" min={0} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        <label className={labelClass}>
          <span>Observações do dia (opcional)</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </label>
        {error && <p role="alert" className="text-sm text-coral-text">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? "Criando…" : "Criar dia"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditDayModal({
  clientId,
  day,
  onClose,
}: {
  clientId: string;
  day: WorkoutDayWithExercises;
  onClose: () => void;
}) {
  const { run } = useSave();
  const [name, setName] = useState(day.name);
  const [duration, setDuration] = useState(day.duration_min != null ? String(day.duration_min) : "");
  const [notes, setNotes] = useState(day.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await run(() =>
      updateWorkoutDayAction(null, toFormData({ clientId, dayId: day.id, name, duration_min: duration, notes }))
    );
    setPending(false);
    if (result?.error) setError(result.error);
    else onClose();
  }

  return (
    <Modal open onClose={onClose} title="Editar dia">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={labelClass}>
          <span>Nome do dia</span>
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={labelClass}>
          <span>Duração estimada (min)</span>
          <Input type="number" min={0} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        <label className={labelClass}>
          <span>Observações do dia</span>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
        </label>
        {error && <p role="alert" className="text-sm text-coral-text">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? "Salvando…" : "Salvar dia"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
