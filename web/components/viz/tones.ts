/**
 * Tons de estado compartilhados pelos componentes de visualização. Cor SEMPRE acompanhada de
 * texto (legenda, rótulo) — nunca é a única forma de ler o estado.
 *  success = positivo (pago, concluído) · warning = atenção (pendente) · danger = crítico
 *  (atrasado, recusado) · info = neutro informativo · accent = marca · neutral = sem estado.
 */
export type VizTone = "success" | "warning" | "danger" | "info" | "accent" | "neutral";

export const TONE_COLOR: Record<VizTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  accent: "var(--brand)",
  neutral: "var(--ink-faint)",
};

/** Classe de texto equivalente (para deltas, rótulos). `danger` usa a variante legível como texto. */
export const TONE_TEXT: Record<VizTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger-text",
  info: "text-info",
  accent: "text-brand",
  neutral: "text-ink-muted",
};

/** Formato pt-BR de porcentagem com 1 casa (ex.: 84,8%). */
export function formatPercent(fraction: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(fraction);
}
