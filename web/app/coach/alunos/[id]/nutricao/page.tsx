import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClient,
  getClients,
  getFoodEquivalencesForFoods,
  getFoods,
  getNutritionOverview,
  getNutritionTemplates,
  getPlanChangeLogs,
} from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { ModuleNotice } from "../protocol-panel";
import { CreateDraftForm, DiscardDraftButton, PublishDraftButton } from "./plan-lifecycle";
import NutritionGoalsForm from "./nutrition-goals-form";
import PlanEditor from "./plan-editor";
import DuplicateToClientForm from "./duplicate-to-client-form";
import TemplatesPanel from "./templates-panel";
import PlanHistoryPanel from "../plan-history-panel";
import { Badge } from "@/components/ui/badge";

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

  void sp;

  const [allFoods, overview, templates, logs, allClients] = await Promise.all([
    getFoods(),
    getNutritionOverview(id),
    getNutritionTemplates(),
    getPlanChangeLogs(id, "nutrition"),
    getClients(),
  ]);

  const { draft, published, archivedCount } = overview;

  // Equivalências da biblioteca dos alimentos do plano: a prévia "Como o aluno vê" mostra
  // "Equivale a ..." exatamente como o portal (que busca as mesmas linhas por alimento).
  const planFoodIds = Array.from(
    new Set(
      [...(draft?.meals ?? []), ...(published?.meals ?? [])]
        .flatMap((m) => m.items.map((item) => item.food_id))
        .filter((foodId): foodId is string => foodId != null)
    )
  );
  // Falha aqui só empobrece a prévia — não pode derrubar o editor.
  const equivalences = await getFoodEquivalencesForFoods(planFoodIds).catch((err) => {
    console.error("Não foi possível carregar as equivalências para a prévia:", err);
    return [];
  });
  const otherClients = allClients.filter((c) => c.id !== id);
  const savableFrom = draft
    ? { planId: draft.id, label: draft.name }
    : published
      ? { planId: published.id, label: published.name }
      : null;

  const publishedCard = published ? (
<div className="flex flex-col gap-4 card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{published.name}</span>
                <Badge tone="success">
                  Publicado
                </Badge>
                <span className="text-xs text-ink-faint">
                  {published.meals.length} {published.meals.length === 1 ? "refeição" : "refeições"}
                </span>
              </div>
              <DuplicateToClientForm clientId={id} planId={published.id} otherClients={otherClients} />
            </div>

            <PlanEditor
              clientId={id}
              planId={published.id}
              meals={published.meals}
              foods={allFoods}
              plan={published}
              templates={templates}
              editable={false}
              equivalences={equivalences}
            />
          </div>
  ) : null;

  return (
    <div className="flex flex-col gap-8">
      <ModuleNotice clientId={id} module="nutrition" />
      <p className="text-sm text-ink-muted">
        Esta tela é a dieta deste aluno. A biblioteca de alimentos, as substituições gerais e os templates da conta
        ficam em{" "}
        <Link href="/coach/nutricao" className="text-brand underline">
          Nutrição
        </Link>
        ; ao montar uma refeição você busca e cria alimentos sem sair daqui.
      </p>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="t-subtitle text-ink">Plano de nutrição</h2>
          {archivedCount > 0 && (
            <span className="text-xs text-ink-faint">
              {archivedCount} {archivedCount === 1 ? "versão anterior arquivada" : "versões anteriores arquivadas"}
            </span>
          )}
        </div>

        {!draft && publishedCard}

        {draft ? (
          <div className="flex flex-col gap-6 rounded-lg border border-brand/40 bg-brand-tint/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{draft.name}</span>
                <Badge tone="warning">
                  Rascunho
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <DiscardDraftButton clientId={id} planId={draft.id} />
                <PublishDraftButton clientId={id} planId={draft.id} />
              </div>
            </div>

            <NutritionGoalsForm clientId={id} plan={draft} />

            <PlanEditor
              clientId={id}
              planId={draft.id}
              meals={draft.meals}
              foods={allFoods}
              plan={draft}
              templates={templates}
              editable={true}
              equivalences={equivalences}
            />
          </div>
        ) : (
          <CreateDraftForm
            clientId={id}
            published={published}
            templates={templates}
            defaultName={published ? published.name : `Nutrição de ${client.name}`}
          />
        )}

        {draft && published && (
          <details className="card">
            <summary className="min-h-11 cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink-muted hover:text-ink">
              Versão publicada (o aluno vê esta): {published.name}
            </summary>
            <div className="p-4 pt-0">{publishedCard}</div>
          </details>
        )}
      </section>

      <TemplatesPanel clientId={id} templates={templates} savableFrom={savableFrom} />

      <PlanHistoryPanel logs={logs} />
    </div>
  );
}
