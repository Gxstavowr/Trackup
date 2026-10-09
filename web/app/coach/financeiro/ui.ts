/**
 * Classes compartilhadas do Financeiro — só tokens de `globals.css` (nada de cor solta).
 * Vermelho queimado (`late`/`coral`) é reservado a atraso e erro.
 */

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export const BUTTON_OUTLINE = `${BUTTON_BASE} border border-line text-ink hover:border-brand`;
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-brand font-medium text-on-accent hover:opacity-90 disabled:opacity-60`;
// Desabilitado (ex.: "Cobrar pagamento" sem telefone no cadastro): fica em 44px em QUALQUER
// breakpoint — sem o `sm:min-h-10` do BUTTON_BASE — porque não há hover/foco reforçando o alvo
// no desktop como nos outros dois acima (item 36 do TODO: media 40px no desktop).
export const BUTTON_DISABLED =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm " +
  "transition-colors cursor-not-allowed border border-line bg-surface-sunken text-ink-faint";

export const CARD = "rounded-lg border border-line bg-surface";
export const EYEBROW = "font-mono text-label uppercase tracking-widest text-ink-faint";
