import type { Food } from "@/lib/repository";
import { distinctFoodCategories } from "@/lib/nutrition-builder";
import CreateFoodForm from "./create-food-form";
import FoodRow from "./food-row";

const SELECT =
  "w-full min-w-0 min-h-11 rounded-md border border-line bg-surface-sunken px-3 py-2 text-ink outline-none focus:border-brand";

/**
 * Biblioteca de alimentos: busca rápida por nome + filtro por categoria (item 20). Filtro
 * via `<form method="GET">` nativo (sem JS) — mesmo padrão de `ExerciseLibrary` (treino):
 * os valores viram `searchParams` que `page.tsx` já usou pra chamar `getFoods(filters)`.
 * `allFoods` (sem filtro) só alimenta as opções do `<select>` de categoria.
 */
export default function FoodLibrary({
  clientId,
  foods,
  allFoods,
  filters,
}: {
  clientId: string;
  foods: Food[];
  allFoods: Food[];
  filters: { q: string; category: string; archived: boolean };
}) {
  const categories = distinctFoodCategories(allFoods);
  const basePath = `/coach/alunos/${clientId}/nutricao`;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-medium text-ink">
        Biblioteca de alimentos {allFoods.length > 0 && `(${allFoods.length})`}
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
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
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
        {(filters.q || filters.category || filters.archived) && (
          <a
            href={basePath}
            className="inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm text-ink-muted hover:text-ink"
          >
            Limpar filtros
          </a>
        )}
      </form>

      {allFoods.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum alimento cadastrado ainda nesta conta — crie o primeiro abaixo.</p>
      ) : foods.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum alimento encontrado com esses filtros.</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {foods.map((food) => (
            <FoodRow key={food.id} clientId={clientId} food={food} />
          ))}
        </ul>
      )}

      <CreateFoodForm clientId={clientId} />
    </section>
  );
}
