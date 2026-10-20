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
    const target = document.getElementById(targetId);
    if (!target) return;
    // Some quando a área de decisão OU o atalho "Ir para a decisão" do topo estão à vista: com os
    // dois na tela, a barra cobria o próprio atalho (botão duplicado e sobreposto no celular).
    const shortcut = document.querySelector<HTMLElement>("[data-decision-shortcut]");
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
        setVisible(![...seen.values()].some(Boolean));
      },
      { threshold: 0.15 }
    );
    io.observe(target);
    if (shortcut) io.observe(shortcut);
    return () => io.disconnect();
  }, [targetId]);

  if (!visible) return null;
  return (
    <div className="sticky bottom-[calc(4.5rem+1px+env(safe-area-inset-bottom))] z-20 md:bottom-4 -mx-1 flex items-center gap-3 rounded-lg border border-line-strong bg-surface-raised/95 p-2 pl-4 shadow-[var(--shadow-overlay)] backdrop-blur-sm xl:hidden">
      <p className="min-w-0 flex-1 truncate text-sm text-ink-muted">{hint}</p>
      <a href={`#${targetId}`} className={buttonClass({ variant: "primary", size: "md" })}>
        {label}
      </a>
    </div>
  );
}
