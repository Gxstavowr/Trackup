"use client";

import { BUTTON_OUTLINE } from "./ui";

/**
 * Erro do Financeiro (falha de consulta etc.). Em produção o Next esconde a mensagem real do
 * servidor, então o texto é fixo e útil: diz o que aconteceu e oferece tentar de novo.
 */
export default function FinanceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">Trackly · Coach</span>
        <h1 className="font-display text-hero text-ink">Financeiro</h1>
      </header>

      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-lg border border-late/40 bg-late-tint px-6 py-12 text-center"
      >
        <p className="font-display text-hero text-ink">Não foi possível carregar o financeiro</p>
        <p className="max-w-md text-sm text-ink-muted">
          Algo falhou ao buscar seus pagamentos. Nenhum dado foi alterado. Tente de novo em instantes.
        </p>
        <button type="button" onClick={reset} className={`${BUTTON_OUTLINE} mt-2`}>
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
