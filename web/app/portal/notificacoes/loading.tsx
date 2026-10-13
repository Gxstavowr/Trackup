import { PageSkeleton } from "@/components/ui/skeleton";

/** Notificações: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function NotificationsLoading() {
  return <PageSkeleton label="Carregando notificações…" cards={3} />;
}
