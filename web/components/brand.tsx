import type { SVGProps } from "react";

/**
 * Marca Trackly — símbolo de trajetória: uma curva que sobe com altos e baixos e chega a um
 * ponto de destaque (o progresso do aluno). Peça única usada em coach, portal, auth, legal e
 * convite; o mesmo desenho gera `app/icon.svg` e os ícones PWA.
 *
 * Variantes:
 *  - `full`    lockup grande (símbolo + "Trackly") — telas de entrada
 *  - `compact` lockup para navegação
 *  - `icon`    só o símbolo
 */

const MARK_PATH = "M14 46C23 46 24 31 32 32.5S43 40 50 20";

export function BrandMark({ size = 32, ...rest }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <rect width="64" height="64" rx="19" fill="var(--brand)" />
      <path
        d={MARK_PATH}
        stroke="var(--on-accent)"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="20" r="6.5" fill="var(--on-accent)" />
      <circle cx="50" cy="20" r="2.6" fill="var(--brand)" />
    </svg>
  );
}

type BrandVariant = "full" | "compact" | "icon";

const SIZES: Record<BrandVariant, { mark: number; text: string; gap: string }> = {
  full: { mark: 44, text: "text-[1.75rem]", gap: "gap-3" },
  compact: { mark: 28, text: "text-lg", gap: "gap-2" },
  icon: { mark: 32, text: "", gap: "" },
};

export default function Brand({
  variant = "compact",
  size,
  className = "",
}: {
  variant?: BrandVariant;
  /** Tamanho do símbolo em px (sobrescreve o padrão da variante). */
  size?: number;
  className?: string;
}) {
  const cfg = SIZES[variant];
  const mark = size ?? cfg.mark;

  if (variant === "icon") {
    return (
      <span role="img" aria-label="Trackly" className={`inline-flex ${className}`}>
        <BrandMark size={mark} />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${cfg.gap} ${className}`}>
      <BrandMark size={mark} />
      <span
        className={`font-display font-extrabold leading-none tracking-[-0.03em] text-ink ${cfg.text}`}
      >
        Trackly
      </span>
    </span>
  );
}
