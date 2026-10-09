/** Esqueleto do corpo do Financeiro (Suspense e `loading.tsx`) — mesma estrutura da tela real. */
export default function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-10" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando o financeiro…</span>

      <div className="flex flex-col gap-4" aria-hidden>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
              <div className="h-3 w-24 animate-pulse rounded bg-line" />
              <div className="h-9 w-40 animate-pulse rounded bg-line" />
              <div className="h-3 w-full max-w-56 animate-pulse rounded bg-line" />
            </div>
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-lg border border-line bg-surface" />
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3" aria-hidden>
          <div className="h-7 w-48 animate-pulse rounded bg-line" />
          <div className="h-28 animate-pulse rounded-lg border border-line bg-surface" />
        </div>
      ))}
    </div>
  );
}
