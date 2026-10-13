import { PageSkeleton } from "@/components/ui/skeleton";

/** Check-in semanal: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function CheckinLoading() {
  return <PageSkeleton label="Carregando check-in…" cards={3} />;
}
