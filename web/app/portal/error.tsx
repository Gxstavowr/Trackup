"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Erro de qualquer tela do aluno (a navegação do portal continua de pé). */
export default function PortalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      title="Não conseguimos carregar esta tela"
      text="Seus dados continuam salvos. Confira a conexão e tente de novo."
      onRetry={retry}
      digest={error.digest}
    />
  );
}
