/** Bloco de esqueleto: pulso de opacidade (parado com movimento reduzido). Decorativo. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`tk-skeleton rounded bg-line ${className}`} />;
}

/** Cartão de esqueleto — mesma moldura dos cards reais. */
export function SkeletonCard({ className = "", lines = 2 }: { className?: string; lines?: number }) {
  return (
    <div aria-hidden className={`card flex flex-col gap-3 p-5 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-36" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/**
 * Casca de carregamento de página: título + N cartões. `role="status"` anuncia o carregamento
 * para leitores de tela; o texto fica só para eles.
 */
export function PageSkeleton({
  label = "Carregando…",
  cards = 3,
  columns = false,
}: {
  label?: string;
  cards?: number;
  /** Cartões em grade de 2 colunas (métricas) em vez de lista empilhada. */
  columns?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div aria-hidden className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-56" />
      </div>
      <div className={columns ? "grid grid-cols-1 gap-4 sm:grid-cols-2" : "flex flex-col gap-4"}>
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
