/**
 * Relógio de refeições do aluno (V3 tarefa 10) — regra ÚNICA de "refeição agora / próxima"
 * usada pela Home e pela Nutrição. Pura (sem I/O, sem relógio próprio): recebe o instante já
 * convertido para America/Sao_Paulo (`getSaoPauloClock`, `lib/portal-today.ts`) e devolve o
 * estado de cada refeição de hoje + o destaque. O componente cliente (`app/portal/meal-clock.tsx`)
 * só reavalia isto num timer local — nenhuma chamada ao servidor por tick.
 *
 * Regras:
 *  - Refeições do dia = `day_of_week` do dia (1=segunda..7=domingo) ou `null` (todo dia).
 *  - Sem horário (`time` nulo) não entra no relógio — nunca se inventa horário.
 *  - Registrada (done/partial/skipped em `meal_logs` hoje) nunca é "agora"/"próxima".
 *  - "Agora": do horário até {@link NOW_WINDOW_MIN} min depois, se não registrada.
 *  - Depois disso, sem registro: "Horário passou · registre quando puder" (sem tom punitivo).
 *  - Destaque: refeição em "Agora" (a mais recente) > próxima de hoje com horário à frente >
 *    primeira refeição com horário dos próximos dias ("Amanhã · 07:30").
 */

export const NOW_WINDOW_MIN = 30;

export type ClockMeal = { id: string; name: string; time: string | null; day_of_week: number | null };
export type ClockLogStatus = "done" | "partial" | "skipped";

export type MealSlot =
  | { kind: "registered"; status: ClockLogStatus }
  | { kind: "now"; minutesSince: number }
  | { kind: "missed"; minutesSince: number }
  | { kind: "upcoming"; minutesUntil: number }
  | { kind: "untimed" };

export type MealClockHeadline<T extends ClockMeal = ClockMeal> =
  /** Plano sem nenhuma refeição. */
  | { kind: "empty" }
  /** Há refeições, mas nenhuma com horário (hoje e nos próximos dias). */
  | { kind: "no-times" }
  | { kind: "now"; meal: T; time: string; minutesSince: number }
  | { kind: "upcoming"; meal: T; time: string; minutesUntil: number }
  /** Nada mais hoje: primeira refeição com horário de um dos próximos dias (1 = amanhã). */
  | { kind: "later-day"; meal: T; time: string; daysAhead: number; dayOfWeek: number };

export type MealClock<T extends ClockMeal = ClockMeal> = {
  headline: MealClockHeadline<T>;
  /** Última refeição de hoje cujo horário já chegou e que não é o destaque (para contexto). */
  previous: { meal: T; time: string; slot: MealSlot } | null;
  /** Estado de cada refeição de hoje, por id. */
  slots: Record<string, MealSlot>;
  /** id da refeição de hoje em destaque ("now"/"upcoming"); `null` se o destaque não é hoje. */
  primaryId: string | null;
};

/** "07:30" a partir de "07:30:00"; `null` se ausente/inválido. */
export function hhmm(time: string | null | undefined): string | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** JS (0=domingo..6=sábado) -> `meals.day_of_week` (1=segunda..7=domingo). */
export function toDayOfWeek(jsWeekday: number): number {
  return jsWeekday === 0 ? 7 : jsWeekday;
}

export function mealsOnDay<T extends ClockMeal>(meals: T[], dayOfWeek: number): T[] {
  return meals.filter((m) => m.day_of_week == null || m.day_of_week === dayOfWeek);
}

type Timed<T> = { meal: T; time: string; at: number };

function timedSorted<T extends ClockMeal>(meals: T[]): Timed<T>[] {
  const out: Timed<T>[] = [];
  for (const meal of meals) {
    const time = hhmm(meal.time);
    if (time) out.push({ meal, time, at: timeToMinutes(time) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * @param meals       todas as refeições do plano publicado
 * @param jsWeekday   dia da semana em SP (0=domingo..6=sábado)
 * @param nowMinutes  minutos desde 00:00 em SP, pode ter fração (segundos/60)
 * @param statusByMealId registros de HOJE por refeição
 */
export function computeMealClock<T extends ClockMeal>(
  meals: T[],
  jsWeekday: number,
  nowMinutes: number,
  statusByMealId: Record<string, ClockLogStatus | null | undefined>
): MealClock<T> {
  const today = toDayOfWeek(jsWeekday);
  const todayMeals = mealsOnDay(meals, today);
  const slots: Record<string, MealSlot> = {};

  for (const meal of todayMeals) {
    const status = statusByMealId[meal.id];
    const time = hhmm(meal.time);
    if (status) slots[meal.id] = { kind: "registered", status };
    else if (!time) slots[meal.id] = { kind: "untimed" };
    else {
      const diff = nowMinutes - timeToMinutes(time);
      if (diff < 0) slots[meal.id] = { kind: "upcoming", minutesUntil: Math.ceil(-diff) };
      else if (diff < NOW_WINDOW_MIN) slots[meal.id] = { kind: "now", minutesSince: Math.floor(diff) };
      else slots[meal.id] = { kind: "missed", minutesSince: Math.floor(diff) };
    }
  }

  const timedToday = timedSorted(todayMeals);
  const current = timedToday.filter((t) => slots[t.meal.id]?.kind === "now").pop();
  const next = timedToday.find((t) => slots[t.meal.id]?.kind === "upcoming");

  let headline: MealClockHeadline<T>;
  let primaryId: string | null = null;
  if (current) {
    const slot = slots[current.meal.id] as { kind: "now"; minutesSince: number };
    headline = { kind: "now", meal: current.meal, time: current.time, minutesSince: slot.minutesSince };
    primaryId = current.meal.id;
  } else if (next) {
    const slot = slots[next.meal.id] as { kind: "upcoming"; minutesUntil: number };
    headline = { kind: "upcoming", meal: next.meal, time: next.time, minutesUntil: slot.minutesUntil };
    primaryId = next.meal.id;
  } else if (meals.length === 0) {
    headline = { kind: "empty" };
  } else {
    headline = { kind: "no-times" };
    for (let ahead = 1; ahead <= 7; ahead++) {
      const dow = ((today - 1 + ahead) % 7) + 1;
      const first = timedSorted(mealsOnDay(meals, dow))[0];
      if (first) {
        headline = { kind: "later-day", meal: first.meal, time: first.time, daysAhead: ahead, dayOfWeek: dow };
        break;
      }
    }
  }

  const past = timedToday.filter((t) => t.at <= nowMinutes && t.meal.id !== primaryId).pop();
  const previous = past ? { meal: past.meal, time: past.time, slot: slots[past.meal.id] } : null;

  return { headline, previous, slots, primaryId };
}

// ----------------------------------------------------------------------------
// Rótulos pt-BR
// ----------------------------------------------------------------------------

const DAY_NAMES = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

/** "Em 5 min", "Em 1 h", "Em 1 h 05 min"; "Agora" com 0 ou menos. */
export function formatCountdown(minutesUntil: number): string {
  const m = Math.ceil(minutesUntil);
  if (m <= 0) return "Agora";
  if (m < 60) return `Em ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `Em ${h} h` : `Em ${h} h ${String(rest).padStart(2, "0")} min`;
}

export const MISSED_LABEL = "Horário passou · registre quando puder";

/** Rótulo curto do estado de uma refeição de hoje. */
export function slotLabel(slot: MealSlot): string {
  switch (slot.kind) {
    case "registered":
      return slot.status === "done" ? "Registrada" : slot.status === "partial" ? "Registrada · parcial" : "Marcada como não feita";
    case "now":
      return "Agora";
    case "missed":
      return MISSED_LABEL;
    case "upcoming":
      return formatCountdown(slot.minutesUntil);
    case "untimed":
      return "Sem horário definido";
  }
}

/** "Amanhã · 07:30" / "Sexta · 07:30" / "Hoje · 19:30". */
export function dayTimeLabel(daysAhead: number, dayOfWeek: number, time: string): string {
  if (daysAhead === 0) return `Hoje · ${time}`;
  if (daysAhead === 1) return `Amanhã · ${time}`;
  return `${DAY_NAMES[dayOfWeek] ?? ""} · ${time}`;
}

/** Textos do destaque: rótulo (eyebrow) e o "quando" ("Em 40 min", "Agora", "Amanhã · 07:30"). */
export function headlineLabels(h: MealClockHeadline): { eyebrow: string; when: string | null } {
  switch (h.kind) {
    case "now":
      return { eyebrow: "Refeição agora", when: "Agora" };
    case "upcoming":
      return { eyebrow: "Próxima refeição", when: formatCountdown(h.minutesUntil) };
    case "later-day":
      return { eyebrow: "Próxima refeição", when: dayTimeLabel(h.daysAhead, h.dayOfWeek, h.time) };
    case "no-times":
      return { eyebrow: "Refeições", when: null };
    case "empty":
      return { eyebrow: "Nutrição", when: null };
  }
}
