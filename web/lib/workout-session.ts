/**
 * Funções PURAS da execução do treino pelo aluno (item 19 do master TODO — progresso da
 * sessão, "desempenho anterior" por prescrição, timer de descanso, duração e resumo final).
 * Nenhuma função aqui toca banco — só transforma dado já carregado por `lib/repository.ts`,
 * mesmo padrão de separação IO/lógica de `lib/workout-builder.ts` (item 18: construtor do
 * coach). Os testes (`lib/workout-session.test.ts`, `npx tsx --test lib/workout-session.test.ts`)
 * cobrem a lógica sem precisar de banco.
 *
 * Escopo: só o que a execução do aluno precisa. O construtor do coach (blocos de aquecimento/
 * cardio/superset/circuito, filtro da biblioteca, validação de prescrição) continua em
 * `lib/workout-builder.ts`, sem mudança nenhuma — este arquivo importa de lá (`WorkoutBlockType`)
 * em vez de duplicar o tipo.
 */

import type { WorkoutBlockType } from "@/lib/workout-builder";
import { resolveSetTarget, type UniformPrescriptionLike } from "@/lib/workout-prescription";

// ============================================================================
// Séries por exercício prescrito
// ============================================================================

export type PrescribedExerciseLike = {
  id: string;
  sets: number | null;
  block_type: WorkoutBlockType;
};

/**
 * Quantas séries/rodadas o aluno precisa concluir deste exercício prescrito. Um bloco sem
 * `sets` definido (comum em cardio por duração, ex.: "12 min de esteira") ainda vale como 1
 * unidade executável — nunca zero, senão o exercício nunca apareceria como concluído nem
 * entraria no progresso da sessão.
 */
export function unitCountFor(exercise: PrescribedExerciseLike): number {
  return exercise.sets != null && exercise.sets > 0 ? exercise.sets : 1;
}

/** `[1, 2, 3, ...]` — os números de série a renderizar/registrar para este exercício. */
export function setNumbersFor(exercise: PrescribedExerciseLike): number[] {
  return Array.from({ length: unitCountFor(exercise) }, (_, i) => i + 1);
}

// ============================================================================
// Progresso da sessão
// ============================================================================

/** Chave estável de uma série dentro da sessão — usada tanto pro estado local (cliente,
 * "quais séries já marquei") quanto pro cálculo de progresso abaixo. */
export type SetKey = string;

export function setKey(workoutExerciseId: string, setNumber: number): SetKey {
  return `${workoutExerciseId}:${setNumber}`;
}

export type SessionProgress = { done: number; total: number; pct: number };

/**
 * Progresso agregado da sessão: quantas séries de TODOS os exercícios do dia já foram
 * marcadas concluídas (`doneKeys`, no formato de {@link setKey}) sobre o total prescrito.
 * `pct` é 0 quando não há nada prescrito (dia vazio) — nunca `NaN`.
 */
export function computeSessionProgress(
  exercises: PrescribedExerciseLike[],
  doneKeys: ReadonlySet<SetKey>
): SessionProgress {
  let done = 0;
  let total = 0;
  for (const exercise of exercises) {
    for (const setNumber of setNumbersFor(exercise)) {
      total++;
      if (doneKeys.has(setKey(exercise.id, setNumber))) done++;
    }
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

/** Este exercício prescrito tem TODAS as séries marcadas concluídas? */
export function isExerciseDone(exercise: PrescribedExerciseLike, doneKeys: ReadonlySet<SetKey>): boolean {
  return setNumbersFor(exercise).every((n) => doneKeys.has(setKey(exercise.id, n)));
}

// ============================================================================
// Desempenho anterior — agrupar logs por prescrição, ficando só com a sessão mais recente
// ============================================================================

export type PreviousSetLike = {
  workout_exercise_id: string | null;
  session_id: string | null;
  set_number: number | null;
};

/**
 * Recebe logs de `workout_logs` (qualquer ordem) de um conjunto de exercícios prescritos e
 * devolve, por `workout_exercise_id`, só as séries da sessão mais recente (por `completed_at`
 * mais recente primeiro, na ordem de entrada — quem consulta o banco já ordena DESC antes de
 * chamar aqui) — é o que vira "última vez" na tela de execução. `excludeSessionId` tira a
 * sessão atual da consideração (não faz sentido "desempenho anterior" apontar pra série que o
 * próprio aluno acabou de registrar agora). Puro: só agrupa, não ordena (quem consulta o banco
 * entrega ordenado — `lib/repository.ts:getPreviousPerformance`).
 */
export function groupPreviousPerformance<T extends PreviousSetLike>(
  logsDesc: T[],
  excludeSessionId?: string | null
): Map<string, T[]> {
  const latestSessionByExercise = new Map<string, string | null>();
  const result = new Map<string, T[]>();

  for (const row of logsDesc) {
    if (!row.workout_exercise_id) continue;
    if (excludeSessionId && row.session_id === excludeSessionId) continue;
    if (!latestSessionByExercise.has(row.workout_exercise_id)) {
      latestSessionByExercise.set(row.workout_exercise_id, row.session_id);
    }
  }

  for (const row of logsDesc) {
    if (!row.workout_exercise_id) continue;
    if (excludeSessionId && row.session_id === excludeSessionId) continue;
    if (latestSessionByExercise.get(row.workout_exercise_id) !== row.session_id) continue;
    const list = result.get(row.workout_exercise_id) ?? [];
    list.push(row);
    result.set(row.workout_exercise_id, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
  }

  return result;
}

// ============================================================================
// Timer de descanso e duração da sessão
// ============================================================================

/** `95` -> `"1:35"`. Nunca negativo (trava em `"0:00"`) — o timer do cliente só soma/subtrai
 * inteiros, mas arredondamento de ponto flutuante nunca deve virar `"-1:-5"` na tela. */
export function formatRestClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type SessionTimingLike = {
  started_at: string;
  paused_at: string | null;
  paused_total_sec: number;
  ended_at: string | null;
};

/**
 * Segundos decorridos de treino, EXCLUINDO o tempo em pausa (soma `paused_total_sec` já
 * fechado + a pausa em andamento, se houver, calculada até `now`). Usa `ended_at` como fim se
 * a sessão já terminou; senão `now`. Nunca negativo.
 */
export function computeElapsedSeconds(session: SessionTimingLike, now: Date = new Date()): number {
  const start = new Date(session.started_at).getTime();
  const end = session.ended_at ? new Date(session.ended_at).getTime() : now.getTime();
  const ongoingPauseSec = session.paused_at
    ? Math.max(0, Math.round((now.getTime() - new Date(session.paused_at).getTime()) / 1000))
    : 0;
  const totalSec = Math.max(0, Math.round((end - start) / 1000));
  return Math.max(0, totalSec - session.paused_total_sec - ongoingPauseSec);
}

/** `"1h 12min"` / `"8min"` — pra tela de resumo (nunca segundos soltos, precisão desnecessária
 * pra quem só quer saber quanto tempo treinou). */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.round((safe % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

/**
 * Cronômetro da sessão em andamento: "m:ss" abaixo de 1h e "h:mm:ss" a partir
 * de 1h (ex.: 18h07m04s -> "18:07:04"), para não exibir "1087:04" numa sessão
 * esquecida aberta. Nunca negativo.
 */
export function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

// ============================================================================
// Resumo ao finalizar
// ============================================================================

export type SessionSummary = {
  exercisesDone: number;
  exercisesTotal: number;
  setsDone: number;
  setsTotal: number;
  /** Soma de carga × reps de todas as séries com os dois valores preenchidos — bloco de
   * cardio/aquecimento sem carga não entra (fica em 0 de contribuição, não em erro). */
  totalVolume: number;
  durationSec: number;
};

export type SummaryLogLike = {
  workout_exercise_id: string | null;
  set_number: number | null;
  load: number | null;
  reps: number | null;
};

/**
 * Monta o resumo final da sessão a partir dos exercícios prescritos do dia e das séries
 * registradas — o que vira a tela de resumo (item 19) e o `summary` (jsonb) gravado em
 * `workout_sessions` por `completeWorkoutSession`.
 */
export function buildSessionSummary(
  exercises: PrescribedExerciseLike[],
  logs: SummaryLogLike[],
  durationSec: number
): SessionSummary {
  const doneKeys = new Set<SetKey>();
  let totalVolume = 0;
  for (const log of logs) {
    if (!log.workout_exercise_id || log.set_number == null) continue;
    doneKeys.add(setKey(log.workout_exercise_id, log.set_number));
    if (log.load != null && log.reps != null) totalVolume += log.load * log.reps;
  }

  const { done: setsDone, total: setsTotal } = computeSessionProgress(exercises, doneKeys);
  const exercisesDone = exercises.filter((ex) => isExerciseDone(ex, doneKeys)).length;

  return {
    exercisesDone,
    exercisesTotal: exercises.length,
    setsDone,
    setsTotal,
    totalVolume,
    durationSec,
  };
}

// ============================================================================
// Fluxo de foco (V2 tarefa 20) — qual exercício vem depois de concluir uma série
// ============================================================================

export type FlowExerciseLike = PrescribedExerciseLike & {
  group_kind: string | null;
  group_key: string | null;
};

function hasRemaining(ex: PrescribedExerciseLike, done: ReadonlySet<SetKey>): boolean {
  return !isExerciseDone(ex, done);
}

/** Primeiro exercício (na ordem do dia) com alguma série pendente; `null` se tudo concluído. */
export function firstIncompleteIndex(flat: PrescribedExerciseLike[], done: ReadonlySet<SetKey>): number | null {
  const i = flat.findIndex((ex) => hasRemaining(ex, done));
  return i === -1 ? null : i;
}

/**
 * Depois de concluir uma série do exercício `idx` (já contada em `done`), devolve o próximo
 * exercício em foco e se vale iniciar o descanso. Exercício solto: continua nele até acabar as
 * séries, depois segue para o próximo pendente (descanso em toda série). Superset/circuito:
 * alterna entre os membros do grupo, sem descanso entre membros — o descanso só começa quando a
 * rodada fecha (voltou ao primeiro membro). Sem nada pendente: `next = null`, sem descanso.
 */
export function nextAfterSet(
  flat: FlowExerciseLike[],
  idx: number,
  done: ReadonlySet<SetKey>
): { next: number | null; rest: boolean } {
  const cur = flat[idx];
  if (!cur) return { next: null, rest: false };

  if (cur.group_key && cur.group_kind) {
    let start = idx;
    let end = idx;
    while (start > 0 && flat[start - 1].group_key === cur.group_key && flat[start - 1].group_kind === cur.group_kind) start--;
    while (end < flat.length - 1 && flat[end + 1].group_key === cur.group_key && flat[end + 1].group_kind === cur.group_kind) end++;
    const order: number[] = [];
    for (let i = idx + 1; i <= end; i++) order.push(i);
    for (let i = start; i <= idx; i++) order.push(i);
    const found = order.find((i) => hasRemaining(flat[i], done));
    if (found != null) return { next: found, rest: found <= idx };
    // Grupo inteiro concluído: segue para o próximo pendente fora dele.
    const outside = flat.findIndex((ex, i) => (i < start || i > end) && hasRemaining(ex, done));
    return outside === -1 ? { next: null, rest: false } : { next: outside, rest: true };
  }

  if (hasRemaining(cur, done)) return { next: idx, rest: true };
  for (let i = idx + 1; i < flat.length; i++) if (hasRemaining(flat[i], done)) return { next: i, rest: true };
  for (let i = 0; i < idx; i++) if (hasRemaining(flat[i], done)) return { next: i, rest: true };
  return { next: null, rest: false };
}

// ============================================================================
// Destaques do resumo — só o que dá para calcular com os dados (vs. a última sessão)
// ============================================================================

export type HighlightInput = {
  name: string;
  current: { load: number | null; reps: number | null }[];
  previous: { load: number | null; reps: number | null }[];
};

export type Highlight = { name: string; text: string };

function maxLoad(sets: { load: number | null }[]): number | null {
  const loads = sets.map((s) => s.load).filter((l): l is number => l != null && l > 0);
  return loads.length ? Math.max(...loads) : null;
}

function volume(sets: { load: number | null; reps: number | null }[]): number {
  return sets.reduce((acc, s) => acc + (s.load != null && s.reps != null ? s.load * s.reps : 0), 0);
}

const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** "Mais pesado" ou "mais volume" que a última vez — nada é inventado sem histórico anterior. */
export function buildHighlights(items: HighlightInput[]): Highlight[] {
  const out: Highlight[] = [];
  for (const it of items) {
    if (it.previous.length === 0 || it.current.length === 0) continue;
    const curMax = maxLoad(it.current);
    const prevMax = maxLoad(it.previous);
    if (curMax != null && prevMax != null && curMax > prevMax) {
      out.push({ name: it.name, text: `Carga máxima ${fmtNum(curMax)} kg (+${fmtNum(curMax - prevMax)} kg vs. última vez)` });
      continue;
    }
    const curVol = volume(it.current);
    const prevVol = volume(it.previous);
    if (curVol > 0 && prevVol > 0 && curVol > prevVol) {
      out.push({ name: it.name, text: `Volume ${Math.round(curVol)} kg (+${Math.round(curVol - prevVol)} kg vs. última vez)` });
    }
  }
  return out;
}

// ============================================================================
// Descanso por série (0020) — o timer usa o descanso da série que acabou de ser feita
// ============================================================================

/**
 * Segundos de descanso depois da série `setNumber`. `members` = o exercício solto (1 item) ou
 * todos os membros do superset/circuito (o descanso só vem ao fechar a rodada, e vale o MAIOR
 * descanso configurado entre eles). Cada membro resolve o descanso daquela série: override por
 * série se houver, senão o `rest_sec` uniforme. `null` = nada configurado (sem timer).
 */
export function restSecondsForRound(members: UniformPrescriptionLike[], setNumber: number): number | null {
  const values = members
    .map((m) => resolveSetTarget(m, setNumber).restSec)
    .filter((v): v is number => v != null);
  return values.length > 0 ? Math.max(...values) : null;
}
