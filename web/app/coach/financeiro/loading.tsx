import FinanceSkeleton from "./skeleton";

/** Navegação pra `/coach/financeiro` (vinda de outra rota): esqueleto até a página resolver. */
export default function FinanceLoading() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="font-mono text-label uppercase tracking-widest text-ink-faint">Trackly · Coach</span>
        <h1 className="font-display text-hero text-ink">Financeiro</h1>
      </header>
      <FinanceSkeleton />
    </div>
  );
}
