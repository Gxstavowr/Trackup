import { TONE_COLOR, type VizTone } from "./tones";

/**
 * Barra de medição horizontal (macros, metas, progresso de sessão). Valor e referência REAIS
 * vindos de quem chama; a barra limita a fração a 0..1 e o preenchimento cresce ao montar
 * (`.tk-grow-x`) e desliza ao mudar (transição de largura) — ambos desligados com movimento
 * reduzido. `label` é o nome acessível (`role="progressbar"`). Sem referência (`max` nulo ou 0),
 * a barra fica vazia e `aria-valuenow` não é anunciado como fração.
 */
export function MeterBar({
  value,
  max,
  label,
  tone = "accent",
  color,
  size = "md",
  className = "",
}: {
  value: number | null | undefined;
  max: number | null | undefined;
  label: string;
  tone?: VizTone;
  /** Cor categórica (ex.: `var(--c3)`) quando a barra NÃO representa estado — sobrepõe `tone`. */
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const ref = max != null && max > 0 ? max : null;
  const v = value ?? 0;
  const fraction = ref ? Math.min(1, Math.max(0, v / ref)) : 0;
  const height = { sm: "h-1.5", md: "h-2", lg: "h-2.5" }[size];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={ref ?? 0}
      aria-valuenow={v}
      className={`${height} overflow-hidden rounded-full bg-surface-sunken ${className}`}
    >
      {fraction > 0 && (
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{ width: `${fraction * 100}%`, background: color ?? TONE_COLOR[tone] }}
        >
          <div className="tk-grow-x h-full w-full rounded-full" style={{ background: "inherit" }} />
        </div>
      )}
    </div>
  );
}
