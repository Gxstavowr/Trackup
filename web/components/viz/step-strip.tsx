import Icon from "../ui/icon";

export type StepState = "done" | "current" | "upcoming";
export type StripStep = { key: string; label: string; state: StepState; hint?: string };

/**
 * Faixa de etapas (linha do tempo horizontal): dias de treino da semana, etapas de um fluxo etc.
 * Cada etapa: marcador (✓ verde = feito, anel amarelo = atual, vazio = a fazer) ligado por um
 * trilho; o trecho já percorrido fica verde. Estado SEMPRE também em texto (sr-only + rótulo),
 * nunca só por cor. Rola na horizontal se não couber (ex.: planos com muitos dias no celular).
 */
export function StepStrip({
  steps,
  label,
  className = "",
}: {
  steps: StripStep[];
  /** Nome acessível da lista (ex.: "Dias de treino desta semana"). */
  label: string;
  className?: string;
}) {
  const stateText: Record<StepState, string> = { done: "feito", current: "atual", upcoming: "a fazer" };
  return (
    <ol
      aria-label={label}
      className={`tk-stagger flex min-w-0 items-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key} className="relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-1.5 text-center">
            {/* trilho do centro desta etapa até o centro da próxima — a próxima <li> é pintada depois
                e o marcador dela (opaco) cobre a ponta; o trecho já percorrido fica verde */}
            {!last && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-[15px] h-0.5 w-full ${step.state === "done" ? "bg-success" : "bg-line-strong"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-[1] flex size-8 items-center justify-center rounded-full border-2 font-display text-xs font-bold tabular-nums ${
                step.state === "done"
                  ? "border-success bg-success text-on-accent"
                  : step.state === "current"
                    ? "border-brand bg-surface-sunken text-brand shadow-[0_0_0_4px_var(--brand-tint)]"
                    : "border-line-strong bg-surface-sunken text-ink-faint"
              }`}
            >
              {step.state === "done" ? <Icon name="check" size={16} strokeWidth={2.6} /> : i + 1}
            </span>
            <span
              className={`max-w-[6.5rem] truncate text-xs ${
                step.state === "current" ? "font-bold text-ink" : step.state === "done" ? "font-semibold text-ink-muted" : "text-ink-faint"
              }`}
            >
              {step.label}
              <span className="sr-only"> — {stateText[step.state]}</span>
            </span>
            {step.hint && <span className="-mt-1 text-[0.6875rem] text-ink-faint">{step.hint}</span>}
          </li>
        );
      })}
    </ol>
  );
}
