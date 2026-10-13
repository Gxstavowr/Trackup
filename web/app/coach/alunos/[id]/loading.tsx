import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * Conteúdo de uma aba do aluno. O cabeçalho do aluno e as abas vêm do layout (que já está na
 * tela ao trocar de aba), então o esqueleto cobre só a área de conteúdo — sem repetir avatar/abas.
 */
export default function StudentLoading() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard className="sm:col-span-2" lines={3} />
    </div>
  );
}
