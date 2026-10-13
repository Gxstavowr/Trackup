/**
 * Estado do timer de descanso como um único valor + transições puras (sem React), para que
 * pausar o descanso ou o treino inteiro nunca descarte o tempo restante.
 *
 * Modelo: enquanto conta, a verdade é `endsAt` (hora final absoluta, Date.now()) — o navegador
 * pode atrasar intervalos sem desviar a contagem. Parado, `endsAt` é null e a verdade é
 * `remainingMs`, congelado no instante da pausa. Há duas causas de parada independentes:
 * `paused` (o aluno pausou o descanso) e `sessionPaused` (o treino inteiro foi pausado). Ao
 * retomar o treino, um descanso que o aluno tinha pausado continua pausado.
 */
export type RestTimerState = {
  /** Identifica o descanso (muda a cada série concluída). */
  key: string;
  label: string;
  /** Hora final absoluta enquanto conta; null quando parado. */
  endsAt: number | null;
  /** Tempo restante congelado (válido quando `endsAt` é null). */
  remainingMs: number;
  /** Duração total (cresce com +30 s), para a barra de progresso. */
  totalMs: number;
  /** Pausado pelo aluno no próprio timer. */
  paused: boolean;
  /** Congelado porque o treino está pausado. */
  sessionPaused: boolean;
};

export type RestTimerAction =
  | { type: "start"; key: string; label: string; seconds: number; now: number }
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "add"; ms: number; now: number }
  | { type: "sessionPause"; now: number }
  | { type: "sessionResume"; now: number }
  | { type: "skip" };

export const REST_ADD_MS = 30_000;

/**
 * Tempo restante (ms, nunca negativo) no instante `now`. Contando, nunca passa de
 * `remainingMs` (o restante no último início/retomada), então um `now` atrasado — ex.: o
 * relógio da tela antes do primeiro tique após retomar — não faz o número "pular para cima".
 */
export function restRemainingMs(s: RestTimerState, now: number): number {
  return Math.max(0, s.endsAt != null ? Math.min(s.endsAt - now, s.remainingMs) : s.remainingMs);
}

export function isRestRunning(s: RestTimerState): boolean {
  return s.endsAt != null;
}

/** Recalcula `endsAt`/`remainingMs` a partir das causas de parada, preservando o restante. */
function settle(s: RestTimerState, remaining: number, now: number): RestTimerState {
  const stopped = s.paused || s.sessionPaused;
  return stopped
    ? { ...s, endsAt: null, remainingMs: remaining }
    : { ...s, endsAt: now + remaining, remainingMs: remaining };
}

export function restReducer(state: RestTimerState | null, action: RestTimerAction): RestTimerState | null {
  if (action.type === "start") {
    const ms = Math.max(0, action.seconds * 1000);
    return {
      key: action.key,
      label: action.label,
      endsAt: action.now + ms,
      remainingMs: ms,
      totalMs: ms,
      paused: false,
      sessionPaused: false,
    };
  }
  if (action.type === "skip") return null;
  if (!state) return state;

  const remaining = restRemainingMs(state, action.now);
  switch (action.type) {
    case "pause":
      if (state.paused || remaining <= 0) return state;
      return settle({ ...state, paused: true }, remaining, action.now);
    case "resume":
      if (!state.paused) return state;
      return settle({ ...state, paused: false }, remaining, action.now);
    case "sessionPause":
      if (state.sessionPaused) return state;
      return settle({ ...state, sessionPaused: true }, remaining, action.now);
    case "sessionResume":
      if (!state.sessionPaused) return state;
      return settle({ ...state, sessionPaused: false }, remaining, action.now);
    case "add": {
      if (action.ms <= 0) return state;
      // Descanso já zerado: +30 s recomeça a contar a partir de agora.
      const totalMs = (remaining <= 0 ? 0 : state.totalMs) + action.ms;
      const base = remaining <= 0 ? { ...state, totalMs, paused: false } : { ...state, totalMs };
      return settle(base, remaining + action.ms, action.now);
    }
  }
}
