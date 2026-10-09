import type { Exercise } from "@/lib/repository";
import { distinctFilterOptions } from "@/lib/workout-builder";
import CreateExerciseForm from "./create-exercise-form";
import ExerciseRow from "./exercise-row";

const SELECT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/**
 * Biblioteca de exercícios: busca por nome + filtros por categoria/grupo muscular/
 * equipamento (item 18). Filtro via `<form method="GET">` nativo (sem JS) — os valores viram
 * `searchParams` que `page.tsx` já usou pra chamar `getExercises(filters)`; `allExercises`
 * (sem filtro) só alimenta as opções dos `<select>` (pra sempre mostrar toda categoria/grupo/
 * equipamento existente, mesmo quando o filtro atual já reduziu a lista visível).
 */
export default function ExerciseLibrary({
  clientId,
  exercises,
  allExercises,
  filters,
}: {
  clientId: string;
  exercises: Exercise[];
  allExercises: Exercise[];
  filters: { q: string; category: string; muscleGroup: string; equipment: string; archived: boolean };
}) {
  const options = distinctFilterOptions(allExercises);
  const basePath = `/coach/alunos/${clientId}/treino`;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-ink">
        Biblioteca de exercícios {allExercises.length > 0 && `(${allExercises.length})`}
      </h2>

      <form method="GET" className="flex flex-wrap gap-3 rounded-lg border border-line bg-surface p-3">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Buscar por nome…"
          className={`${SELECT} flex-1`}
        />
        <select name="category" defaultValue={filters.category} className={SELECT}>
          <option value="">Todas as categorias</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="muscleGroup" defaultValue={filters.muscleGroup} className={SELECT}>
          <option value="">Todos os grupos musculares</option>
          {options.muscleGroups.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select name="equipment" defaultValue={filters.equipment} className={SELECT}>
          <option value="">Todos os equipamentos</option>
          {options.equipment.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" name="archived" value="1" defaultChecked={filters.archived} className="size-5" />
          Mostrar arquivados
        </label>
        <button type="submit" className="min-h-11 rounded-md border border-line px-4 text-sm text-ink hover:border-brand">
          Filtrar
        </button>
        {(filters.q || filters.category || filters.muscleGroup || filters.equipment || filters.archived) && (
          <a
            href={basePath}
            className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm text-ink-muted hover:text-ink"
          >
            Limpar filtros
          </a>
        )}
      </form>

      {allExercises.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum exercício cadastrado ainda nesta conta — crie o primeiro abaixo.</p>
      ) : exercises.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum exercício encontrado com esses filtros.</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {exercises.map((exercise) => (
            <ExerciseRow key={exercise.id} clientId={clientId} exercise={exercise} />
          ))}
        </ul>
      )}

      <CreateExerciseForm clientId={clientId} />
    </section>
  );
}
