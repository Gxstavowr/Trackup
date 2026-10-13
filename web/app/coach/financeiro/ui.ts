/**
 * Classes compartilhadas do Financeiro — vêm do design system (`components/ui`).
 * Vermelho (`danger`) é reservado a atraso e erro.
 */
import { buttonClass } from "@/components/ui/button";
import { cardClass } from "@/components/ui/card";

export const BUTTON_OUTLINE = buttonClass({ variant: "secondary" });
export const BUTTON_PRIMARY = buttonClass({ variant: "primary" });
// Desabilitado (ex.: "Cobrar pagamento" sem telefone no cadastro): continua com 44px de altura.
export const BUTTON_DISABLED = buttonClass({
  variant: "secondary",
  className:
    "cursor-not-allowed border-line! bg-surface-sunken text-ink-faint! opacity-70 hover:border-line! hover:text-ink-faint!",
});

export const CARD = cardClass;
export const EYEBROW = "t-label text-ink-faint";
