import { PageSkeleton } from "@/components/ui/skeleton";

/** Plano alimentar do dia: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function NutritionLoading() {
  return <PageSkeleton label="Carregando nutrição…" cards={3} />;
}
