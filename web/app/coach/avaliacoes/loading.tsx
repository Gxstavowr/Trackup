import { PageSkeleton } from "@/components/ui/skeleton";

/** Fila de avaliações: esqueleto até a página resolver. */
export default function EvaluationsLoading() {
  return <PageSkeleton label="Carregando avaliações…" cards={4} />;
}
