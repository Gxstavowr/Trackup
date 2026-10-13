import { PageSkeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return <PageSkeleton label="Carregando…" cards={3} />;
}
