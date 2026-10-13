import type { ReactNode } from "react";
import Icon, { type IconName } from "./icon";

/**
 * Estado vazio padrão do app: composição discreta (ícone de traço dentro de um anel pontilhado),
 * título curto, texto orientado à próxima ação e, quando há ação, um botão. `compact` serve
 * para blocos dentro de cards/listas (sem moldura tracejada grande).
 */
export function EmptyState({
  title,
  text,
  icon = "info",
  action,
  compact = false,
  className = "",
}: {
  title: string;
  text?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`tk-fade flex flex-col items-center text-center ${
        compact
          ? "gap-2 rounded-lg border border-dashed border-line px-4 py-6"
          : "gap-3 rounded-lg border border-dashed border-line-strong px-6 py-12"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`relative flex items-center justify-center rounded-full border border-dotted border-line-strong ${
          compact ? "size-12" : "size-16"
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-full border border-line bg-surface-raised text-brand ${
            compact ? "size-8" : "size-11"
          }`}
        >
          <Icon name={icon} size={compact ? 16 : 20} />
        </span>
        <span className="absolute -right-0.5 top-1.5 size-1.5 rounded-full bg-brand/70" />
        <span className="absolute -left-0.5 bottom-2 size-1 rounded-full bg-line-strong" />
      </span>
      <p className={compact ? "text-sm font-semibold text-ink" : "t-subtitle text-ink"}>{title}</p>
      {text && <p className="max-w-sm text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
