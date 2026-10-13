import { PageSkeleton } from "@/components/ui/skeleton";

/** Conta: esqueleto até a página resolver. Renderiza dentro do <main> do portal, que já reserva o espaço da barra de abas (--portal-nav-h). */
export default function AccountLoading() {
  return <PageSkeleton label="Carregando sua conta…" cards={2} />;
}
