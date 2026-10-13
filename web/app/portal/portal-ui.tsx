import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import Icon from "@/components/ui/icon";

/**
 * Peças visuais compartilhadas do portal do aluno (item 23): ícones e classes de botão no MESMO
 * vocabulário do coach (`app/coach/avaliacoes/evaluation-ui.tsx`, `coach-nav.tsx`) — só tokens
 * de `globals.css`, nenhuma cor nova.
 */

export const ICONS: Record<
  "home" | "workout" | "nutrition" | "checkin" | "logout" | "privacy" | "chevron",
  ReactNode
> = {
  home: <Icon name="home" />,
  workout: <Icon name="workout" />,
  nutrition: <Icon name="nutrition" />,
  checkin: <Icon name="checkin" />,
  logout: <Icon name="logout" />,
  privacy: <Icon name="privacy" />,
  chevron: <Icon name="chevron" size={18} />,
};

/** Botões e card do portal — vêm do design system; botão principal ocupa a largura toda no celular. */
export const BUTTON_PRIMARY = buttonClass({ variant: "primary", size: "lg", width: "full" });
export const BUTTON_GHOST = buttonClass({ variant: "secondary" });
export const CARD = cardClass;

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
          <span className="t-label text-ink-faint">
            {eyebrow}
          </span>
        )}
        <h1 className="t-title text-ink">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export { EmptyState };
