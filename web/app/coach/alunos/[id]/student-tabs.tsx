"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export type StudentTab = {
  /** Sufixo depois de `/coach/alunos/[id]` — `""` é o Resumo. */
  segment: string;
  label: string;
  /** A aba tem algo esperando o coach (ex.: avaliação a fazer) — ganha um ponto de atenção. */
  attention?: boolean;
};

/**
 * Abas de contexto do aluno (Resumo/Avaliação/Treino/Nutrição/Fotos/Pagamentos...). NÃO são itens
 * da navegação principal — só existem dentro de `/coach/alunos/[id]/*`. Client component pelo
 * estado ativo (`usePathname`) e pelo refresh abaixo.
 *
 * Layouts NÃO re-renderizam ao navegar entre abas irmãs, então a faixa de contexto (situação,
 * próxima ação) ficaria com o dado da última vez que o layout renderizou — por exemplo, "Aguardando
 * check-in" depois de o aluno já ter enviado. Por isso, a cada TROCA de aba pedimos um
 * `router.refresh()`: ele re-renderiza layout + página com dado fresco, sem recarregar a página.
 *
 * Pílulas com `flex-wrap` (e não uma linha rolável) de propósito: no mobile todas as abas
 * ficam visíveis, nenhuma escondida atrás de scroll horizontal. Alvo de toque >= 44px.
 */
export default function StudentTabs({
  clientId,
  tabs,
}: {
  clientId: string;
  tabs: StudentTab[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/coach/alunos/${clientId}`;

  // Atualiza a faixa de contexto (layout) a cada troca de aba; a primeira renderização já vem fresca.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    router.refresh();
  }, [pathname, router]);

  return (
    <nav aria-label="Seções do aluno">
      <ul className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = tab.segment
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === base;
          return (
            <li key={tab.segment || "resumo"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-sm transition-colors ${
                  active
                    ? "border-brand bg-brand-tint text-brand"
                    : tab.segment === "avaliacao"
                      ? // Avaliação é o fluxo principal: destacada mesmo quando inativa.
                        "border-brand/50 text-brand hover:border-brand hover:bg-brand-tint"
                      : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
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
