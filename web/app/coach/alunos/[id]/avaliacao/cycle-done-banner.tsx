"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Confirmação de "ciclo concluído". Quando a avaliação acaba de ser enviada, a página se
 * re-renderiza como concluída com o coach lá embaixo (onde ficava o botão de enviar); o aviso está
 * no topo e sairia da tela. Ao montar, traz o aviso pra vista, pra a confirmação nunca passar
 * despercebida. Em quem só abre uma avaliação já concluída o aviso já está à vista: não muda nada.
 */
export default function CycleDoneBanner({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <p
      ref={ref}
      role="status"
      className="mt-1 rounded-md border border-ok/30 bg-ok-tint px-3 py-2 text-sm text-ok"
    >
      {children}
    </p>
  );
}
