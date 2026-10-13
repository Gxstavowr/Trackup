import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClient,
  getClients,
  getExercises,
  getPlanChangeLogs,
  getWorkoutOverview,
  getWorkoutTemplates,
} from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { CreateDraftForm } from "./plan-lifecycle";
import PlanWorkspace from "./plan-workspace";
import TemplatesPanel from "./templates-panel";
import DuplicateToClientForm from "./duplicate-to-client-form";
import PlanHistoryPanel from "../plan-history-panel";

/**
 * Tela "Treino do aluno": editor do plano com dias em abas, cartões de exercício com resumo
 * da prescrição, gaveta de edição, seletor da biblioteca, superset/circuito agrupados,
 * prévia "como o aluno vê", ciclo rascunho -> publicado -> versões, templates e histórico.
 * A biblioteca global (exercícios e templates) vive em /coach/treinos.
 *
 * Camada de dados: `lib/repository.ts` (seção TREINO) + funções SQL da migration 0007.
 */
export default async function ClientWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireCoach();

  const client = await getClient(id);
  if (!client) {
    // RLS: `getClient` devolve `null` tanto se o id não existe quanto se pertence a outra
    // conta — 404 é a resposta certa nos dois casos, sem vazar qual é o motivo.
    notFound();
  }

  const [exercises, overview, templates, logs, allClients] = await Promise.all([
    getExercises(),
    getWorkoutOverview(id),
    getWorkoutTemplates(),
    getPlanChangeLogs(id),
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
        <p>
          Treino individual de {client.name}. Exercícios e templates da conta ficam em{" "}
          <Link href="/coach/treinos" className="font-semibold text-brand hover:underline">
            Treinos
          </Link>
          .
        </p>
        {archivedCount > 0 && (
          <span className="text-xs text-ink-faint">
            {archivedCount} {archivedCount === 1 ? "versão anterior arquivada" : "versões anteriores arquivadas"}
          </span>
        )}
      </div>

      {draft ? (
        <>
          <PlanWorkspace clientId={id} plan={draft} exercises={exercises} mode="draft" hasPublished={!!published} />
          {published && (
            <details className="card">
              <summary className="min-h-11 cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink-muted hover:text-ink">
                Ver versão publicada atual (o que o aluno vê agora): {published.name}
              </summary>
              <div className="p-4 pt-0">
                <PlanWorkspace
                  clientId={id}
                  plan={published}
                  exercises={exercises}
                  mode="published"
                  hasPublished
                />
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          {published && (
            <PlanWorkspace clientId={id} plan={published} exercises={exercises} mode="published" hasPublished />
          )}
          <CreateDraftForm
            clientId={id}
            published={published}
            templates={templates}
            defaultName={published ? published.name : `Treino de ${client.name}`}
          />
        </>
      )}

      <details className="card" open={!draft && !published ? true : undefined}>
        <summary className="min-h-11 cursor-pointer select-none px-4 py-3 text-sm font-semibold text-ink-muted hover:text-ink">
          Templates{templates.length > 0 ? ` (${templates.length})` : ""} e duplicação
        </summary>
        <div className="flex flex-col gap-4 p-4 pt-0">
          <TemplatesPanel clientId={id} templates={templates} savableFrom={savableFrom} />
          {(draft ?? published) && (
            <DuplicateToClientForm clientId={id} planId={(draft ?? published)!.id} otherClients={otherClients} />
          )}
        </div>
      </details>

      <PlanHistoryPanel logs={logs} />
    </div>
  );
}
