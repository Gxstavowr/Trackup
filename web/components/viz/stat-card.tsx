import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "../ui/icon";
import { TONE_TEXT, type VizTone } from "./tones";

/**
 * Cartão de KPI (linha de indicadores da referência): rótulo pequeno em cima, valor grande em
 * branco, apoio opcional embaixo. O valor chega JÁ FORMATADO por quem chama (ex.:
 * `formatBRL(cents)`) — o componente não inventa nem calcula número nenhum. Sem dado real,
 * passe `value={null}`: mostra "—" e o `emptyHint`.
 *
 * `delta` é um texto curto de variação (ex.: "+12% vs. setembro") com tom de estado. `tone`
 * pinta o VALOR (use com moderação: só para destacar um KPI crítico, ex.: atraso em `danger`).
 * Com `href`, o cartão inteiro vira link (atalho para o detalhe).
 */
export function StatCard({
  label,
  value,
  hint,
  emptyHint = "Sem dados no período",
  delta,
  icon,
  tone,
  href,
  className = "",
}: {
  label: string;
  value: ReactNode | null;
  hint?: ReactNode;
  emptyHint?: ReactNode;
  delta?: { text: string; tone: VizTone };
  icon?: IconName;
  tone?: VizTone;
  href?: string;
  className?: string;
}) {
  const empty = value === null || value === undefined;
  const body = (
    <>
      {/* rótulo quebra em até 2 linhas (cartões de 2 colunas no celular cortavam "Alunos re…") */}
      <div className="flex items-start gap-2 text-sm font-semibold leading-snug text-ink">
        {icon && <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-ink-muted" />}
        <span className="line-clamp-2 min-w-0">{label}</span>
        {href && <Icon name="chevron" size={14} className="ml-auto mt-0.5 shrink-0 text-ink-faint" />}
      </div>
      {/* tamanho pelo cartão (container query): valores longos ("R$ 105.355,80") cabem em 2 colunas
          no celular sem cortar; quebra só como último recurso */}
      <p className={`t-stat mt-3 text-[clamp(1.05rem,11.5cqi,2rem)] [overflow-wrap:anywhere] ${empty ? "text-ink-faint" : tone ? TONE_TEXT[tone] : "text-ink"}`}>
        {/* key: o número reanima (tk-rise) quando o valor muda */}
        <span key={typeof value === "string" || typeof value === "number" ? value : undefined} className="tk-rise">
          {empty ? "—" : value}
        </span>
      </p>
      {(delta || hint || empty) && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-ink-muted">
          {delta && !empty && <span className={`font-semibold ${TONE_TEXT[delta.tone]}`}>{delta.text}</span>}
          {empty ? emptyHint : hint}
        </p>
      )}
    </>
  );

  const base = `card @container block min-w-0 p-4 md:p-5 ${className}`;
  if (href) {
    return (
      <Link
        href={href}
        className={`${base} transition-colors hover:border-line-strong hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}

/**
 * Linha de KPIs: 2 colunas no celular, até 4 a partir de `lg` (entrada em cascata). Passe
 * `StatCard`s como filhos.
 */
export function KpiRow({
  children,
  columns = 4,
  className = "",
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return <div className={`tk-stagger grid grid-cols-2 gap-3 ${cols} ${className}`}>{children}</div>;
}
