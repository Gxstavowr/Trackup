/**
 * Linguagem de "pílula" da V5 (referência: seletor Faturamento/Marketing): trilho escuro com
 * contorno e o item selecionado preenchido em claro. Módulo sem "use client" para poder ser
 * usado também por Server Components (ex.: filtros por URL renderizados no servidor).
 * `relative` no trilho contém filhos `sr-only` (absolutos) e evita overflow horizontal.
 */
export const pillTrackClass =
  "relative inline-flex max-w-full items-center gap-1 overflow-x-auto overflow-y-hidden rounded-full border border-line-strong " +
  "bg-surface-sunken p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function pillItemClass(selected: boolean, size: "sm" | "md" = "md"): string {
  const sizing =
    size === "sm"
      ? "min-h-11 px-3.5 text-[0.8125rem] md:min-h-8"
      : "min-h-11 px-4 text-sm md:min-h-10 md:px-5";
  return (
    `inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold ` +
    `transition-[background-color,color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] motion-reduce:active:scale-100 ` +
    `focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 ${sizing} ` +
    (selected
      ? "bg-pill-active text-on-pill-active shadow-[0_1px_0_rgba(255,255,255,0.25)_inset]"
      : "text-ink-muted hover:bg-surface-raised hover:text-ink")
  );
}
