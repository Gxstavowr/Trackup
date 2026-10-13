"use client";

import { useEffect, useState } from "react";
import { formatRestClock } from "@/lib/workout-session";
import { buttonClass } from "@/components/ui/button";
import { isRestRunning, restRemainingMs, type RestTimerState } from "./rest-timer-state";

/**
 * Timer de descanso (V2 tarefa 20). Começa sozinho ao concluir uma série, com o descanso
 * prescrito. O estado mora na sessão (`restReducer`): este componente só exibe e despacha.
 * Conta pelo relógio (hora final absoluta), então continua certo mesmo se o navegador atrasar
 * os intervalos. Pausar o descanso — ou o treino inteiro — congela o tempo restante; retomar
 * continua de onde parou. Um `aria-live` discreto avisa início, pausa e fim do descanso.
 */
export default function RestTimer({
  rest,
  onPause,
  onResume,
  onAdd,
  onDismiss,
}: {
  rest: RestTimerState;
  onPause: () => void;
  onResume: () => void;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  const running = isRestRunning(rest);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  const remainingMs = restRemainingMs(rest, now);
  const remaining = Math.ceil(remainingMs / 1000);
  const done = remaining <= 0;
  const frozen = !running && !done;

  useEffect(() => {
    if (done && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(200);
  }, [done]);

  const pct = rest.totalMs > 0 ? Math.min(100, Math.max(0, ((rest.totalMs - remainingMs) / rest.totalMs) * 100)) : 100;

  const status = done
    ? "Descanso concluído. Pode começar a próxima série."
    : rest.sessionPaused
      ? "Descanso congelado enquanto o treino está pausado."
      : rest.paused
        ? "Descanso pausado."
        : `Descanso de ${formatRestClock(Math.round(rest.totalMs / 1000))} em andamento.`;

  return (
    <div className="sticky top-[3.75rem] z-20 overflow-hidden rounded-md border border-brand-tint-strong bg-surface shadow-[var(--surface-raised-shadow)]">
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-3">
            <span className="t-label text-brand">
              {done ? "Descanso concluído" : frozen ? "Descanso pausado" : "Descanso"}
            </span>
            <span
              aria-hidden
              className={`font-display text-3xl font-bold tabular-nums ${
                done ? "text-success" : frozen ? "text-ink-muted" : "text-ink"
              }`}
            >
              {done ? "0:00" : formatRestClock(remaining)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {!done && !rest.sessionPaused && (
              <button
                type="button"
                onClick={rest.paused ? onResume : onPause}
                aria-pressed={rest.paused}
                aria-label={rest.paused ? "Retomar descanso" : "Pausar descanso"}
                className={buttonClass({ variant: rest.paused ? "primary" : "secondary", size: "sm" })}
              >
                {rest.paused ? "Retomar" : "Pausar"}
              </button>
            )}
            {!done && (
              <button
                type="button"
                onClick={onAdd}
                aria-label="Adicionar 30 segundos ao descanso"
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                +30 s
              </button>
            )}
            <button type="button" onClick={onDismiss} className={buttonClass({ variant: "tertiary", size: "sm" })}>
              {done ? "Fechar" : "Pular"}
            </button>
          </div>
        </div>
        {frozen && (
          <p className="text-xs font-medium text-brand">
            {rest.sessionPaused ? "Descanso pausado junto com o treino" : "Descanso pausado"}
          </p>
        )}
        <p className="break-words text-xs text-ink-muted">{rest.label}</p>
      </div>
      <div aria-hidden className="h-1 bg-surface-raised">
        <div className={`h-full ${frozen ? "bg-ink-faint" : "bg-brand"}`} style={{ width: `${done ? 100 : pct}%` }} />
      </div>
    </div>
  );
}
