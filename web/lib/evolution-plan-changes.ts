/**
 * "O que mudou" entre planos PUBLICADOS (V5 item 33) — módulo PURO, sem I/O.
 *
 * O aluno vê a avaliação semanal junto do que o coach alterou no treino, na nutrição e no cardio.
 * Nada é inventado nem escrito à mão: as mudanças são a DIFERENÇA ENTRE VERSÕES PUBLICADAS dos
 * planos (cada publicação arquiva a anterior), atribuídas à avaliação cuja janela de tempo contém
 * a publicação. As janelas particionam a linha do tempo (da avaliação anterior até esta), então
 * toda publicação aparece em exatamente uma avaliação — ou em "desde a última avaliação" quando
 * ainda não houve avaliação depois dela.
 *
 * Só dados estruturados do plano (nomes, séries, repetições, carga, descanso, duração, metas de
 * macros, refeições, itens). Nunca a nota privada do coach nem rascunhos (o chamador só entrega
 * versões publicadas).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type SnapBlockType = "warmup" | "normal" | "cardio";

export type WorkoutExerciseSnap = {
  exerciseId: string;
  name: string;
  blockType: SnapBlockType;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  load: number | null;
  restSec: number | null;
  durationSec: number | null;
};

export type WorkoutSnap = { days: { name: string; exercises: WorkoutExerciseSnap[] }[] };

export type NutritionSnap = {
  targets: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    waterMl: number | null;
  };
  meals: {
    name: string;
    /** "HH:MM" ou "HH:MM:SS". */
    time: string | null;
    /** 1 = segunda ... 7 = domingo; `null` = todo dia. */
    dayOfWeek: number | null;
    items: { key: string; name: string; qty: string | null }[];
  }[];
};

export type PlanVersion<S> = {
  id: string;
  name: string;
  /** Instante da publicação (ISO). */
  publishedAt: string;
  snap: S;
};

export type ChangeLine = {
  id: string;
  kind: "added" | "removed" | "changed";
  text: string;
};

export type ChangeArea = "training" | "nutrition" | "cardio";

export type AreaChanges = {
  area: ChangeArea;
  /**
   * none: nenhuma publicação na janela; initial: o plano foi publicado pela primeira vez (não há
   * versão anterior para comparar); changed: houve diferença; unchanged: publicou, mas igual.
   */
  status: "none" | "initial" | "changed" | "unchanged";
  lines: ChangeLine[];
  /** Versão publicada mais recente da janela (a que vale ao fim dela). */
  version: { id: string; name: string; publishedAt: string } | null;
  /** Quantas publicações a janela teve (as linhas já são o saldo entre início e fim). */
  publishCount: number;
};

export type EvaluationChanges = Record<ChangeArea, AreaChanges>;

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function num(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function norm(text: string): string {
  return text.trim().toLocaleLowerCase("pt-BR");
}

export function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min} min` : `${min} min ${rest} s`;
}

function formatReps(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const lo = min ?? max;
  const hi = max ?? min;
  return lo === hi ? `${num(lo as number)}` : `${num(lo as number)}–${num(hi as number)}`;
}

function formatWater(ml: number): string {
  return ml >= 1000 ? `${num(ml / 1000)} L` : `${num(ml)} mL`;
}

function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

const WEEKDAY = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Treino e cardio
// ---------------------------------------------------------------------------

type Indexed = { key: string; day: string; ex: WorkoutExerciseSnap };

function indexExercises(snap: WorkoutSnap): Map<string, Indexed> {
  const out = new Map<string, Indexed>();
  const seen = new Map<string, number>();
  for (const day of snap.days) {
    for (const ex of day.exercises) {
      const base = `${ex.blockType === "cardio" ? "c" : "s"}|${ex.exerciseId}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const key = `${base}#${n}`;
      out.set(key, { key, day: day.name, ex });
    }
  }
  return out;
}

function prescription(ex: WorkoutExerciseSnap): string {
  const parts: string[] = [];
  const reps = formatReps(ex.repsMin, ex.repsMax);
  if (ex.sets != null && reps) parts.push(`${ex.sets}×${reps}`);
  else if (ex.sets != null) parts.push(plural(ex.sets, "série", "séries"));
  else if (reps) parts.push(`${reps} repetições`);
  if (ex.load != null) parts.push(`${num(ex.load)} kg`);
  return parts.join(", ");
}

function exerciseChangeParts(a: WorkoutExerciseSnap, b: WorkoutExerciseSnap): string[] {
  const parts: string[] = [];
  if (a.sets !== b.sets) parts.push(`séries ${a.sets ?? "—"} → ${b.sets ?? "—"}`);
  const ra = formatReps(a.repsMin, a.repsMax);
  const rb = formatReps(b.repsMin, b.repsMax);
  if (ra !== rb) parts.push(`repetições ${ra ?? "—"} → ${rb ?? "—"}`);
  if (a.load !== b.load) parts.push(`carga ${a.load != null ? `${num(a.load)} kg` : "—"} → ${b.load != null ? `${num(b.load)} kg` : "—"}`);
  if (a.restSec !== b.restSec) {
    parts.push(`descanso ${a.restSec != null ? `${a.restSec} s` : "—"} → ${b.restSec != null ? `${b.restSec} s` : "—"}`);
  }
  return parts;
}

/** Diferença entre dois treinos publicados, separando força (treino) de cardio. */
export function diffWorkout(prev: WorkoutSnap, next: WorkoutSnap): { training: ChangeLine[]; cardio: ChangeLine[] } {
  const training: ChangeLine[] = [];
  const cardio: ChangeLine[] = [];

  const prevDays = new Set(prev.days.map((d) => norm(d.name)));
  const nextDays = new Set(next.days.map((d) => norm(d.name)));
  const a = indexExercises(prev);
  const b = indexExercises(next);

  for (const day of next.days) {
    if (prevDays.has(norm(day.name))) continue;
    const count = day.exercises.filter((e) => e.blockType !== "cardio").length;
    training.push({
      id: `day+${norm(day.name)}`,
      kind: "added",
      text: `Dia “${day.name}” adicionado${count > 0 ? ` (${plural(count, "exercício", "exercícios")})` : ""}.`,
    });
  }
  for (const day of prev.days) {
    if (nextDays.has(norm(day.name))) continue;
    training.push({ id: `day-${norm(day.name)}`, kind: "removed", text: `Dia “${day.name}” removido.` });
  }

  for (const [key, cur] of b) {
    const isCardio = cur.ex.blockType === "cardio";
    const target = isCardio ? cardio : training;
    const old = a.get(key);
    if (!old) {
      // Em dia novo, o exercício já entrou na linha do dia (só o cardio é listado à parte).
      if (!isCardio && !prevDays.has(norm(cur.day))) continue;
      if (isCardio) {
        const dur = cur.ex.durationSec != null ? `, ${formatDuration(cur.ex.durationSec)}` : "";
        target.push({ id: `+${key}`, kind: "added", text: `Cardio adicionado: ${cur.ex.name}${dur} (${cur.day}).` });
      } else {
        const p = prescription(cur.ex);
        target.push({
          id: `+${key}`,
          kind: "added",
          text: `Novo exercício: ${cur.ex.name}${p ? ` (${p})` : ""} em “${cur.day}”.`,
        });
      }
      continue;
    }
    const parts: string[] = [];
    if (norm(old.day) !== norm(cur.day)) parts.push(`de “${old.day}” para “${cur.day}”`);
    if (isCardio) {
      if (old.ex.durationSec !== cur.ex.durationSec) {
        parts.push(
          `duração ${old.ex.durationSec != null ? formatDuration(old.ex.durationSec) : "—"} → ${cur.ex.durationSec != null ? formatDuration(cur.ex.durationSec) : "—"}`
        );
      }
    } else {
      parts.push(...exerciseChangeParts(old.ex, cur.ex));
    }
    if (parts.length > 0) {
      target.push({ id: `~${key}`, kind: "changed", text: `${cur.ex.name}: ${parts.join("; ")}.` });
    }
  }

  for (const [key, old] of a) {
    if (b.has(key)) continue;
    const isCardio = old.ex.blockType === "cardio";
    if (isCardio) {
      cardio.push({ id: `-${key}`, kind: "removed", text: `Cardio removido: ${old.ex.name} (${old.day}).` });
    } else if (nextDays.has(norm(old.day))) {
      training.push({ id: `-${key}`, kind: "removed", text: `Exercício removido: ${old.ex.name} (de “${old.day}”).` });
    }
  }

  return { training, cardio };
}

// ---------------------------------------------------------------------------
// Nutrição
// ---------------------------------------------------------------------------

function mealKey(m: NutritionSnap["meals"][number]): string {
  return `${norm(m.name)}|${m.dayOfWeek ?? 0}`;
}

function mealLabel(m: NutritionSnap["meals"][number]): string {
  return m.dayOfWeek ? `${m.name} (${WEEKDAY[m.dayOfWeek] ?? "dia"})` : m.name;
}

const TARGETS: { field: keyof NutritionSnap["targets"]; label: string; fmt: (v: number) => string }[] = [
  { field: "kcal", label: "Meta de calorias", fmt: (v) => `${num(v)} kcal` },
  { field: "proteinG", label: "Meta de proteína", fmt: (v) => `${num(v)} g` },
  { field: "carbsG", label: "Meta de carboidratos", fmt: (v) => `${num(v)} g` },
  { field: "fatG", label: "Meta de gorduras", fmt: (v) => `${num(v)} g` },
  { field: "waterMl", label: "Meta de água", fmt: formatWater },
];

/** Diferença entre duas dietas publicadas. */
export function diffNutrition(prev: NutritionSnap, next: NutritionSnap): ChangeLine[] {
  const lines: ChangeLine[] = [];

  for (const t of TARGETS) {
    const a = prev.targets[t.field];
    const b = next.targets[t.field];
    if (a === b) continue;
    lines.push({
      id: `target-${t.field}`,
      kind: "changed",
      text: `${t.label}: ${a != null ? t.fmt(a) : "sem meta"} → ${b != null ? t.fmt(b) : "sem meta"}.`,
    });
  }

  const before = new Map(prev.meals.map((m) => [mealKey(m), m]));
  const after = new Map(next.meals.map((m) => [mealKey(m), m]));

  for (const [key, m] of after) {
    const old = before.get(key);
    if (!old) {
      lines.push({
        id: `meal+${key}`,
        kind: "added",
        text: `Refeição adicionada: ${mealLabel(m)}${m.items.length > 0 ? ` (${plural(m.items.length, "item", "itens")})` : ""}.`,
      });
      continue;
    }
    const parts: string[] = [];
    const ta = formatTime(old.time);
    const tb = formatTime(m.time);
    if (ta !== tb) parts.push(`horário ${ta ?? "—"} → ${tb ?? "—"}`);
    const oldItems = new Map(old.items.map((i) => [i.key, i]));
    const newItems = new Map(m.items.map((i) => [i.key, i]));
    for (const [k, item] of newItems) {
      const o = oldItems.get(k);
      if (!o) parts.push(`+ ${item.name}${item.qty ? ` (${item.qty})` : ""}`);
      else if ((o.qty ?? "") !== (item.qty ?? "")) parts.push(`${item.name}: ${o.qty ?? "—"} → ${item.qty ?? "—"}`);
    }
    for (const [k, item] of oldItems) if (!newItems.has(k)) parts.push(`− ${item.name}`);
    if (parts.length > 0) lines.push({ id: `meal~${key}`, kind: "changed", text: `${mealLabel(m)}: ${parts.join("; ")}.` });
  }
  for (const [key, m] of before) {
    if (!after.has(key)) lines.push({ id: `meal-${key}`, kind: "removed", text: `Refeição removida: ${mealLabel(m)}.` });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Janelas de avaliação
// ---------------------------------------------------------------------------

/** Folga nas bordas: o coach pode publicar o plano minutos antes ou depois de enviar a avaliação. */
export const EVALUATION_GRACE_MS = 30 * 60 * 1000;

export type EvaluationWindow = {
  weekNumber: number;
  /** Exclusivo; `null` = desde o início do acompanhamento. */
  from: string | null;
  /** Inclusivo; `null` = sem limite (janela aberta, após a última avaliação). */
  to: string | null;
};

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Janelas por avaliação ENVIADA: de (envio da anterior + folga) até (envio desta + folga). Ordem
 * pelo instante de envio — não pelo número da semana — para a partição nunca ter lacuna nem
 * sobreposição, mesmo com avaliação enviada fora de ordem. `pending` é a janela aberta depois da
 * última avaliação (mudanças publicadas que ainda não foram avaliadas).
 */
export function evaluationWindows(
  sent: { weekNumber: number; sentAt: string | null }[]
): { windows: EvaluationWindow[]; pending: EvaluationWindow | null } {
  const valid = sent
    .filter((o): o is { weekNumber: number; sentAt: string } => !!o.sentAt && !Number.isNaN(ms(o.sentAt)))
    .sort((a, b) => ms(a.sentAt) - ms(b.sentAt));
  const edge = (iso: string) => new Date(ms(iso) + EVALUATION_GRACE_MS).toISOString();
  const windows: EvaluationWindow[] = valid.map((o, i) => ({
    weekNumber: o.weekNumber,
    from: i === 0 ? null : edge(valid[i - 1].sentAt),
    to: edge(o.sentAt),
  }));
  const last = valid[valid.length - 1];
  return { windows, pending: last ? { weekNumber: last.weekNumber, from: edge(last.sentAt), to: null } : null };
}

function inWindow(iso: string, w: EvaluationWindow): boolean {
  const t = ms(iso);
  return (w.from == null || t > ms(w.from)) && (w.to == null || t <= ms(w.to));
}

function sortedVersions<S>(versions: PlanVersion<S>[]): PlanVersion<S>[] {
  return [...versions].sort((a, b) => ms(a.publishedAt) - ms(b.publishedAt));
}

/** Versão que vigorava no instante `iso` (a última publicada até ele). */
export function activeVersionAt<S>(versions: PlanVersion<S>[], iso: string | null): PlanVersion<S> | null {
  const sorted = sortedVersions(versions);
  const t = iso == null ? Infinity : ms(iso);
  let found: PlanVersion<S> | null = null;
  for (const v of sorted) if (ms(v.publishedAt) <= t) found = v;
  return found;
}

function areaOf<S>(
  area: ChangeArea,
  versions: PlanVersion<S>[],
  window: EvaluationWindow,
  diff: (a: S, b: S) => ChangeLine[]
): AreaChanges {
  const sorted = sortedVersions(versions);
  const inside = sorted.filter((v) => inWindow(v.publishedAt, window));
  const final = inside[inside.length - 1];
  if (!final) return { area, status: "none", lines: [], version: null, publishCount: 0 };
  const base = window.from == null ? null : activeVersionAt(sorted, window.from);
  const version = { id: final.id, name: final.name, publishedAt: final.publishedAt };
  // Primeira versão do aluno (nada antes): não há "o que mudou", só "plano publicado".
  const first = sorted[0];
  const hasEarlier = base != null || (first && first.id !== inside[0].id);
  if (!hasEarlier) return { area, status: "initial", lines: [], version, publishCount: inside.length };
  const from = base ?? sorted[sorted.indexOf(inside[0]) - 1];
  const lines = diff(from.snap, final.snap);
  return { area, status: lines.length > 0 ? "changed" : "unchanged", lines, version, publishCount: inside.length };
}

/**
 * Mudanças de UMA janela de avaliação nas três áreas. Cardio é derivado do mesmo treino
 * (blocos de cardio). A diferença é o saldo entre a versão em vigor no início da janela e a última
 * publicada nela — idas e voltas intermediárias não poluem a lista.
 */
export function changesForWindow(args: {
  workout: PlanVersion<WorkoutSnap>[];
  nutrition: PlanVersion<NutritionSnap>[];
  window: EvaluationWindow;
}): EvaluationChanges {
  const { workout, nutrition, window } = args;
  const training = areaOf("training", workout, window, (a, b) => diffWorkout(a, b).training);
  let cardio = areaOf("cardio", workout, window, (a, b) => diffWorkout(a, b).cardio);
  // Cardio "initial" = primeiro treino publicado; só vale se esse treino de fato tem cardio.
  if (cardio.status === "initial") {
    const final = workout.find((v) => v.id === cardio.version?.id);
    const hasCardio = !!final?.snap.days.some((d) => d.exercises.some((e) => e.blockType === "cardio"));
    if (!hasCardio) cardio = { ...cardio, status: "none", version: null, publishCount: 0 };
  }
  const nutritionChanges = areaOf("nutrition", nutrition, window, diffNutrition);
  return { training, cardio, nutrition: nutritionChanges };
}

/** Há algo a mostrar (qualquer área com publicação na janela)? */
export function hasAnyChange(changes: EvaluationChanges): boolean {
  return (["training", "nutrition", "cardio"] as const).some((a) => changes[a].status !== "none");
}
