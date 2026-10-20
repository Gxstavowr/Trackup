import type { HTMLAttributes } from "react";

/** Superfície padrão (classe `.card` em globals.css: grafite, borda fina, raio grande). */
export const cardClass = "card";

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-7" } as const;

/**
 * Variações de superfície (V5):
 *  - `default` cartão grafite (`.card`) — no painel do coach fica um degrau mais escuro que ele.
 *  - `raised`  destaque: um degrau mais claro (bloco principal, decisão, item selecionado).
 *  - `sunken`  poço interno, sem brilho (sub-bloco dentro de outro cartão).
 *  - `outline` só contorno (agrupamento leve, sem peso visual).
 * Use variações para alternar ritmo na página — nem tudo precisa ser o mesmo retângulo.
 */
const VARIANTS = {
  default: cardClass,
  raised: "rounded-[var(--radius-lg)] border border-line-strong bg-surface-raised shadow-[var(--surface-raised-shadow)]",
  sunken: "rounded-[var(--radius-lg)] border border-line bg-surface-sunken",
  outline: "rounded-[var(--radius-lg)] border border-line-strong bg-transparent",
} as const;

export type CardVariant = keyof typeof VARIANTS;

export function Card({
  padding = "md",
  variant = "default",
  enter = false,
  className = "",
  as: Tag = "div",
  ...rest
}: {
  padding?: keyof typeof PADDING;
  variant?: CardVariant;
  /** Entrada suave (`.tk-enter`) ao montar — desligada com movimento reduzido. */
  enter?: boolean;
  as?: "div" | "section" | "article" | "li" | "ul";
} & HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={`${VARIANTS[variant]} ${PADDING[padding]} ${enter ? "tk-enter" : ""} ${className}`}
      {...rest}
    />
  );
}
