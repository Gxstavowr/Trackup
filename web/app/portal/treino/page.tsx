import {
  getActiveWorkoutForClient,
  getCurrentWeekNumber,
  getOpenWorkoutSession,
  getPreviousPerformance,
  getSessionSetLogs,
  getWorkoutDayForSession,
  getCompletedWorkoutDaysForWeek,
  type WorkoutSetLog,
} from "@/lib/repository";
import { pickNextWorkoutDay, resolveCompletedDayIds } from "@/lib/portal-today";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import SessionView from "./session-view";
import DayExerciseList from "./day-preview";
import StartSessionButton from "./start-session-button";
import { Badge } from "@/components/ui/badge";

/**
 * Tela "Treino" do aluno (item 19 do master TODO — execução completa do que o coach construiu
 * no item 18: dia do treino, progresso da sessão, blocos/superset/circuito, vídeo, séries e
 * reps, carga/desempenho anterior, descanso com timer, notas, substituição autorizada, pausar/
 * continuar e resumo final). Só lê o plano PUBLICADO (`getActiveWorkoutForClient` já filtra
 * `is_draft = false` — o aluno nunca vê rascunho, RLS reforça isso no banco de qualquer forma).
 *
 * Duas telas possíveis:
 *  1. Sem sessão aberta -> escolher o dia (o de hoje, por `pickNextWorkoutDay`, em destaque;
 *     qualquer outro dia do plano também pode ser iniciado).
 *  2. Sessão aberta (`in_progress`/`paused`) -> `SessionView`, a execução em si.
 */
export default async function PortalWorkoutPage() {
  const { client } = await requireClient();

  const [plan, weekNumber, openSession] = await Promise.all([
    getActiveWorkoutForClient(client.id),
    getCurrentWeekNumber(client.id),
    getOpenWorkoutSession(client.id),
  ]);

  if (!plan || plan.days.every((d) => d.exercises.length === 0)) {
    return (
      <>
        <PageHeader title="Treino" />
        <EmptyState
          icon="workout"
          title="Nenhum treino publicado ainda"
          text="Seu coach ainda não publicou um treino para você. Assim que estiver pronto, ele aparece aqui."
        />
      </>
    );
  }

  if (openSession) {
    // Busca o dia direto pelo id da sessão (não pelo plano ativo de agora): se o coach
    // republicou o plano NO MEIO desta sessão, o dia original pode não estar mais na versão
    // ativa — `getWorkoutDayForSession` ainda enxerga versões arquivadas (ver seu comentário).
    const day = openSession.day_id ? await getWorkoutDayForSession(openSession.day_id) : null;

    const [logs, previous] = await Promise.all([
      getSessionSetLogs(openSession.id, client.id),
      day
        ? getPreviousPerformance(
            client.id,
            day.exercises.map((we) => we.id),
            openSession.id
          )
        : Promise.resolve(new Map<string, WorkoutSetLog[]>()),
    ]);

    return (
      <SessionView
        clientId={client.id}
        session={openSession}
        day={day}
        initialLogs={logs}
        previousPerformance={Object.fromEntries(previous)}
      />
    );
  }

  const doneDayIds = resolveCompletedDayIds(
    plan.days,
    weekNumber != null ? await getCompletedWorkoutDaysForWeek(client.id, weekNumber) : []
  );
  const { next } = pickNextWorkoutDay(plan.days, doneDayIds);

  return (
    <>
      <PageHeader title="Treino" />
      <section className="flex flex-col gap-5">
        <div>
          <h2 className="break-words text-lg font-medium text-ink">{plan.name}</h2>
          {weekNumber != null && <p className="text-sm text-ink-muted">Semana {weekNumber}</p>}
        </div>

        <ul className="flex flex-col gap-3">
          {plan.days.map((day) => {
            const isNext = next?.id === day.id;
            const list = day.exercises.length > 0 ? <DayExerciseList exercises={day.exercises} /> : null;
            return (
              <li key={day.id} className={`${CARD} flex flex-col gap-3 p-4 ${isNext ? "border-brand/50" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-display text-xl font-bold text-ink">{day.name}</h3>
                    {isNext && <Badge tone="accent">Hoje</Badge>}
                    {!isNext && doneDayIds.has(day.id) && <Badge tone="success">Feito nesta semana</Badge>}
                  </div>
                  <p className="text-sm text-ink-muted">
                    {[
                      `${day.exercises.length} ${day.exercises.length === 1 ? "exercício" : "exercícios"}`,
                      day.duration_min != null && `cerca de ${day.duration_min} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {day.notes && <p className="mt-1 break-words text-xs text-ink-faint">{day.notes}</p>}
                </div>

                {list &&
                  (isNext ? (
                    list
                  ) : (
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm text-ink-muted marker:hidden group-open:mb-2">
                        Ver exercícios
                      </summary>
                      {list}
                    </details>
                  ))}

                {day.exercises.length > 0 && weekNumber != null && (
                  <StartSessionButton
                    clientId={client.id}
                    planId={plan.id}
                    dayId={day.id}
                    weekNumber={weekNumber}
                    primary={isNext}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {weekNumber == null && (
          <p className="text-xs text-ink-faint">
            Não foi possível determinar a semana atual — fale com seu coach se isso persistir.
          </p>
        )}
      </section>
    </>
  );
}
