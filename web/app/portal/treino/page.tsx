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
import { accessForModule, getMyOnboardingStatus } from "@/lib/onboarding/status";
import ModuleLock from "@/components/portal/module-lock";
import ModulePreparing from "@/components/portal/module-preparing";
import SessionView from "./session-view";
import DayExerciseList from "./day-preview";
import StartSessionButton from "./start-session-button";
import { cardioSummary } from "@/lib/workout-session-ui";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProgressRing, StepStrip } from "@/components/viz";

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

  // V5 (itens 15/16): módulo fora do pacote -> cadeado; incluído e não publicado -> em preparação.
  // Retorna ANTES de buscar o plano: o servidor não carrega dados de módulo não liberado.
  // Aluno legado (sem pacote) não passa por aqui: comportamento anterior.
  const status = await getMyOnboardingStatus(client.id);
  if (status.error) {
    return (
      <>
        <PageHeader title="Treino" />
        <p role="status" className="text-sm text-ink-muted">
          Não foi possível carregar seu plano agora. Tente de novo.
        </p>
      </>
    );
  }
  const access = accessForModule(status, "training");
  if (access && access.state !== "available") {
    return (
      <>
        <PageHeader title="Treino" />
        {access.state === "not_contracted" ? (
          <ModuleLock module="training" pkg={status.package} />
        ) : (
          <ModulePreparing
            module="training"
            dueAt={access.dueAt}
            isOverdue={access.isOverdue}
            awaitingQuestionnaire={access.state === "awaiting_questionnaire"}
          />
        )}
      </>
    );
  }

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
        serverNow={new Date().toISOString()}
        previousPerformance={Object.fromEntries(previous)}
      />
    );
  }

  const doneDayIds = resolveCompletedDayIds(
    plan.days,
    weekNumber != null ? await getCompletedWorkoutDaysForWeek(client.id, weekNumber) : []
  );
  const { next } = pickNextWorkoutDay(plan.days, doneDayIds);
  // Painel da semana (V5): só dias com exercício contam — dia vazio não é "treino a fazer".
  const trainingDays = plan.days.filter((d) => d.exercises.length > 0);
  const doneCount = trainingDays.filter((d) => doneDayIds.has(d.id)).length;
  const weekComplete = trainingDays.length > 0 && doneCount === trainingDays.length;

  return (
    <>
      <PageHeader title="Treino" />
      <section className="flex flex-col gap-5">
        {/* Composição de abertura: anel da semana + linha do tempo dos dias (em vez de só texto). */}
        <div className="tk-enter relative overflow-hidden rounded-[var(--radius-xl)] border border-line-strong bg-surface-raised p-4 shadow-[var(--surface-raised-shadow)] sm:p-5">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand-tint blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="min-w-0 flex-1">
              {weekNumber != null && <span className="t-kicker text-brand">Semana {weekNumber}</span>}
              <h2 className="t-subtitle mt-1 break-words text-ink">{plan.name}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {weekComplete
                  ? "Todos os treinos da semana feitos."
                  : `${doneCount} de ${trainingDays.length} ${trainingDays.length === 1 ? "treino feito" : "treinos feitos"} nesta semana`}
              </p>
            </div>
            {weekNumber != null && trainingDays.length > 0 && (
              <ProgressRing
                value={doneCount}
                max={trainingDays.length}
                label="Treinos feitos nesta semana"
                size={76}
                thickness={8}
                tone={weekComplete ? "success" : "accent"}
              >
                <span className="text-base">
                  {doneCount}
                  <span className="text-ink-faint">/{trainingDays.length}</span>
                </span>
              </ProgressRing>
            )}
          </div>
          {weekNumber != null && trainingDays.length > 1 && (
            <StepStrip
              label="Dias de treino desta semana"
              className="relative mt-4 border-t border-line pt-4"
              steps={trainingDays.map((d) => ({
                key: d.id,
                label: d.name,
                state: doneDayIds.has(d.id) ? "done" : next?.id === d.id ? "current" : "upcoming",
              }))}
            />
          )}
        </div>

        <ul className="tk-stagger flex flex-col gap-3">
          {plan.days.map((day) => {
            const isNext = next?.id === day.id;
            const cardio = cardioSummary(day.exercises);
            const list = day.exercises.length > 0 ? <DayExerciseList exercises={day.exercises} /> : null;
            return (
              <li key={day.id} className={`${CARD} flex flex-col gap-3 p-4 ${isNext ? "border-brand/50 shadow-[inset_3px_0_0_var(--brand)]" : ""}`}>
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
                  {cardio && (
                    <p className="mt-1.5">
                      <Badge tone="warning">{cardio.label}</Badge>
                    </p>
                  )}
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

        <Link href="/portal/avaliacao#mudancas" className="inline-flex min-h-11 items-center self-start text-sm text-ink-muted hover:text-ink hover:underline">
          Ver histórico de mudanças
        </Link>
      </section>
    </>
  );
}
