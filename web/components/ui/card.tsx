import type { HTMLAttributes } from "react";

/** Superfície padrão (classe `.card` em globals.css: grafite, borda fina, raio grande). */
export const cardClass = "card";

const PADDING = { none: "", sm: "p-4", md: "p-5", lg: "p-7" } as const;

export function Card({
  padding = "md",
  className = "",
  as: Tag = "div",
  ...rest
}: {
  padding?: keyof typeof PADDING;
  as?: "div" | "section" | "article" | "li" | "ul";
} & HTMLAttributes<HTMLElement>) {
  return <Tag className={`${cardClass} ${PADDING[padding]} ${className}`} {...rest} />;
}
