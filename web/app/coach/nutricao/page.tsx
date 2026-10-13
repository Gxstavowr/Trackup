import Link from "next/link";
import { getClients, getFoodEquivalences, getFoods, getNutritionTemplates } from "@/lib/repository";
import { distinctFoodCategories } from "@/lib/nutrition-builder";
import { Button, ButtonLink, Card, Input, Select, Tabs } from "@/components/ui";
import { requireCoach } from "../require-coach";
import FoodsList from "./foods-list";
import EquivalencesPanel from "./equivalences-panel";
import TemplatesList from "./templates-list";
import { EmptyState } from "@/components/ui/empty-state";

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Área global de Nutrição do coach: biblioteca de alimentos, substituições (equivalências) e
 * templates de dieta — recursos da CONTA, reutilizáveis. A dieta de cada aluno continua em
 * `/coach/alunos/[id]/nutricao`.
 */
export default async function CoachNutritionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireCoach();
  const sp = await searchParams;
  const q = one(sp.q);
  const category = one(sp.category);
  const archived = sp.archived === "1";
  const tab = ["alimentos", "substituicoes", "templates"].includes(one(sp.tab)) ? one(sp.tab) : "alimentos";

  const [foods, allFoods, equivalences, templates, clients] = await Promise.all([
    getFoods({ search: q || undefined, category: category || undefined, includeArchived: archived }),
    getFoods({ includeArchived: true }),
    getFoodEquivalences(),
    getNutritionTemplates(),
    getClients(),
  ]);
  const activeFoods = allFoods.filter((f) => !f.is_archived);
  const categories = distinctFoodCategories(allFoods);
  const filtering = Boolean(q || category || archived);

  const stats = [
    { label: "Alimentos", value: activeFoods.length },
    { label: "Equivalências", value: equivalences.length },
    { label: "Templates", value: templates.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="t-label text-ink-faint">Trackly · Coach</span>
          <h1 className="font-display text-hero text-ink">Nutrição</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            Biblioteca geral da sua conta, reutilizável em qualquer aluno. A dieta de cada aluno fica no perfil dele.
          </p>
        </div>
        <ButtonLink href="/coach/alunos" variant="secondary" iconAfter="arrow-right">
          Dietas dos alunos
        </ButtonLink>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label} padding="sm">
            <p className="text-xs text-ink-muted">{s.label}</p>
            <p className="font-display text-2xl text-ink">{s.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        defaultId={tab}
        items={[
          {
            id: "alimentos",
            label: "Alimentos",
            content: (
              <div className="flex flex-col gap-4">
                <form method="GET" className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <input type="hidden" name="tab" value="alimentos" />
                  <Input
                    type="search"
                    name="q"
                    defaultValue={q}
                    placeholder="Buscar alimento…"
                    aria-label="Buscar alimento"
                    className="sm:flex-1"
                  />
                  <Select name="category" defaultValue={category} aria-label="Categoria" className="sm:w-52">
                    <option value="">Todas as categorias</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <label className="flex min-h-11 items-center gap-2 text-sm text-ink-muted">
                    <input type="checkbox" name="archived" value="1" defaultChecked={archived} className="size-5" />
                    Arquivados
                  </label>
                  <Button type="submit" variant="secondary">
                    Filtrar
                  </Button>
                  {filtering && (
                    <Link href="/coach/nutricao?tab=alimentos" className="text-sm text-ink-muted underline">
                      Limpar
                    </Link>
                  )}
                </form>
                <FoodsList foods={foods} totalCount={archived ? allFoods.length : activeFoods.length} />
                {foods.length === 0 && (
                  <EmptyState
                    icon={allFoods.length === 0 ? "nutrition" : "search"}
                    title={allFoods.length === 0 ? "Nenhum alimento cadastrado ainda" : "Nenhum alimento encontrado"}
                    text={
                      allFoods.length === 0
                        ? "Crie o primeiro em “Novo alimento” para montar planos com ele."
                        : "Ajuste a busca ou os filtros para ver outros alimentos."
                    }
                  />
                )}
              </div>
            ),
          },
          {
            id: "substituicoes",
            label: "Substituições",
            content: <EquivalencesPanel foods={activeFoods} equivalences={equivalences} />,
          },
          {
            id: "templates",
            label: "Templates",
            content: <TemplatesList templates={templates} clients={clients.map((c) => ({ id: c.id, name: c.name }))} />,
          },
        ]}
      />
    </div>
  );
}
