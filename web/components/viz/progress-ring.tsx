import type { ReactNode } from "react";
import { TONE_COLOR, type VizTone } from "./tones";

/**
 * Anel de progresso (SVG puro, Server Component). `value`/`max` reais — o anel desenha a fração
 * (limitada a 0..1) e se anima ao montar (`.tk-ring-draw`, desligado com movimento reduzido).
 * O centro mostra `children` (ex.: "3/5") ou, por padrão, a porcentagem arredondada.
 * `label` é o nome acessível (ex.: "Check-ins da semana") — o SVG vira `role="img"`.
 */
export function ProgressRing({
  value,
  max = 1,
  label,
  size = 96,
  thickness = 10,
  tone = "accent",
  children,
  className = "",
}: {
  value: number;
  max?: number;
  label: string;
  size?: number;
  thickness?: number;
  tone?: VizTone;
  children?: ReactNode;
  className?: string;
}) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - fraction);
  const pct = Math.round(fraction * 100);

  return (
    <div
      role="img"
      aria-label={`${label}: ${pct}%`}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
        {fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE_COLOR[tone]}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="tk-ring-draw"
            style={{ ["--tk-ring-from" as string]: c }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-center font-display text-lg font-bold tabular-nums text-ink">
        {children ?? `${pct}%`}
      </span>
    </div>
  );
}
