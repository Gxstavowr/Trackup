import Link from "next/link";
import type { ReactNode } from "react";
import {
  computeWeekInfo,
  getActiveNutritionPlanForClient,
  getActiveWorkoutForClient,
  getCurrentCheckin,
  getWeightProgress,
  getWorkoutLogsForWeek,
} from "@/lib/repository";
import { getMyLatestSentOrientation, type SentOrientation } from "@/lib/evaluations";
import { getEffectiveClientMetrics, isWeightTracked } from "@/lib/metrics-settings";
import {
  checkinWindow,
  formatLongDate,
  getSaoPauloClock,
  greetingFor,
  isTodaySP,
  pickNextMeal,
  pickNextWorkoutDay,
} from "@/lib/portal-today";
import { BUTTON_PRIMARY, CARD, ICONS } from "./portal-ui";
import { requireClient } from "./require-client";

/**
 * Home do aluno (item 24) — responde UMA pergunta: "o que eu preciso fazer hoje?". Ordem da tela:
 * saudação + data + foco -> UMA ação principal (hero) -> mensagem do coach -> o resto do dia
 * (linhas compactas) -> progresso da semana. Sem KPIs soltos, sem gráficos.
 *
 * Prioridade da ação principal: check-in (se a janela está aberta e ele ainda não foi enviado)
 * > treino de hoje > próxima refeição (só se ainda há refeição hoje). Nenhuma das três
 * pendente -> "Tudo em dia" (sem botão) SE o coach já configurou algo; se NENHUM item está
 * configurado (sem plano, sem treino, sem perguntas de check-in), "Seu coach está preparando
 * seu plano" — nunca "tudo em dia" para quem simplesmente ainda não tem nada.
 *
 * O check-in em si mora em `/portal/checkin` (aba própria); esta tela só mostra o estado e leva
 * até lá respeitando a janela (`checkinWindow`: sex/sáb/dom aberto, quinta lembrete, seg–qua
 * fechado).
 */

type Tone = "action" | "ok" | "warn" | "muted";

type TodayItem = {
  key: "checkin" | "treino" | "nutricao";
  eyebrow: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: Tone;
  /** Pode virar a ação principal do dia. */
  actionable: boolean;
  /** O coach já publicou/configurou o que esse item precisa (plano, perguntas...). */
  configured: boolean;
  icon: ReactNode;
};

export default async function PortalHomePage() {
  const { client } = await requireClient();

  const now = new Date();
  const clock = getSaoPauloClock(now);
  const week = client.start_date ? computeWeekInfo(client.start_date, now) : null;

  const [checkin, orientation, workout, nutrition, logs, weight, metrics] = await Promise.all([
    getCurrentCheckin(client.id),
    getMyLatestSentOrientation(),
    getActiveWorkoutForClient(client.id),
    getActiveNutritionPlanForClient(client.id),
    week ? getWorkoutLogsForWeek(client.id, week.weekNumber) : Promise.resolve([]),
    getWeightProgress(client.id),
    getEffectiveClientMetrics(client.id),
  ]);
  // Item 17: se o coach parou de acompanhar peso pra ESTE aluno, a Home não mostra nem o campo
  // vazio (sem linha em client_metric_settings = continua mostrando, igual sempre mostrou).
  const weightForHome = isWeightTracked(metrics) ? weight : null;

  const items: TodayItem[] = [
    buildCheckinItem(checkin, checkinWindow(now)),
    buildWorkoutItem(workout, logs, now),
    buildMealItem(nutrition, clock.minutes),
  ];
  const primary = items.find((item) => item.actionable) ?? null;
  const rest = items.filter((item) => item !== primary);
  // Nada publicado/iniciado pelo coach em NENHUM item: não dá pra dizer "tudo em dia".
  const nothingConfigured = items.every((item) => !item.configured);

  const firstName = client.name.trim().split(/\s+/)[0] || client.name;
  const focus = orientation?.focus?.trim() || client.objective?.trim() || null;

  const workoutProgress = workout
    ? pickNextWorkoutDay(workout.days, new Set(logs.map((l) => l.exercise_id)))
    : null;

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
          {formatLongDate(now)}
        </span>
        <h1 className="break-words font-display text-hero text-ink">
          {greetingFor(clock.hour)}, {firstName}
        </h1>
        {focus && (
          <p className="min-w-0 break-words text-sm text-ink-muted">
            <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
              Foco atual
            </span>
            <span className="mt-0.5 block break-words text-brand">{focus}</span>
          </p>
        )}
      </header>

      {primary ? (
        <PrimaryCard item={primary} />
      ) : nothingConfigured ? (
        <PreparingCard />
      ) : (
        <AllDoneCard />
      )}

      {orientation && <CoachMessage orientation={orientation} />}

      {rest.length > 0 && (
        <section aria-label="O resto do seu dia" className="flex flex-col gap-2.5">
          <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">
            {primary ? "Também hoje" : "Seu dia"}
          </h2>
          <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
            {rest.map((item) => (
              <li key={item.key}>
                <TodayRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {week && (
        <WeekProgress
          weekNumber={week.weekNumber}
          startDate={client.start_date}
          workoutProgress={workoutProgress}
          weight={weightForHome}
        />
      )}
    </>
  );
}

// ----------------------------------------------------------------------------
// Montagem dos itens do dia
// ----------------------------------------------------------------------------

function buildCheckinItem(
  checkin: Awaited<ReturnType<typeof getCurrentCheckin>>,
  win: ReturnType<typeof checkinWindow>
): TodayItem {
  const base = {
    key: "checkin" as const,
    eyebrow: "Check-in",
    href: "/portal/checkin",
    icon: ICONS.checkin,
  };

  if (!checkin) {
    return {
      ...base,
      title: "Ainda não disponível",
      detail: "Seu coach está finalizando o seu cadastro.",
      cta: "Ver check-in",
      tone: "muted",
      actionable: false,
      configured: false,
    };
  }

  const { instance } = checkin;

  if (instance.status === "reviewed") {
    return {
      ...base,
      title: `Semana ${instance.week_number} concluída`,
      detail: "Seu coach avaliou e enviou a orientação.",
      cta: "Ver check-in",
      tone: "ok",
      actionable: false,
      configured: true,
    };
  }
  if (instance.status === "submitted") {
    return {
      ...base,
      title: "Enviado",
      detail: "Aguardando a avaliação do seu coach.",
      cta: "Ver check-in",
      tone: "ok",
      actionable: false,
      configured: true,
    };
  }
  if (checkin.questions.length === 0) {
    return {
      ...base,
      title: "Ainda não configurado",
      detail: "Seu coach ainda não montou as perguntas do check-in.",
      cta: "Ver check-in",
      tone: "muted",
      actionable: false,
      configured: false,
    };
  }

  if (win.state === "open") {
    return {
      ...base,
      eyebrow: "Check-in aberto",
      title: `Check-in da semana ${instance.week_number}`,
      detail: `Responda até ${win.closesLabel}. É por ele que seu coach ajusta o seu plano.`,
      cta: "Fazer check-in",
      tone: "action",
      actionable: true,
      configured: true,
    };
  }
  if (win.state === "reminder") {
    return {
      ...base,
      title: "Abre amanhã",
      detail: `Reserve um momento amanhã para o check-in da semana ${instance.week_number}.`,
      cta: "Ver check-in",
      tone: "warn",
      actionable: false,
      configured: true,
    };
  }
  return {
    ...base,
    title: "Abre na sexta-feira",
    detail: `Em ${win.daysUntilOpen} ${win.daysUntilOpen === 1 ? "dia" : "dias"}. Até lá, é só seguir o plano.`,
    cta: "Ver check-in",
    tone: "muted",
    actionable: false,
    configured: true,
  };
}

function buildWorkoutItem(
  plan: Awaited<ReturnType<typeof getActiveWorkoutForClient>>,
  logs: { exercise_id: string; completed_at: string }[],
  now: Date
): TodayItem {
  const base = {
    key: "treino" as const,
    href: "/portal/treino",
    icon: ICONS.workout,
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
    };
  }

  const { next, doneCount, totalCount } = pickNextWorkoutDay(
    plan.days,
    new Set(logs.map((l) => l.exercise_id))
  );
  const trainedToday = logs.some((l) => isTodaySP(l.completed_at, now));

  if (trainedToday) {
    return {
      ...base,
      eyebrow: "Treino de hoje",
      title: "Treino de hoje concluído",
      detail: next ? `Próximo da sequência: ${next.name}.` : "Você completou os treinos da semana.",
      cta: "Ver treino",
      tone: "ok",
      actionable: false,
      configured: true,
    };
  }
  if (!next) {
    return {
      ...base,
      eyebrow: "Treino",
      title: "Treinos da semana concluídos",
      detail: `${doneCount} de ${totalCount} ${totalCount === 1 ? "treino" : "treinos"}. Bom trabalho.`,
      cta: "Ver treino",
      tone: "ok",
      actionable: false,
      configured: true,
    };
  }

  const exercises = next.exercises.length;
  return {
    ...base,
    eyebrow: "Treino de hoje",
    title: next.name,
    detail: [
      `${exercises} ${exercises === 1 ? "exercício" : "exercícios"}`,
      next.duration_min ? `cerca de ${next.duration_min} min` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    cta: "Ver treino",
    tone: "action",
    actionable: true,
    configured: true,
  };
}

function buildMealItem(
  plan: Awaited<ReturnType<typeof getActiveNutritionPlanForClient>>,
  nowMinutes: number
): TodayItem {
  const base = {
    key: "nutricao" as const,
    href: "/portal/nutricao",
    icon: ICONS.nutrition,
  };

  if (!plan || plan.meals.length === 0) {
    return {
      ...base,
      eyebrow: "Nutrição",
      title: "Ainda sem plano alimentar",
      detail: plan
        ? "O plano publicado ainda não tem refeições."
        : "Seu coach ainda não publicou um plano de nutrição.",
      cta: "Ver nutrição",
      tone: "muted",
      actionable: false,
      configured: false,
    };
  }

  const next = pickNextMeal(plan.meals, nowMinutes);
  if (!next) {
    return {
      ...base,
      eyebrow: "Nutrição",
      title: "Sem refeições",
      detail: "O plano ainda não tem refeições.",
      cta: "Ver nutrição",
      tone: "muted",
      actionable: false,
      configured: false,
    };
  }

  const time = next.meal.time ? next.meal.time.slice(0, 5) : null;
  const foods = next.meal.items.length;
  const foodsLabel = foods > 0 ? `${foods} ${foods === 1 ? "alimento" : "alimentos"}` : null;

  if (next.when === "today") {
    return {
      ...base,
      eyebrow: "Próxima refeição",
      title: next.meal.name,
      detail: [time, foodsLabel].filter(Boolean).join(" · "),
      cta: "Ver refeição",
      tone: "action",
      actionable: true,
      configured: true,
    };
  }

  return {
    ...base,
    eyebrow: "Próxima refeição",
    title: next.meal.name,
    detail:
      next.when === "tomorrow"
        ? `Amanhã às ${time}. Sem mais refeições hoje.`
        : [foodsLabel, "Sem horário definido"].filter(Boolean).join(" · "),
    cta: "Ver refeição",
    tone: "muted",
    actionable: false,
    configured: true,
  };
}

// ----------------------------------------------------------------------------
// Componentes
// ----------------------------------------------------------------------------

/** A ação principal do dia — o único botão de destaque da tela. */
function PrimaryCard({ item }: { item: TodayItem }) {
  return (
    <section
      aria-label="Sua ação de hoje"
      className="flex flex-col gap-4 rounded-lg border border-brand-tint-strong bg-brand-tint p-5"
    >
      <div className="flex items-center gap-2 text-brand">
        {item.icon}
        <span className="font-mono text-label uppercase tracking-widest">{item.eyebrow}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="break-words font-display text-2xl leading-tight text-ink">
          {item.title}
        </h2>
        {item.detail && <p className="break-words text-sm text-ink-muted">{item.detail}</p>}
      </div>
      <Link href={item.href} className={BUTTON_PRIMARY}>
        {item.cta}
      </Link>
    </section>
  );
}

/** Nenhum item tem nada publicado/iniciado pelo coach: honesto, sem prometer "tudo em dia". */
function PreparingCard() {
  return (
    <section aria-label="Sua ação de hoje" className={`${CARD} flex flex-col gap-1.5 p-5`}>
      <span className="font-mono text-label uppercase tracking-widest text-ink-muted">
        Em preparação
      </span>
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

function AllDoneCard() {
  return (
    <section
      aria-label="Sua ação de hoje"
      className={`${CARD} flex flex-col gap-1.5 p-5`}
    >
      <span className="font-mono text-label uppercase tracking-widest text-ok">Tudo em dia</span>
      <h2 className="font-display text-2xl leading-tight text-ink">Nada pendente por agora</h2>
      <p className="text-sm text-ink-muted">
        Nenhuma ação sua é necessária agora. Veja abaixo o que vem a seguir.
      </p>
    </section>
  );
}

const TONE_ICON: Record<Tone, string> = {
  action: "bg-brand-tint text-brand",
  ok: "bg-ok-tint text-ok",
  warn: "bg-warn-tint text-warn",
  muted: "bg-surface-sunken text-ink-faint",
};

function TodayRow({ item }: { item: TodayItem }) {
  return (
    <Link
      href={item.href}
      className="flex min-h-16 items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-sunken"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${TONE_ICON[item.tone]}`}
      >
        {item.icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
          {item.eyebrow}
        </span>
        <span className="break-words text-sm font-medium text-ink">{item.title}</span>
        {item.detail && (
          <span className="break-words text-xs text-ink-muted">{item.detail}</span>
        )}
      </span>
      <span className="shrink-0 text-ink-faint">{ICONS.chevron}</span>
    </Link>
  );
}

/** Orientação mais recente enviada pelo coach (somente leitura; nunca rascunho nem nota privada). */
function CoachMessage({ orientation }: { orientation: SentOrientation }) {
  return (
    <section aria-label="Mensagem do coach" className={`${CARD} flex flex-col gap-3 p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">
          Mensagem do seu coach
        </h2>
        <span className="font-mono text-xs text-ink-faint">
          Semana {orientation.weekNumber} · {formatShortDate(orientation.sentAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
        {orientation.text}
      </p>
    </section>
  );
}

function WeekProgress({
  weekNumber,
  startDate,
  workoutProgress,
  weight,
}: {
  weekNumber: number;
  startDate: string | null;
  workoutProgress: { doneCount: number; totalCount: number } | null;
  weight: { first: number; latest: number; weeks: number } | null;
}) {
  const hasWorkouts = !!workoutProgress && workoutProgress.totalCount > 0;
  const pct = hasWorkouts
    ? Math.round((workoutProgress.doneCount / workoutProgress.totalCount) * 100)
    : 0;
  const delta = weight ? weight.latest - weight.first : 0;

  return (
    <section aria-label="Seu progresso" className={`${CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-mono text-label uppercase tracking-widest text-ink-faint">
          Seu progresso
        </h2>
        <span className="font-mono text-xs text-ink-faint">
          Semana {weekNumber}
          {startDate ? ` · desde ${formatDateOnlyShort(startDate)}` : ""}
        </span>
      </div>

      {hasWorkouts && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">Treinos da semana</span>
            <span className="font-mono text-ink-muted">
              {workoutProgress.doneCount} de {workoutProgress.totalCount}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={workoutProgress.totalCount}
            aria-valuenow={workoutProgress.doneCount}
            aria-label="Treinos concluídos na semana"
            className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {weight && (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink">Peso atual</span>
            <span className="font-mono text-ink-muted">{formatKg(weight.latest)} kg</span>
          </div>
          {weight.weeks > 1 && (
            <p className="text-right text-xs text-ink-faint">
              {delta > 0 ? "+" : delta < 0 ? "−" : ""}
              {formatKg(Math.abs(delta))} kg desde o início
            </p>
          )}
        </div>
      )}

      {!hasWorkouts && !weight && (
        <p className="text-sm text-ink-muted">
          Seus treinos concluídos e o seu peso aparecem aqui conforme você avança na semana.
        </p>
      )}
    </section>
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

/** Coluna `date` (sem hora/fuso) -> dd/mm, em UTC pra não deslocar um dia. */
function formatDateOnlyShort(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
  });
}
