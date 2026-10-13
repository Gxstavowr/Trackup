"use client";

import Icon from "./icon";
import { Button } from "./button";

/**
 * Erro de segmento (usado pelos `error.tsx`). Em produção o Next esconde a mensagem real do
 * servidor, então o texto é fixo e útil: diz o que houve, que nada foi perdido e como seguir.
 */
export function ErrorState({
  title = "Algo deu errado por aqui",
  text = "Não foi possível carregar esta tela. Nada foi alterado. Tente de novo em instantes.",
  onRetry,
  digest,
}: {
  title?: string;
  text?: string;
  onRetry: () => void;
  digest?: string;
}) {
  return (
    <div
      role="alert"
      className="tk-fade mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger-tint px-6 py-12 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-danger/40 text-danger-text">
        <Icon name="alert" size={22} />
      </span>
      <p className="t-subtitle text-ink">{title}</p>
      <p className="max-w-md text-sm text-ink-muted">{text}</p>
      <Button variant="secondary" icon="refresh" onClick={onRetry} className="mt-2">
        Tentar de novo
      </Button>
      {digest && <p className="text-xs text-ink-faint">Código do erro: {digest}</p>}
    </div>
  );
}
