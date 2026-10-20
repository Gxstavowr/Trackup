/** Esqueleto do corpo do Financeiro (Suspense e `loading.tsx`) — mesma estrutura da tela real. */
export default function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando o financeiro…</span>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 card p-5">
            <div className="h-3 w-24 animate-pulse rounded bg-line" />
            <div className="h-8 w-32 animate-pulse rounded bg-line" />
            <div className="h-3 w-full max-w-40 animate-pulse rounded bg-line" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]" aria-hidden>
        <div className="h-72 animate-pulse card" />
        <div className="h-72 animate-pulse card" />
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3" aria-hidden>
          <div className="h-7 w-48 animate-pulse rounded bg-line" />
          <div className="h-28 animate-pulse card" />
        </div>
      ))}
    </div>
  );
}
