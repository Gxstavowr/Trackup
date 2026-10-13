import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-ink-muted",
  accent: "bg-brand-tint text-brand",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger-text",
  info: "bg-info-tint text-info",
};

const BASE =
  "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold leading-none";

export function badgeClass(tone: BadgeTone = "neutral", className = ""): string {
  return `${BASE} ${TONES[tone]} ${className}`.trim();
}

/**
 * Badge de estado. O texto é obrigatório (children) — o estado nunca depende só da cor;
 * `dot` adiciona um marcador extra.
 */
export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={badgeClass(tone, className)}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
