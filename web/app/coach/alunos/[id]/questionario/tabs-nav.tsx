"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type StudentTab = {
  /** Sufixo depois de `/coach/alunos/[id]` — `""` é o Resumo. */
  segment: string;
  label: string;
  /** Outros segmentos que pertencem a esta aba (ex.: Fotos/Histórico dentro de Evolução). */
  also?: string[];
  /** A aba tem algo esperando o coach (ex.: avaliação a fazer) — ganha um ponto de atenção. */
  attention?: boolean;
};

/**
 * Navegação das abas de contexto do aluno (parte cliente de `../student-tabs.tsx`, que decide
 * quais abas existem). Resumo/Questionário inicial/Avaliação/Treino/Nutrição/Pacote/Evolução/Pagamentos. NÃO são itens
 * da navegação principal — só existem dentro de `/coach/alunos/[id]/*`. Client component só pelo
 * estado ativo (`usePathname`). Não há `router.refresh()` na troca de aba: o layout não precisa
 * recarregar a cada clique; as server actions já revalidam o que mudam.
 *
 * Linha única com rolagem horizontal quando não cabe (celular e tablet, onde a sidebar come a
 * largura), alvos >= 44px. A barra de rolagem nativa fica escondida; no lugar dela, as bordas
 * esmaecem do lado em que ainda há abas — a aba cortada vira affordance de "role para ver mais".
 */
export default function StudentTabsNav({
  clientId,
  tabs,
}: {
  clientId: string;
  tabs: StudentTab[];
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Esmaece só a borda que ainda tem conteúdo escondido; recalcula ao rolar e ao redimensionar.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      const start = nav.scrollLeft > 1;
      const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // No celular a linha rola: mantém a aba ativa visível (ex.: Evolução ao abrir /fotos).
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    nav.scrollTo({ left: current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2 });
  }, [pathname]);
  const base = `/coach/alunos/${clientId}`;
  const under = (segment: string) => {
    const href = `${base}/${segment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      ref={navRef}
      aria-label="Seções do aluno"
      className="relative overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={edges.start || edges.end ? { maskImage: fadeMask(edges), WebkitMaskImage: fadeMask(edges) } : undefined}
    >
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = tab.segment
            ? [tab.segment, ...(tab.also ?? [])].some(under)
            : pathname === base;
          return (
            <li key={tab.segment || "resumo"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "border-brand text-ink"
                    : tab.segment === "avaliacao" && tab.attention
                      ? // Avaliação só ganha o amarelo quando há ação do coach (mesma situação do cabeçalho).
                        "border-transparent text-brand hover:border-brand/50"
                      : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.attention && (
                  <>
                    <span aria-hidden className="size-2 rounded-full bg-brand" />
                    <span className="sr-only">(aguardando você)</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Gradiente de máscara: transparente nas bordas com abas escondidas, opaco no resto. */
function fadeMask({ start, end }: { start: boolean; end: boolean }): string {
  const left = start ? "transparent, #000 2.5rem" : "#000, #000";
  const right = end ? "#000 calc(100% - 2.5rem), transparent" : "#000, #000";
  return `linear-gradient(to right, ${left}, ${right})`;
}
