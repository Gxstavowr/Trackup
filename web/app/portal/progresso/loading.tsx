import { PageSkeleton } from "@/components/ui/skeleton";

/** Progresso: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function ProgressLoading() {
  return <PageSkeleton label="Carregando progresso…" cards={3} />;
}
