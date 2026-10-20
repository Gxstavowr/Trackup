"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Gráfico de área escuro (referência: "Transações"): série em cinza claro sobre área cinza
 * translúcida, grade quase invisível, linhas verticais por ponto e UM ponto destacado com
 * balão (valor + rótulo) e haste até a base.
 *
 * Por que SVG próprio e não `recharts` (que já está no projeto, em evolution-view)? Este é o
 * visual da casa para séries simples: leve, sem medir o DOM (o SVG escala por viewBox e os
 * textos/pontos são HTML posicionados em %, então não distorcem), funciona com teclado e não
 * puxa o bundle do recharts para páginas que só precisam disso. Para gráficos com várias
 * séries/eixos, continue usando recharts com os tokens `--chart-*`.
 *
 * Dados REAIS apenas: `data` vazio (ou com menos de 2 pontos) mostra `emptyLabel` — nunca
 * preencha com valores fictícios. Valores negativos não são suportados (eixo começa em 0).
 *
 * Interação: passar o mouse/dedo destaca o ponto mais próximo; com foco, ← → Home End navegam.
 * Uma tabela oculta (sr-only) entrega os mesmos dados a leitores de tela.
 *
 * Props serializáveis (pode ser usado direto de um Server Component): o formato vem por
 * `valueFormat`, e cada ponto pode trazer `display` já formatado para o balão.
 */
export type AreaPoint = {
  /** Rótulo do eixo X (curto: "seg", "05/10", "out"). */
  label: string;
  value: number;
  /** Texto do balão (padrão: `value` formatado por `valueFormat`). */
  display?: string;
  /** Linha secundária do balão (padrão: `label`). */
  detail?: string;
};

export type AreaValueFormat = "number" | "brl" | "brl-cents";

function formatValue(n: number, fmt: AreaValueFormat, compact = false): string {
  const v = fmt === "brl-cents" ? n / 100 : n;
  if (fmt === "number") {
    return new Intl.NumberFormat("pt-BR", compact ? { notation: "compact" } : {}).format(v);
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  }).format(v);
}

/** Teto "redondo" do eixo e passo entre linhas de grade. */
function niceScale(max: number, ticks: number): { top: number; step: number } {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = nice * mag;
  return { top: step * Math.ceil(max / step), step };
}

export function AreaChart({
  data,
  label,
  valueFormat = "number",
  height = 240,
  ticks = 4,
  defaultIndex,
  emptyLabel = "Ainda não há dados suficientes para o gráfico.",
  className = "",
}: {
  data: AreaPoint[];
  /** Nome acessível (ex.: "Recebimentos por semana"). */
  label: string;
  valueFormat?: AreaValueFormat;
  /** Altura da área de plotagem em px (sem os rótulos do eixo X). */
  height?: number;
  ticks?: number;
  /** Ponto destacado inicialmente (ex.: o último). Sem ele, nenhum balão até interagir. */
  defaultIndex?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const gradId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(
    defaultIndex !== undefined && defaultIndex >= 0 && defaultIndex < data.length ? defaultIndex : null,
  );

  if (data.length < 2) {
    return (
      <div
        className={`flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 text-center text-sm text-ink-faint ${className}`}
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(...data.map((d) => Math.max(0, d.value)));
  const { top, step } = niceScale(max, ticks);
  const gridValues: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) gridValues.push(v);

  const n = data.length;
  const pts = data.map((d, i) => ({
    x: (i / (n - 1)) * 100,
    y: 100 - (Math.max(0, d.value) / top) * 100,
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L100,100 L0,100 Z`;

  function indexFromPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const rel = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setActive(Math.round(rel * (n - 1)));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = active ?? -1;
    let next: number;
    if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur < 0 ? n - 1 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") return setActive(defaultIndex ?? null);
    else return;
    e.preventDefault();
    setActive(next);
  }

  const a = active !== null ? data[active] : null;
  const ap = active !== null ? pts[active] : null;
  // Rótulos do eixo X: todos se couberem; senão, ~6 espaçados (primeiro e último sempre).
  const every = n <= 8 ? 1 : Math.ceil(n / 6);

  return (
    <figure className={`min-w-0 ${className}`}>
      <div className="flex">
        {/* eixo Y */}
        <div className="relative w-11 shrink-0" style={{ height }} aria-hidden>
          {gridValues.map((v) => (
            <span
              key={v}
              className="absolute right-2 -translate-y-1/2 text-[0.6875rem] tabular-nums text-ink-faint"
              style={{ top: `${100 - (v / top) * 100}%` }}
            >
              {formatValue(v, valueFormat, true)}
            </span>
          ))}
        </div>

        <div
          ref={plotRef}
          role="group"
          aria-label={`${label}. Use as setas para percorrer os pontos.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={indexFromPointer}
          onPointerDown={indexFromPointer}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(defaultIndex ?? null)}
          className="relative min-w-0 flex-1 touch-pan-y rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          style={{ height }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-hidden
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-area)" />
                <stop offset="100%" stopColor="var(--chart-area-fade)" />
              </linearGradient>
            </defs>
            {gridValues.map((v) => (
              <line
                key={`h${v}`}
                x1="0"
                x2="100"
                y1={100 - (v / top) * 100}
                y2={100 - (v / top) * 100}
                stroke="var(--chart-grid)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {pts.map((p, i) => (
              <line key={`v${i}`} x1={p.x} x2={p.x} y1="0" y2="100" stroke="var(--chart-grid)" vectorEffect="non-scaling-stroke" />
            ))}
            <g className="tk-grow-y">
              <path d={area} fill={`url(#${gradId})`} />
              <path
                d={line}
                fill="none"
                stroke="var(--chart-line)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
            {ap && (
              <line
                x1={ap.x}
                x2={ap.x}
                y1={ap.y}
                y2="100"
                stroke="var(--chart-point)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* pontos (HTML, para não deformar com o viewBox esticado) */}
          {pts.map((p, i) => (
            <span
              key={i}
              aria-hidden
              className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height] duration-150 ${
                i === active ? "size-3 bg-white ring-4 ring-white/15" : "size-1.5 bg-chart-line"
              }`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}

          {a && ap && (
            <div
              aria-live="polite"
              className="pointer-events-none absolute z-10 min-w-16 rounded-[10px] border border-line-strong bg-surface-sunken/95 px-3 py-1.5 shadow-[var(--shadow-overlay)]"
              style={{
                left: `${ap.x}%`,
                top: `${ap.y}%`,
                transform: `translate(${ap.x < 12 ? "-10%" : ap.x > 88 ? "-90%" : "-50%"}, calc(-100% - 14px))`,
              }}
            >
              <p className="whitespace-nowrap font-display text-sm font-bold tabular-nums text-ink">
                {a.display ?? formatValue(a.value, valueFormat)}
              </p>
              <p className="whitespace-nowrap text-xs text-ink-faint">{a.detail ?? a.label}</p>
            </div>
          )}
        </div>
      </div>

      {/* eixo X */}
      <div className="relative ml-11 mt-2 h-4" aria-hidden>
        {data.map((d, i) =>
          i % every === 0 || i === n - 1 ? (
            <span
              key={i}
              className={`absolute whitespace-nowrap text-[0.6875rem] text-ink-faint ${
                i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2"
              }`}
              style={{ left: `${pts[i].x}%` }}
            >
              {d.label}
            </span>
          ) : null,
        )}
      </div>

      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.detail ?? d.label}</th>
              <td>{d.display ?? formatValue(d.value, valueFormat)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
