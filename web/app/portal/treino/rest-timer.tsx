"use client";

import { useEffect, useState } from "react";
import { formatRestClock } from "@/lib/workout-session";

/**
 * Timer de descanso (item 19) — conta regressivo a partir do `rest_sec` prescrito, some
 * quando o aluno fecha ou quando chega a zero e ele confirma. `restKey` muda a cada nova
 * série marcada (ver `session-view.tsx`), o que remonta este componente (via `key` no
 * elemento pai) e reinicia a contagem — mais simples e confiável do que sincronizar um
 * `useEffect` sobre o valor de segundos mudando.
 */
export default function RestTimer({
  seconds,
  label,
  onDismiss,
}: {
  seconds: number;
  label: string;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const done = remaining <= 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-tint-strong bg-brand-tint px-4 py-3 shadow-[var(--surface-raised-shadow)]"
    >
      <div className="min-w-0">
        <p className="font-mono text-label uppercase tracking-widest text-brand">
          {done ? "Descanso concluído" : "Descanso"}
        </p>
        <p className="break-words text-sm text-ink-muted">{label}</p>
      </div>

      <div className="flex items-center gap-2">
        {!done && (
          <span className="font-display text-2xl tabular-nums text-ink">{formatRestClock(remaining)}</span>
        )}
        {!done && (
          <button
            type="button"
            onClick={() => setRemaining((s) => s + 15)}
            className="min-h-9 rounded-md border border-line px-2.5 text-xs text-ink hover:border-brand"
          >
            +15s
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 rounded-md border border-line px-2.5 text-xs text-ink-muted hover:border-brand"
        >
          {done ? "Fechar" : "Pular"}
        </button>
      </div>
    </div>
  );
}
