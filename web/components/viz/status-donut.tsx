import type { ReactNode } from "react";
import { formatPercent, TONE_COLOR, type VizTone } from "./tones";

export type DonutSegment = {
  label: string;
  /** Quantidade REAL (contagem ou valor). Segmentos com 0 aparecem só na legenda. */
  value: number;
  tone: VizTone;
  /** Texto exibido na coluna da direita da legenda; padrão = `value` em pt-BR. */
  display?: string;
};

/**
 * Donut de distribuição por situação + legenda (referência: Aprovadas / Pendente / Recusadas).
 * SVG puro (Server Component), traço grosso, segmentos com as cores fortes de estado, entrada
 * desenhando o anel. A legenda mostra quadrado de cor + rótulo + % + valor — a leitura nunca
 * depende só da cor. Total 0 = anel vazio com `emptyLabel` (não inventa distribuição).
 *
 * `layout`: `stack` (donut em cima, legenda embaixo — como na referência) ou `side` (lado a lado
 * a partir de `sm`). `center` substitui o conteúdo do miolo (padrão: total).
 */
export function StatusDonut({
  segments,
  label,
  size = 168,
  thickness = 26,
  layout = "stack",
  center,
  emptyLabel = "Sem registros no período",
  className = "",
}: {
  segments: DonutSegment[];
  /** Nome acessível do gráfico (ex.: "Pagamentos por situação"). */
  label: string;
  size?: number;
  thickness?: number;
  layout?: "stack" | "side";
  center?: ReactNode;
  emptyLabel?: string;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const nf = new Intl.NumberFormat("pt-BR");

  const visible = total > 0 ? segments.filter((s) => s.value > 0) : [];
  const arcs = visible.map((s, i) => {
    const before = visible.slice(0, i).reduce((sum, v) => sum + v.value, 0);
    return { ...s, len: (s.value / total) * c, start: (before / total) * c };
  });

  const summary =
    total > 0
      ? segments.map((s) => `${s.label}: ${formatPercent(s.value / total)}`).join(", ")
      : emptyLabel;

  return (
    <figure
      className={`flex gap-5 ${layout === "side" ? "flex-col items-center sm:flex-row sm:items-center" : "flex-col items-center"} ${className}`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}. ${summary}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TONE_COLOR[a.tone]}
              strokeWidth={thickness}
              strokeDasharray={`${a.len} ${c - a.len}`}
              strokeDashoffset={-a.start}
              className="tk-seg-draw"
              style={{ ["--tk-dash-from" as string]: `0 ${c}` }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {center ??
            (total > 0 ? (
              <>
                <span className="font-display text-2xl font-bold tabular-nums text-ink">{nf.format(total)}</span>
                <span className="text-xs text-ink-faint">total</span>
              </>
            ) : (
              <span className="max-w-[70%] text-xs text-ink-faint">{emptyLabel}</span>
            ))}
        </div>
      </div>

      <figcaption className="w-full min-w-0 flex-1">
        <ul className="flex flex-col gap-2.5">
          {segments.map((s) => (
            <li key={s.label} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 text-sm">
              <span aria-hidden className="size-3.5 rounded-[4px]" style={{ background: TONE_COLOR[s.tone] }} />
              <span className="min-w-0 truncate font-semibold text-ink">{s.label}</span>
              <span className="tabular-nums text-ink-muted">{total > 0 ? formatPercent(s.value / total) : "—"}</span>
              <span className="min-w-[2.5rem] text-right font-semibold tabular-nums text-ink">
                {s.display ?? nf.format(s.value)}
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
