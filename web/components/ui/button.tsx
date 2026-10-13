import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import Icon, { type IconName } from "./icon";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
/** `full` = 100%, `mobile` = 100% no celular e automático a partir de `sm`, `auto` = largura do conteúdo. */
export type ButtonWidth = "auto" | "mobile" | "full";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold " +
  "transition-[background-color,border-color,color,transform,opacity] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-accent hover:bg-brand-deep disabled:hover:bg-brand",
  secondary:
    "border border-line-control bg-transparent text-ink hover:border-brand hover:text-brand active:bg-brand-tint",
  tertiary:
    "border border-transparent bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink",
  danger:
    "border border-danger/50 bg-danger-tint text-danger-text hover:border-danger hover:bg-danger/25",
};

// Alvo de toque mínimo de 44px no celular; `sm` encolhe só a partir de `md` (mouse).
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 text-sm md:min-h-9 md:px-3.5",
  md: "min-h-11 px-5 text-sm",
  lg: "min-h-12 px-6 text-base",
};

const WIDTHS: Record<ButtonWidth, string> = {
  auto: "",
  mobile: "w-full sm:w-auto",
  full: "w-full",
};

/** Classes de botão — use direto em `<Link>`/`<a>`/`<button>` quando o `Button` não encaixa. */
export function buttonClass({
  variant = "primary",
  size = "md",
  width = "auto",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  className?: string;
} = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], WIDTHS[width], className].filter(Boolean).join(" ");
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: ButtonWidth;
  /** Ícone opcional (nome do conjunto `Icon`) antes / depois do texto. */
  icon?: IconName;
  iconAfter?: IconName;
  children?: ReactNode;
};

/** Indicador de carregamento do botão pendente (gira; parado com movimento reduzido). */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="tk-spin" viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant,
  size,
  width,
  icon,
  iconAfter,
  className,
  children,
  type = "button",
  pending = false,
  pendingLabel,
  disabled,
  ...rest
}: CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Ação em andamento: desabilita, mostra o indicador e (opcional) troca o texto. */
    pending?: boolean;
    pendingLabel?: ReactNode;
  }) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, width, className })}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? <Spinner /> : icon && <Icon name={icon} size={18} />}
      {pending && pendingLabel !== undefined ? pendingLabel : children}
      {iconAfter && <Icon name={iconAfter} size={18} />}
    </button>
  );
}

/** Mesmo visual do `Button`, renderizado como `next/link`. */
export function ButtonLink({
  variant,
  size,
  width,
  icon,
  iconAfter,
  className,
  children,
  ...rest
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass({ variant, size, width, className })} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={18} />}
    </Link>
  );
}
