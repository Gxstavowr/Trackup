import { notFound } from "next/navigation";
import {
  getClient,
  getClients,
  getFoodEquivalences,
  getFoods,
  getNutritionOverview,
  getNutritionTemplates,
  getPlanChangeLogs,
} from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import FoodLibrary from "./food-library";
import FoodEquivalencesPanel from "./food-equivalences-panel";
import { CreateDraftForm, DiscardDraftButton, PublishDraftButton } from "./plan-lifecycle";
import NutritionGoalsForm from "./nutrition-goals-form";
import DailyView from "./daily-view";
import AddMealForm from "./add-meal-form";
import DuplicateDayForm from "./duplicate-day-form";
import DuplicateToClientForm from "./duplicate-to-client-form";
import TemplatesPanel from "./templates-panel";
import PreviewPanel from "./preview-panel";
import PlanHistoryPanel from "../plan-history-panel";

/**
 * Tela "Nutrição do aluno" (item 20 do master TODO — construtor completo, espelhando
 * `/coach/alunos/[id]/treino` na FORMA): biblioteca de alimentos com busca/filtro, plano
 * com metas nutricionais/hidratação, visualização diária, refeições com quantidade/macros/
 * substituições equivalentes, duplicação (refeição/dia/plano), reordenação, ciclo de vida
 * rascunho -> publicado -> versão anterior, templates de dieta, duplicação entre alunos,
 * pré-visualização como aluno e histórico de alterações.
 *
 * Construído sobre `lib/repository.ts` (camada de dados, seção NUTRIÇÃO) e as funções SQL
 * de `supabase/migrations/0008_nutrition_builder.sql` (ciclo de vida/duplicação/reordenação
 * atômicos). Ver o relatório da tarefa pra o que ficou de fora nesta rodada (mesmo padrão
 * de honestidade de `treino/page.tsx`).
 */
export default async function ClientNutritionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireCoach();

  const client = await getClient(id);
  if (!client) {
    // RLS: `getClient` devolve `null` tanto se o id não existe quanto se pertence a outra
    // conta — 404 é a resposta certa nos dois casos, sem vazar qual é o motivo.
    notFound();
  }

  const filters = {
    q: typeof sp.q === "string" ? sp.q : "",
    category: typeof sp.category === "string" ? sp.category : "",
    archived: sp.archived === "1",
  };

  const [filteredFoods, allFoods, overview, templates, equivalences, logs, allClients] = await Promise.all([
    getFoods({
      search: filters.q || undefined,
      category: filters.category || undefined,
      includeArchived: filters.archived,
    }),
    getFoods(),
    getNutritionOverview(id),
    getNutritionTemplates(),
    getFoodEquivalences(),
    getPlanChangeLogs(id, "nutrition"),
    getClients(),
  ]);

  const { draft, published, archivedCount } = overview;
  const otherClients = allClients.filter((c) => c.id !== id);
  const savableFrom = draft
    ? { planId: draft.id, label: draft.name }
    : published
      ? { planId: published.id, label: published.name }
      : null;

  return (
    <div className="flex flex-col gap-8">
      <FoodLibrary clientId={id} foods={filteredFoods} allFoods={allFoods} filters={filters} />

      <FoodEquivalencesPanel clientId={id} foods={allFoods} equivalences={equivalences} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-ink">Plano de nutrição</h2>
          {archivedCount > 0 && (
            <span className="text-xs text-ink-faint">
              {archivedCount} {archivedCount === 1 ? "versão anterior arquivada" : "versões anteriores arquivadas"}
            </span>
          )}
        </div>

        {published && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{published.name}</span>
                <span className="rounded-full bg-ok-tint px-3 py-1 font-mono text-xs uppercase tracking-wide text-ok">
                  Publicado
                </span>
                <span className="text-xs text-ink-faint">
                  {published.meals.length} {published.meals.length === 1 ? "refeição" : "refeições"}
                </span>
              </div>
              <DuplicateToClientForm clientId={id} planId={published.id} otherClients={otherClients} />
            </div>

            <DailyView
              clientId={id}
              planId={published.id}
              meals={published.meals}
              foods={allFoods}
              plan={published}
              editable={false}
            />

            <PreviewPanel plan={published} />
          </div>
        )}

        {draft ? (
          <div className="flex flex-col gap-6 rounded-lg border border-brand/40 bg-brand-tint/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{draft.name}</span>
                <span className="rounded-full bg-warn-tint px-3 py-1 font-mono text-xs uppercase tracking-wide text-warn">
                  Rascunho
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DiscardDraftButton clientId={id} planId={draft.id} />
                <PublishDraftButton clientId={id} planId={draft.id} />
              </div>
            </div>

            <NutritionGoalsForm clientId={id} plan={draft} />

            {allFoods.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Cadastre pelo menos um alimento na biblioteca acima antes de montar as refeições.
              </p>
            ) : (
              <>
                {draft.meals.length > 0 && <DuplicateDayForm clientId={id} planId={draft.id} />}

                <DailyView
                  clientId={id}
                  planId={draft.id}
                  meals={draft.meals}
                  foods={allFoods}
                  plan={draft}
                  editable={true}
                />

                <AddMealForm clientId={id} planId={draft.id} />
              </>
            )}

            <PreviewPanel plan={draft} />
          </div>
        ) : (
          <CreateDraftForm
            clientId={id}
            published={published}
            templates={templates}
            defaultName={published ? published.name : `Nutrição de ${client.name}`}
          />
        )}
      </section>

      <TemplatesPanel clientId={id} templates={templates} savableFrom={savableFrom} />

      <PlanHistoryPanel logs={logs} />
    </div>
  );
}
