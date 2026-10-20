import { PageSkeleton } from "@/components/ui/skeleton";

export default function EvaluationLoading() {
  return <PageSkeleton label="Carregando avaliação…" cards={3} />;
}
