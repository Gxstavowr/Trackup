import { PageSkeleton } from "@/components/ui/skeleton";

/** Treino do dia: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function TrainingLoading() {
  return <PageSkeleton label="Carregando treino…" cards={3} />;
}
