import Link from "next/link";
import type { ReactNode } from "react";
import {
  computeWeekInfo,
  getActiveNutritionPlanForClient,
  getActiveWorkoutForClient,
  getCurrentCheckin,
  getCompletedWorkoutDaysForWeek,
  getMealLogsForDate,
  getOpenWorkoutSession,
  getWeightProgress,
  getWorkoutLogsForWeek,
} from "@/lib/repository";
import { getMyLatestSentOrientation, type SentOrientation } from "@/lib/evaluations";
import { getEffectiveClientMetrics, isWeightTracked } from "@/lib/metrics-settings";
import { mealKcal, formatKcalSum } from "@/lib/meal-kcal";
import type { ClockLogStatus } from "@/lib/meal-clock";
import {
  checkinWindow,
  formatLongDate,
  getSaoPauloClock,
  greetingFor,
  isTodaySP,
  pickNextWorkoutDay,
  pickWorkoutCardMode,
  resolveCompletedDayIds,
  todayDateSP,
} from "@/lib/portal-today";
import Icon from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/button";
import { CARD, ICONS } from "./portal-ui";
import { requireClient } from "./require-client";
import ExpandableText from "./expandable-text";
import { MealClockProvider, NextMealCard, type NextMealDetail } from "./meal-clock";
import { accessForModule, getMyOnboardingStatus, hasRecentProtocolReady, type MyOnboardingStatus } from "@/lib/onboarding/status";
import { MODULE_LABELS, modulesOf, packageLabel, type ModuleId } from "@/lib/onboarding/packages";
import { studentStageText } from "@/lib/onboarding/stage";
import { Badge } from "@/components/ui/badge";
import CheckinCard from "./checkin/checkin-card";
import { pickCheckinCardState } from "@/lib/checkin-card-state";

/**
 * Home do aluno (V3 tarefa 8) — responde "o que eu preciso fazer hoje?" em três prioridades:
 *
 *  1. AÇÃO IMPORTANTE AGORA: o card amarelo do check-in quando a janela está aberta e ele não
 *     foi enviado (ou a faixa "Enviado — seu coach está avaliando").
 *  2. AGENDA DE HOJE: treino de hoje (próximo dia da sequência sem sessão concluída na semana) e
 *     próxima refeição com horário/contagem AO VIVO (`NextMealCard`, relógio compartilhado com a
 *     Nutrição — `app/portal/meal-clock.tsx` + `lib/meal-clock.ts`). Um botão por bloco.
 *  3. MENSAGEM DO COACH + progresso compacto (link para /portal/progresso).
 *
 * Nada publicado pelo coach -> "Seu coach está preparando seu plano" no lugar da agenda.
 * O check-in mora em `/portal/checkin` (sem aba própria), respeitando a janela
 * (`checkinWindow`: sex/sáb/dom aberto, quinta lembrete, seg–qua fechado).
 */

type Tone = "action" | "ok" | "warn" | "muted";
type Accent = "brand" | "mint" | "orange";

type TodayItem = {
  key: "checkin" | "treino";
  eyebrow: string;
  title: string;
  detail: string;
  /** Rótulos curtos (ex.: "6 exercícios"). */
  chips: string[];
  href: string;
  cta: string;
  tone: Tone;
  accent: Accent;
  /** Pede uma ação do aluno agora. */
  actionable: boolean;
  /** O coach já publicou/configurou o que esse item precisa (plano, perguntas...). */
  configured: boolean;
  /** Aparece como linha compacta quando não é a ação principal. */
  listed: boolean;
  icon: ReactNode;
};

export default async function PortalHomePage() {
  const { client } = await requireClient();

  const now = new Date();
  const clock = getSaoPauloClock(now);
  const week = client.start_date ? computeWeekInfo(client.start_date, now) : null;
  const firstName = client.name.trim().split(/\s+/)[0] || client.name;

  // V5 (itens 11/15/16/20): pacote, módulos liberados e estágio do onboarding. Aluno legado
  // (sem pacote) segue exatamente o caminho anterior.
  const status = await getMyOnboardingStatus(client.id);
  if (status.error) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="break-words font-display text-hero text-ink">
            {greetingFor(clock.hour)}, <span className="text-brand">{firstName}</span>
          </h1>
        </header>
        <p role="status" className="text-sm text-ink-muted">
          Não foi possível carregar seu plano agora. Tente de novo.
        </p>
      </div>
    );
  }
  const publishedCount = Number(status.published.training) + Number(status.published.nutrition);

  // Questionário enviado e nada publicado ainda: experiência de preparação no lugar da agenda.
  if (status.onboardingRequired && status.questionnaireStatus === "submitted" && publishedCount === 0) {
    return (
      <div className="tk-stagger flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <span className="t-label text-ink-faint first-letter:uppercase">{formatLongDate(now)}</span>
          <h1 className="break-words font-display text-hero text-ink">
            {greetingFor(clock.hour)}, <span className="text-brand">{firstName}</span>
          </h1>
        </header>
        <ProtocolSummary status={status} />
      </div>
    );
  }

  // Treino/nutrição só são buscados se o módulo estiver liberado para o aluno (legado = como antes).
  const trainingAccess = accessForModule(status, "training");
  const nutritionAccess = accessForModule(status, "nutrition");
  const canTraining = trainingAccess === null || trainingAccess.state === "available";
  const canNutrition = nutritionAccess === null || nutritionAccess.state === "available";
  // Check-in semanal: aluno novo (onboarding_required) só o recebe depois de ao menos um módulo
  // publicado; legado inalterado.
  const checkinReleased = !status.onboardingRequired || publishedCount > 0;
  const showProtocolReady = status.onboardingRequired && !status.legacy && (await hasRecentProtocolReady());

  const [checkin, orientation, workout, nutrition, logs, doneDays, weight, metrics, mealLogsToday, openSession] = await Promise.all([
    checkinReleased ? getCurrentCheckin(client.id) : Promise.resolve(null),
    getMyLatestSentOrientation(),
    canTraining ? getActiveWorkoutForClient(client.id) : Promise.resolve(null),
    canNutrition ? getActiveNutritionPlanForClient(client.id) : Promise.resolve(null),
    week && canTraining ? getWorkoutLogsForWeek(client.id, week.weekNumber) : Promise.resolve([]),
    week && canTraining ? getCompletedWorkoutDaysForWeek(client.id, week.weekNumber) : Promise.resolve([]),
    getWeightProgress(client.id),
    getEffectiveClientMetrics(client.id),
    canNutrition ? getMealLogsForDate(client.id, todayDateSP(now)) : Promise.resolve([]),
    // Mesma fonte de `/portal/treino`: com sessão aberta, a Home oferece "Continuar treino".
    canTraining ? getOpenWorkoutSession(client.id) : Promise.resolve(null),
  ]);
  // Item 17: se o coach parou de acompanhar peso pra ESTE aluno, a Home não mostra nem o campo
  // vazio (sem linha em client_metric_settings = continua mostrando, igual sempre mostrou).
  const weightForHome = isWeightTracked(metrics) ? weight : null;
  // Sessões de uma versão anterior do plano (republicado no meio da semana) continuam contando.
  const doneDayIds = resolveCompletedDayIds(workout?.days ?? [], doneDays);

  const checkinState = pickCheckinCardState({
    released: checkinReleased,
    instance: checkin ? { status: checkin.instance.status, weekNumber: checkin.instance.week_number } : null,
    questionCount: checkin?.questions.length ?? 0,
    window: checkinWindow(now),
  });
  // Aberto/enviado/avaliado: é o "agora" do aluno e fica no topo; os demais ficam depois da agenda.
  const checkinOnTop = checkinState.kind === "open" || checkinState.kind === "submitted" || checkinState.kind === "reviewed";
  const checkinConfigured = ["open", "submitted", "reviewed", "before_open"].includes(checkinState.kind);
  const workoutItem = buildWorkoutItem(workout, logs, doneDayIds, openSession, now);
  const hasMeals = !!nutrition && nutrition.meals.length > 0;
  const checkinHero = checkinState.kind === "open";
  // Nada publicado/iniciado pelo coach em NENHUM item: não dá pra mostrar agenda vazia.
  const nothingConfigured = status.legacy && !checkinConfigured && !workoutItem.configured && !hasMeals;

  // Relógio de refeições: só dados serializáveis vão para o cliente.
  const clockMeals = hasMeals
    ? nutrition.meals.map((m) => ({ id: m.id, name: m.name, time: m.time, day_of_week: m.day_of_week }))
    : [];
  const mealStatuses: Record<string, ClockLogStatus> = {};
  for (const log of mealLogsToday) if (log.meal_id) mealStatuses[log.meal_id] = log.status;
  const mealDetails: Record<string, NextMealDetail> = {};
  if (hasMeals) {
    for (const m of nutrition.meals) {
      const kcal = mealKcal(m);
      mealDetails[m.id] = { foods: m.items.length, kcal: m.items.length > 0 && kcal.kcal != null ? formatKcalSum(kcal) : null };
    }
  }

  const focus = orientation?.focus?.trim() || client.objective?.trim() || null;

  const workoutProgress = workout ? pickNextWorkoutDay(workout.days, doneDayIds) : null;

  return (
    <div className="tk-stagger flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="t-label text-ink-faint first-letter:uppercase">{formatLongDate(now)}</span>
        <h1 className="break-words font-display text-hero text-ink">
          {greetingFor(clock.hour)}, <span className="text-brand">{firstName}</span>
        </h1>
        {focus && (
          <p className="inline-flex min-w-0 max-w-full items-start gap-2 self-start rounded-md border border-line bg-surface px-3 py-2 text-sm">
            <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
              <Icon name="tracking" size={16} />
            </span>
            <span className="min-w-0 break-words text-ink-muted">
              <span className="font-semibold text-ink">Foco: </span>
              {focus}
            </span>
          </p>
        )}
      </header>

      {showProtocolReady && <ProtocolReadyBanner status={status} />}
      {!status.legacy && publishedCount > 0 && status.stage.stage === "protocol_partial" && <ProtocolSummary status={status} compact />}

      {/* 1. Ação importante agora */}
      {checkinOnTop && <CheckinCard state={checkinState} />}

      {/* 2. Agenda de hoje */}
      {nothingConfigured ? (
        <PreparingCard />
      ) : (
        <section aria-label="Sua agenda de hoje" className="flex flex-col gap-3">
          <h2 className="t-label text-ink-faint">Hoje</h2>
          {canTraining ? (
            <WorkoutCard item={workoutItem} primary={!checkinHero} />
          ) : (
            <ModuleStatusRow module="training" state={trainingAccess?.state} />
          )}
          {!canNutrition ? (
            <ModuleStatusRow module="nutrition" state={nutritionAccess?.state} />
          ) : hasMeals ? (
            <MealClockProvider meals={clockMeals} statuses={mealStatuses} initialNowMs={now.getTime()}>
              <NextMealCard details={mealDetails} />
            </MealClockProvider>
          ) : (
            <MutedAgendaCard
              href="/portal/nutricao"
              icon={ICONS.nutrition}
              eyebrow="Nutrição"
              title="Ainda sem plano alimentar"
              detail={
                nutrition
                  ? "O plano publicado ainda não tem refeições."
                  : "Seu coach ainda não publicou um plano de nutrição."
              }
            />
          )}
        </section>
      )}

      {/* Check-in sempre visível: bloqueado/indisponível ficam depois da agenda */}
      {!checkinOnTop && <CheckinCard state={checkinState} />}

      {/* 3. Coach + progresso */}
      {orientation && <CoachMessage orientation={orientation} />}

      {week && (
        <ProgressSummary
          weekNumber={week.weekNumber}
          workoutProgress={workoutProgress}
          weight={weightForHome}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Montagem dos itens do dia
// ----------------------------------------------------------------------------

function buildWorkoutItem(
  plan: Awaited<ReturnType<typeof getActiveWorkoutForClient>>,
  logs: { exercise_id: string; completed_at: string }[],
  doneDayIds: Set<string>,
  openSession: Awaited<ReturnType<typeof getOpenWorkoutSession>>,
  now: Date
): TodayItem {
  const base = {
    key: "treino" as const,
    href: "/portal/treino",
    icon: ICONS.workout,
    chips: [] as string[],
    accent: "brand" as Accent,
  };

  if (!plan || plan.days.every((d) => d.exercises.length === 0)) {
    return {
      ...base,
      eyebrow: "Treino",
      title: "Ainda sem treino",
      detail: plan
        ? "O treino publicado ainda não tem exercícios."
        : "Seu coach ainda não publicou um treino para você.",
      cta: "Ver treino",
      tone: "muted",
      actionable: false,
      configured: false,
      listed: true,
    };
  }

  const { next, doneCount, totalCount } = pickNextWorkoutDay(plan.days, doneDayIds);
  const trainedToday = logs.some((l) => isTodaySP(l.completed_at, now));
  const mode = pickWorkoutCardMode({ hasOpenSession: !!openSession, trainedToday, hasNext: !!next });

  if (mode === "continue" && openSession) {
    // O dia da sessão pode ser de uma versão anterior do plano (republicado no meio): sem nome
    // no plano ativo, cai num título genérico — `/portal/treino` resolve o dia pelo `day_id`.
    const day = plan.days.find((d) => d.id === openSession.day_id);
    const paused = openSession.status === "paused";
    return {
      ...base,
      eyebrow: paused ? "Treino pausado" : "Treino em andamento",
      title: day?.name ?? "Treino em andamento",
      detail: paused ? "Você pausou este treino. Continue de onde parou." : "Continue de onde parou.",
      cta: "Continuar treino",
      tone: "action",
      actionable: true,
      configured: true,
      listed: true,
    };
  }
  if (mode === "done_today") {
    return {
      ...base,
      accent: "mint",
      eyebrow: "Treino de hoje",
      title: "Treino de hoje concluído",
      detail: next ? `Próximo da sequência: ${next.name}.` : "Você completou os treinos da semana.",
      cta: "Ver treino",
      tone: "ok",
      actionable: false,
      configured: true,
      listed: true,
    };
  }
  if (mode === "week_done" || !next) {
    return {
      ...base,
      accent: "mint",
      eyebrow: "Treino",
      title: "Treinos da semana concluídos",
      detail: `${doneCount} de ${totalCount} ${totalCount === 1 ? "treino" : "treinos"}. Bom trabalho.`,
      cta: "Ver treino",
      tone: "ok",
      actionable: false,
      configured: true,
      listed: true,
    };
  }

  const exercises = next.exercises.length;
  const chips = [
    `${exercises} ${exercises === 1 ? "exercício" : "exercícios"}`,
    next.duration_min ? `~${next.duration_min} min` : null,
  ].filter(Boolean) as string[];
  return {
    ...base,
    eyebrow: "Treino de hoje",
    title: next.name,
    detail: chips.join(" · "),
    chips,
    cta: "Começar treino",
    tone: "action",
    actionable: true,
    configured: true,
    listed: true,
  };
}

// ----------------------------------------------------------------------------
// Componentes
// ----------------------------------------------------------------------------

/** Linha da agenda para módulo que não está liberado: cadeado (fora do pacote) ou em preparação. */
function ModuleStatusRow({ module, state }: { module: ModuleId; state: string | undefined }) {
  const locked = state === "not_contracted";
  const label = MODULE_LABELS[module];
  return (
    <MutedAgendaCard
      href={module === "training" ? "/portal/treino" : "/portal/nutricao"}
      icon={module === "training" ? ICONS.workout : ICONS.nutrition}
      eyebrow={label}
      title={locked ? `${label} não faz parte do seu pacote` : `Seu coach está preparando o seu ${module === "training" ? "treino" : "plano alimentar"}`}
      detail={locked ? "Toque para ver como seria e falar com o seu coach." : "Aparece aqui assim que for publicado."}
    />
  );
}

const DUE_FMT = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "Seu protocolo está pronto" (aparece por poucos dias após a notificação protocol_ready). */
function ProtocolReadyBanner({ status }: { status: MyOnboardingStatus }) {
  const modules = modulesOf(status.package);
  return (
    <section
      aria-label="Seu protocolo está pronto"
      className="relative flex flex-col gap-3 overflow-hidden rounded-lg border border-success/30 bg-success-tint p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-on-accent">
          <Icon name="check" size={20} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold text-ink">Seu protocolo está pronto</h2>
          <p className="text-sm text-ink-muted">Seu coach publicou o que você precisa para começar. Suas respostas do questionário ficam guardadas.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {modules.map((m) => (
          <Link
            key={m}
            href={m === "training" ? "/portal/treino" : "/portal/nutricao"}
            className={buttonClass({ variant: "secondary", size: "md" })}
          >
            Abrir {MODULE_LABELS[m].toLowerCase()}
          </Link>
        ))}
        <Link href="/portal/onboarding/respostas" className={buttonClass({ variant: "tertiary", size: "md" })}>
          Ver minhas respostas
        </Link>
      </div>
    </section>
  );
}

/**
 * Resumo do protocolo em preparação (ou parcialmente pronto): estado por módulo, prazo real
 * (`protocol_due_at`) e atalho para as respostas enviadas. Sem upsell.
 */
function ProtocolSummary({ status, compact = false }: { status: MyOnboardingStatus; compact?: boolean }) {
  const modules = modulesOf(status.package);
  const info = status.stage;
  const dueText = info.dueAt && !compact ? DUE_FMT.format(info.dueAt) : null;
  return (
    <section aria-labelledby="home-prep" className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-col gap-2">
        <Badge tone={info.isOverdue ? "warning" : "accent"} dot>
          {compact ? "Parcialmente pronto" : "Em preparação"}
        </Badge>
        <h2 id="home-prep" className="font-display text-2xl font-bold leading-tight text-ink">
          {compact ? "Parte do seu protocolo já está pronta" : "Seu protocolo está sendo preparado"}
        </h2>
        <p className="text-sm text-ink-muted">
          {studentStageText(info, status.package)}
          {status.package ? ` · pacote ${packageLabel(status.package)}` : ""}
        </p>
      </div>
      {dueText && (
        <p className="flex items-start gap-2 text-sm text-ink">
          <Icon name="calendar" size={18} className={info.isOverdue ? "mt-0.5 text-warning" : "mt-0.5 text-brand"} />
          {info.isOverdue ? (
            <span>A previsão era <strong className="font-semibold">{dueText}</strong>. Seu coach ainda está finalizando.</span>
          ) : (
            <span>Previsão de entrega: <strong className="font-semibold">até {dueText}</strong></span>
          )}
        </p>
      )}
      {modules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {modules.map((m) => {
            const ready = status.published[m];
            return (
              <li key={m} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3">
                <span className="text-sm font-semibold text-ink">{MODULE_LABELS[m]}</span>
                {ready ? (
                  <Link href={m === "training" ? "/portal/treino" : "/portal/nutricao"} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-success">
                    Pronto · abrir <Icon name="chevron" size={16} />
                  </Link>
                ) : (
                  <Badge tone="neutral">Em preparação</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/portal/onboarding/respostas" className={buttonClass({ variant: "secondary", size: "md", width: "mobile" })}>
        Ver respostas enviadas
      </Link>
    </section>
  );
}

/**
 * Treino de hoje na agenda: nome do treino em destaque, exercícios/duração e UM botão. O botão
 * só é amarelo cheio quando não há check-in aberto disputando a atenção.
 */
function WorkoutCard({ item, primary }: { item: TodayItem; primary: boolean }) {
  if (item.tone === "muted") {
    return <MutedAgendaCard href={item.href} icon={item.icon} eyebrow={item.eyebrow} title={item.title} detail={item.detail} />;
  }
  const done = item.tone === "ok";
  return (
    <section
      aria-label="Treino de hoje"
      className={`flex flex-col gap-3 rounded-lg border p-5 ${done ? "border-success/30 bg-success-tint" : "card"}`}
    >
      <span className={`inline-flex items-center gap-2 ${done ? "text-success" : "text-ink-muted"}`}>
        {done ? <Icon name="check" size={20} strokeWidth={2.5} /> : item.icon}
        <span className="t-label">{item.eyebrow}</span>
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="break-words font-display text-2xl font-extrabold leading-tight text-ink">{item.title}</h3>
        {item.detail && <p className="break-words text-base text-ink-muted">{item.detail}</p>}
      </div>
      {done ? (
        <Link href={item.href} className={buttonClass({ variant: "tertiary", size: "md", width: "full" })}>
          {item.cta}
          <Icon name="chevron" size={16} />
        </Link>
      ) : (
        <Link href={item.href} className={buttonClass({ variant: primary ? "primary" : "secondary", size: "lg", width: "full" })}>
          {item.cta}
          <Icon name="arrow-right" size={18} />
        </Link>
      )}
    </section>
  );
}

/** Bloco da agenda sem nada configurado ainda: neutro, o card inteiro é o link. */
function MutedAgendaCard({
  href,
  icon,
  eyebrow,
  title,
  detail,
}: {
  href: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className={`${CARD} flex min-h-16 items-center gap-3.5 px-4 py-4 transition-colors hover:border-line-strong`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-ink-faint">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-label text-ink-faint">{eyebrow}</span>
        <span className="break-words text-base font-semibold text-ink">{title}</span>
        <span className="break-words text-sm text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-ink-faint">{ICONS.chevron}</span>
    </Link>
  );
}

/** Nenhum item tem nada publicado/iniciado pelo coach: honesto, sem prometer "tudo em dia". */
function PreparingCard() {
  return (
    <section aria-label="Sua ação de hoje" className={`${CARD} flex flex-col gap-1.5 p-5`}>
      <span className="t-label text-warning">Em preparação</span>
      <h2 className="font-display text-2xl leading-tight text-ink">
        Seu coach está preparando seu plano
      </h2>
      <p className="text-sm text-ink-muted">
        Assim que ele publicar seu treino, seu plano alimentar e o check-in, o que fazer hoje aparece
        aqui.
      </p>
    </section>
  );
}

/** Orientação mais recente enviada pelo coach (somente leitura; nunca rascunho nem nota privada). */
function CoachMessage({ orientation }: { orientation: SentOrientation }) {
  return (
    <section
      aria-label="Mensagem do coach"
      className={`${CARD} flex flex-col gap-2 border-l-2 border-l-brand p-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="t-label text-brand">Mensagem do seu coach</h2>
        <span className="tabular-nums text-xs text-ink-faint">
          Semana {orientation.weekNumber} · {formatShortDate(orientation.sentAt)}
        </span>
      </div>
      <ExpandableText text={orientation.text} />
      <Link href="/portal/avaliacao" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand hover:underline">
        Ver avaliação semanal
      </Link>
    </section>
  );
}

/** Resumo pequeno do progresso — o card inteiro leva para /portal/progresso. */
function ProgressSummary({
  weekNumber,
  workoutProgress,
  weight,
}: {
  weekNumber: number;
  workoutProgress: { doneCount: number; totalCount: number } | null;
  weight: { first: number; latest: number; weeks: number } | null;
}) {
  const hasWorkouts = !!workoutProgress && workoutProgress.totalCount > 0;
  const pct = hasWorkouts
    ? Math.round((workoutProgress.doneCount / workoutProgress.totalCount) * 100)
    : 0;
  const delta = weight ? weight.latest - weight.first : 0;

  return (
    <Link
      href="/portal/progresso"
      aria-label="Ver meu progresso"
      className={`${CARD} flex flex-col gap-4 p-5 transition-colors hover:border-line-strong`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-label text-ink-faint">Seu progresso · Semana {weekNumber}</h2>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand">
          Ver tudo
          <Icon name="chevron" size={16} />
        </span>
      </div>

      {hasWorkouts || weight ? (
        <div className="grid grid-cols-2 gap-4">
          {hasWorkouts && (
            <div className="flex min-w-0 flex-col gap-2">
              <span className="font-display text-3xl font-extrabold leading-none tabular-nums text-ink">
                {workoutProgress.doneCount}
                <span className="text-lg text-ink-faint">/{workoutProgress.totalCount}</span>
              </span>
              <span className="text-xs text-ink-muted">treinos na semana</span>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={workoutProgress.totalCount}
                aria-valuenow={workoutProgress.doneCount}
                aria-label="Treinos concluídos na semana"
                className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
              >
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {weight && (
            <div className="flex min-w-0 flex-col gap-2">
              <span className="font-display text-3xl font-extrabold leading-none tabular-nums text-ink">
                {formatKg(weight.latest)}
                <span className="text-lg text-ink-faint"> kg</span>
              </span>
              <span className="text-xs text-ink-muted">
                {weight.weeks > 1
                  ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatKg(Math.abs(delta))} kg desde o início`
                  : "peso atual"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Seus treinos concluídos e o seu peso aparecem aqui conforme você avança.
        </p>
      )}
    </Link>
  );
}

// ----------------------------------------------------------------------------
// Formatação
// ----------------------------------------------------------------------------

function formatKg(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}
