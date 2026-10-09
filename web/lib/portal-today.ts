/**
 * Regras puras (sem I/O) da Home do aluno — "o que eu preciso fazer hoje?" (item 24 do TODO).
 * Tudo em America/Sao_Paulo, mesmo fuso do Financeiro (`lib/finance/dates.ts`), pra o servidor
 * em UTC não deslocar dia/hora do aluno.
 */

const TZ = "America/Sao_Paulo";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const CLOCK_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const SP_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type SaoPauloClock = {
  /** 0 = domingo ... 6 = sábado */
  weekday: number;
  hour: number;
  minute: number;
  /** minutos desde 00:00 */
  minutes: number;
};

export function getSaoPauloClock(now: Date = new Date()): SaoPauloClock {
  const parts = CLOCK_PARTS.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { weekday: WEEKDAY_INDEX[get("weekday")] ?? 0, hour, minute, minutes: hour * 60 + minute };
}

/** Saudação pelo horário local do aluno. */
export function greetingFor(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** "domingo, 20 de setembro" */
export function formatLongDate(now: Date = new Date()): string {
  return now.toLocaleDateString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * Janela do check-in semanal (regra do TODO, item 24): ABERTA sexta/sábado/domingo; QUINTA é só
 * lembrete (abre amanhã); segunda a quarta BLOQUEADA. Na interface (home e `/portal/checkin`) e,
 * desde o item 25, também NO SERVIDOR: `checkinSubmitGate` abaixo é a decisão que
 * `submitCheckin`/`saveCheckinDraft` (lib/repository.ts) aplicam antes de gravar qualquer coisa.
 */
export type CheckinWindow =
  | { state: "open"; closesLabel: string }
  | { state: "reminder" }
  | { state: "closed"; daysUntilOpen: number };

export function checkinWindow(now: Date = new Date()): CheckinWindow {
  const { weekday } = getSaoPauloClock(now);
  if (weekday === 5 || weekday === 6 || weekday === 0) {
    return { state: "open", closesLabel: "domingo" };
  }
  if (weekday === 4) return { state: "reminder" };
  return { state: "closed", daysUntilOpen: 5 - weekday };
}

/**
 * Decisão de servidor: pode enviar/gravar rascunho de check-in AGORA? Pura (recebe o instante),
 * baseada em `checkinWindow` — o dia é o de America/Sao_Paulo, nunca o UTC (sábado 23:30 em SP
 * já é domingo 02:30 UTC e continua aberto; domingo 23:59 SP já é segunda 02:59 UTC e continua
 * aberto; segunda 00:00 SP fecha). Devolve a mensagem pronta pra mostrar ao aluno.
 */
export type CheckinSubmitGate = { ok: true } | { ok: false; reason: "reminder" | "closed"; message: string };

export function checkinSubmitGate(now: Date = new Date()): CheckinSubmitGate {
  const win = checkinWindow(now);
  if (win.state === "open") return { ok: true };
  if (win.state === "reminder") {
    return {
      ok: false,
      reason: "reminder",
      message: "O check-in ainda não abriu: ele abre amanhã (sexta-feira) e fica aberto até domingo.",
    };
  }
  return {
    ok: false,
    reason: "closed",
    message: "O check-in está fechado. Ele abre na sexta-feira e fica aberto até domingo.",
  };
}

/** Data (`YYYY-MM-DD`) de hoje em São Paulo. */
export function todayDateSP(now: Date = new Date()): string {
  return SP_DATE.format(now);
}

/** Um instante (ISO) cai no dia de hoje em São Paulo? */
export function isTodaySP(iso: string, now: Date = new Date()): boolean {
  return SP_DATE.format(new Date(iso)) === SP_DATE.format(now);
}

// ----------------------------------------------------------------------------
// Treino de hoje
// ----------------------------------------------------------------------------

type DayLike = { id: string; exercises: { exercise_id: string }[] };

/**
 * O schema NÃO tem dia da semana em `workout_days` (só nome + ordem), então "treino de hoje" é
 * o PRÓXIMO dia da sequência do plano cujos exercícios ainda não foram todos registrados nesta
 * semana (`workout_logs`). Dia sem exercício nunca é escolhido (não há o que executar).
 */
export function pickNextWorkoutDay<T extends DayLike>(
  days: T[],
  loggedExerciseIds: Set<string>
): { next: T | null; doneCount: number; totalCount: number } {
  const runnable = days.filter((d) => d.exercises.length > 0);
  const isDone = (d: T) => d.exercises.every((e) => loggedExerciseIds.has(e.exercise_id));
  const doneCount = runnable.filter(isDone).length;
  return {
    next: runnable.find((d) => !isDone(d)) ?? null,
    doneCount,
    totalCount: runnable.length,
  };
}

// ----------------------------------------------------------------------------
// Próxima refeição
// ----------------------------------------------------------------------------

type MealLike = { id: string; time: string | null };

export type NextMeal<T extends MealLike> =
  | { meal: T; when: "today" | "tomorrow" | "untimed" }
  | null;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * `meals.time` é opcional e o "realizada" do schema atual é POR SEMANA (não por dia), então a
 * próxima refeição é decidida só pelo relógio: a primeira com horário >= agora; passada a
 * última, a primeira do dia seguinte; sem nenhum horário, a primeira da lista.
 */
export function pickNextMeal<T extends MealLike>(meals: T[], nowMinutes: number): NextMeal<T> {
  const timed = meals
    .filter((m): m is T & { time: string } => !!m.time)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  const upcoming = timed.find((m) => toMinutes(m.time) >= nowMinutes);
  if (upcoming) return { meal: upcoming, when: "today" };
  if (timed.length > 0) return { meal: timed[0], when: "tomorrow" };
  if (meals.length > 0) return { meal: meals[0], when: "untimed" };
  return null;
}
