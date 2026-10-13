import { PageSkeleton } from "@/components/ui/skeleton";

export default function CoachLoading() {
  return <PageSkeleton label="Carregando…" cards={3} columns />;
}
