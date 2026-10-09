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
import ExerciseLibrary from "./exercise-library";
import { CreateDraftForm, DiscardDraftButton, PublishDraftButton } from "./plan-lifecycle";
import DayCard from "./day-card";
import AddWorkoutDayForm from "./add-workout-day-form";
import TemplatesPanel from "./templates-panel";
import DuplicateToClientForm from "./duplicate-to-client-form";
import PreviewPanel from "./preview-panel";
import PlanHistoryPanel from "../plan-history-panel";

/**
 * Tela "Treino do aluno" (item 18 do master TODO — construtor completo): biblioteca com
 * busca/filtros/exercício personalizado, dias com todos os campos de prescrição e blocos
 * (aquecimento/cardio/superset/circuito), reordenação e duplicação (exercício/dia/plano),
 * substituições, ciclo de vida rascunho -> publicado -> versão anterior, templates,
 * duplicação de programas, pré-visualização como aluno e histórico de alterações.
 *
 * Construído sobre `lib/repository.ts` (camada de dados, seção TREINO) e as funções SQL de
 * `supabase/migrations/0007_training_builder.sql` (ciclo de vida/duplicação/reordenação
 * atômicos). Ver o relatório da tarefa pra o que ficou de fora nesta rodada.
 */
export default async function ClientWorkoutPage({
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
    muscleGroup: typeof sp.muscleGroup === "string" ? sp.muscleGroup : "",
    equipment: typeof sp.equipment === "string" ? sp.equipment : "",
    archived: sp.archived === "1",
  };

  const [filteredExercises, allExercises, overview, templates, logs, allClients] = await Promise.all([
    getExercises({
      search: filters.q || undefined,
      category: filters.category || undefined,
      muscleGroup: filters.muscleGroup || undefined,
      equipment: filters.equipment || undefined,
      includeArchived: filters.archived,
    }),
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
    <div className="flex flex-col gap-8">
      <ExerciseLibrary clientId={id} exercises={filteredExercises} allExercises={allExercises} filters={filters} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-ink">Plano de treino</h2>
          {archivedCount > 0 && (
            <span className="text-xs text-ink-faint">
              {archivedCount} {archivedCount === 1 ? "versão anterior arquivada" : "versões anteriores arquivadas"}
            </span>
          )}
        </div>

        {published && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-medium text-ink">{published.name}</span>
                <span className="rounded-full bg-ok-tint px-3 py-1 font-mono text-xs uppercase tracking-wide text-ok">
                  Publicado
                </span>
                <span className="text-xs text-ink-faint">
                  {published.days.length} {published.days.length === 1 ? "dia" : "dias"}
                </span>
              </div>
              <DuplicateToClientForm clientId={id} planId={published.id} otherClients={otherClients} />
            </div>

            <ul className="flex flex-col gap-3">
              {published.days.map((day, index) => (
                <DayCard
                  key={day.id}
                  clientId={id}
                  planId={published.id}
                  day={day}
                  dayOrderIds={published.days.map((d) => d.id)}
                  isFirst={index === 0}
                  isLast={index === published.days.length - 1}
                  exercises={allExercises}
                  editable={false}
                />
              ))}
            </ul>

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

            {draft.days.length === 0 ? (
              <p className="text-sm text-ink-muted">Nenhum dia de treino ainda — adicione o primeiro abaixo.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {draft.days.map((day, index) => (
                  <DayCard
                    key={day.id}
                    clientId={id}
                    planId={draft.id}
                    day={day}
                    dayOrderIds={draft.days.map((d) => d.id)}
                    isFirst={index === 0}
                    isLast={index === draft.days.length - 1}
                    exercises={allExercises}
                    editable={true}
                  />
                ))}
              </ul>
            )}

            <AddWorkoutDayForm clientId={id} planId={draft.id} />

            <PreviewPanel plan={draft} />
          </div>
        ) : (
          <CreateDraftForm
            clientId={id}
            published={published}
            templates={templates}
            defaultName={published ? published.name : `Treino de ${client.name}`}
          />
        )}
      </section>

      <TemplatesPanel clientId={id} templates={templates} savableFrom={savableFrom} />

      <PlanHistoryPanel logs={logs} />
    </div>
  );
}
