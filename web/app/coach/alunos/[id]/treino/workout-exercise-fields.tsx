import type { Exercise, WorkoutExercise } from "@/lib/repository";

const INPUT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";
const LABEL = "flex flex-col gap-1.5 text-sm";

/**
 * Campos de prescrição de um exercício-no-dia — TODOS os requisitos do item 18: séries,
 * repetições (fixas ou faixa min/max), carga sugerida, descanso, RIR, cadência, bloco
 * (aquecimento/normal/cardio), superset/circuito (tipo + letra do grupo), substituição,
 * duração (cardio) e observações. Componente de APRESENTAÇÃO só (sem `<form>` próprio nem
 * Server Action) — `add-exercise-to-day` e a edição inline em `day-card.tsx` embrulham isso
 * em formulários diferentes, cada um com seu próprio `useActionState`.
 *
 * Validação de negócio (faixa de reps, grupo exige letra, cardio exige duração...) mora em
 * `lib/workout-builder.ts` (`validateWorkoutExerciseInput`) e roda no Server Action — os
 * `min`/`step` aqui são só a primeira camada (UX), nunca a única.
 */
export default function WorkoutExerciseFields({
  exercises,
  excludeExerciseId,
  defaultValues,
}: {
  exercises: Exercise[];
  excludeExerciseId?: string;
  defaultValues?: Partial<WorkoutExercise>;
}) {
  const substituteOptions = exercises.filter((ex) => ex.id !== excludeExerciseId);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={LABEL}>
          <span className="text-ink-muted">Bloco</span>
          <select name="block_type" defaultValue={defaultValues?.block_type ?? "normal"} className={INPUT}>
            <option value="warmup">Aquecimento</option>
            <option value="normal">Normal</option>
            <option value="cardio">Cardio</option>
          </select>
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Superset/circuito</span>
          <select name="group_kind" defaultValue={defaultValues?.group_kind ?? ""} className={INPUT}>
            <option value="">Nenhum</option>
            <option value="superset">Superset</option>
            <option value="circuit">Circuito</option>
          </select>
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Letra do grupo</span>
          <input
            name="group_key"
            type="text"
            maxLength={20}
            placeholder="A, A1..."
            defaultValue={defaultValues?.group_key ?? ""}
            className={INPUT}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className="text-ink-muted">Séries</span>
          <input name="sets" type="number" min={0} defaultValue={defaultValues?.sets ?? ""} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Reps (fixo)</span>
          <input name="reps" type="number" min={0} defaultValue={defaultValues?.reps ?? ""} className={INPUT} />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Reps mín.</span>
          <input
            name="reps_min"
            type="number"
            min={0}
            defaultValue={defaultValues?.reps_min ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Reps máx.</span>
          <input
            name="reps_max"
            type="number"
            min={0}
            defaultValue={defaultValues?.reps_max ?? ""}
            className={INPUT}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          <span className="text-ink-muted">Carga sugerida (kg)</span>
          <input
            name="suggested_load"
            type="number"
            min={0}
            step="0.5"
            defaultValue={defaultValues?.suggested_load ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Descanso (s)</span>
          <input
            name="rest_sec"
            type="number"
            min={0}
            defaultValue={defaultValues?.rest_sec ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">RIR</span>
          <input
            name="rir"
            type="number"
            min={0}
            max={10}
            defaultValue={defaultValues?.rir ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Cadência</span>
          <input
            name="tempo"
            type="text"
            maxLength={20}
            placeholder="3-1-1-0"
            defaultValue={defaultValues?.tempo ?? ""}
            className={INPUT}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span className="text-ink-muted">Duração do cardio (s)</span>
          <input
            name="duration_sec"
            type="number"
            min={0}
            defaultValue={defaultValues?.duration_sec ?? ""}
            className={INPUT}
          />
        </label>
        <label className={LABEL}>
          <span className="text-ink-muted">Substituição permitida</span>
          <select
            name="substitute_exercise_id"
            defaultValue={defaultValues?.substitute_exercise_id ?? ""}
            className={INPUT}
          >
            <option value="">Nenhuma</option>
            {substituteOptions.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={LABEL}>
        <span className="text-ink-muted">Observações</span>
        <textarea name="notes" rows={2} defaultValue={defaultValues?.notes ?? ""} className={INPUT} />
      </label>
    </div>
  );
}
