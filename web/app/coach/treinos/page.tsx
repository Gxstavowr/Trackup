import { Card, ButtonLink, Tabs } from "@/components/ui";
import { getClients, getExercises, getWorkoutTemplates } from "@/lib/repository";
import { requireCoach } from "../require-coach";
import ExerciseLibrary from "./exercise-library";
import TemplatesView from "./templates-view";

/**
 * Área global de Treinos do coach: biblioteca geral de exercícios (por conta) e biblioteca de
 * templates. O treino individual de cada aluno continua sendo criado/editado no perfil do aluno.
 */
export default async function CoachWorkoutsPage() {
  await requireCoach();
  const [exercises, templates, clients] = await Promise.all([
    getExercises({ includeArchived: true }),
    getWorkoutTemplates(),
    getClients(),
  ]);

  const activeExercises = exercises.filter((e) => !e.is_archived).length;
  const customExercises = exercises.filter((e) => e.is_custom && !e.is_archived).length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="t-label text-ink-faint">Trackly · Coach</span>
        <h1 className="t-title">Treinos</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-muted">
          Biblioteca geral para reutilizar em todos os seus alunos. O treino de cada aluno é montado e editado no perfil
          dele.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card padding="sm">
          <p className="t-value">{activeExercises}</p>
          <p className="t-label">Exercícios na biblioteca</p>
        </Card>
        <Card padding="sm">
          <p className="t-value">{customExercises}</p>
          <p className="t-label">Personalizados</p>
        </Card>
        <Card padding="sm">
          <p className="t-value">{templates.length}</p>
          <p className="t-label">Templates de treino</p>
        </Card>
      </div>

      <Tabs
        items={[
          { id: "exercicios", label: "Exercícios", content: <ExerciseLibrary exercises={exercises} /> },
          {
            id: "templates",
            label: "Templates",
            content: <TemplatesView templates={templates} students={clients.map((c) => ({ id: c.id, name: c.name }))} />,
          },
        ]}
      />

      <Card padding="sm" className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Para montar ou ajustar o treino de um aluno, abra o perfil dele.</p>
        <ButtonLink href="/coach/alunos" variant="secondary" iconAfter="arrow-right">
          Ir para Alunos
        </ButtonLink>
      </Card>
    </div>
  );
}
