import type { ReactNode } from "react";

/**
 * Peças visuais compartilhadas do portal do aluno (item 23): ícones e classes de botão no MESMO
 * vocabulário do coach (`app/coach/avaliacoes/evaluation-ui.tsx`, `coach-nav.tsx`) — só tokens
 * de `globals.css`, nenhuma cor nova.
 */

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  width: 20,
  height: 20,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ICONS: Record<
  "home" | "workout" | "nutrition" | "checkin" | "logout" | "privacy" | "chevron",
  ReactNode
> = {
  home: (
    <svg {...ICON_PROPS}>
      <path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z" />
    </svg>
  ),
  workout: (
    <svg {...ICON_PROPS}>
      <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />
    </svg>
  ),
  nutrition: (
    <svg {...ICON_PROPS}>
      <path d="M7 3v7a2.5 2.5 0 0 0 5 0V3M9.5 3v18M17 3c-2 1.6-3 3.8-3 6.5 0 2 1 3 3 3.5V21" />
    </svg>
  ),
  checkin: (
    <svg {...ICON_PROPS}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 13l2 2 4-4" />
    </svg>
  ),
  logout: (
    <svg {...ICON_PROPS}>
      <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 8l4 4-4 4M20 12H9" />
    </svg>
  ),
  privacy: (
    <svg {...ICON_PROPS}>
      <path d="M12 3 5 6v5c0 4.5 3 8.3 7 9.5 4-1.2 7-5 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  chevron: (
    <svg {...ICON_PROPS} width={18} height={18}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
};

/** Botões — alvo de toque >= 44px, largura total no celular. */
export const BUTTON_PRIMARY =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-medium text-on-accent transition-opacity hover:opacity-90";
export const BUTTON_GHOST =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong";

/** Card padrão — mesma superfície elevada do coach. */
export const CARD =
  "rounded-lg border border-line bg-surface shadow-[var(--surface-raised-shadow)]";

/** Título de tela interna (o "Trackly · Aluno" fica na barra fixa do layout). */
export function PageHeader({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            {eyebrow}
          </span>
        )}
        <h1 className="font-display text-hero text-ink">{title}</h1>
      </div>
      {children}
    </header>
  );
}

/** Estado vazio explicativo (tracejado), igual ao do coach. */
export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{text}</p>
    </div>
  );
}
