"use client";

import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";

/**
 * Barra de ação do celular: acompanha a rolagem (sticky, em fluxo — não cobre conteúdo nem a barra
 * de navegação) com um atalho para a área de decisão. Some quando a própria área de decisão está
 * à vista. No desktop a área de decisão já fica fixa na lateral, então a barra não existe.
 */
export default function DecisionBar({ targetId, label, hint }: { targetId: string; label: string; hint: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  if (!visible) return null;
  return (
    <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex items-center gap-3 rounded-lg border border-line-strong bg-surface-raised/95 p-2 pl-4 shadow-[var(--shadow-overlay)] backdrop-blur-sm lg:hidden">
      <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">{hint}</p>
      <a href={`#${targetId}`} className={buttonClass({ variant: "primary", size: "md" })}>
        {label}
      </a>
    </div>
  );
}
