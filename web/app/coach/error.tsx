"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Erro de qualquer tela do coach (a casca com a navegação continua de pé). */
export default function CoachError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState onRetry={retry} digest={error.digest} />;
}
