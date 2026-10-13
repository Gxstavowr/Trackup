"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Icon from "@/components/ui/icon";

/**
 * Menu "Mais ações" de uma linha de aluno (ações secundárias). Botão de ícone com rótulo
 * explícito (inclui o nome do aluno), `aria-expanded`, fecha com Esc (devolvendo o foco ao
 * botão) e ao clicar/tocar fora.
 */
export default function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // menu abre para baixo: garante que apareça inteiro acima da barra inferior (mobile)
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(e) => {
        // Tab para fora do menu fecha (não deixa o painel aberto atrás do foco)
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex size-11 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:translate-y-px md:size-9 ${
          open
            ? "border-line-strong bg-surface-raised text-ink"
            : "border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink"
        }`}
      >
        <Icon name="more" size={20} />
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          className="absolute right-0 top-full z-30 scroll-mb-24 mt-1 flex w-64 flex-col gap-0.5 rounded-lg border border-line-strong bg-surface-raised p-1.5 shadow-[var(--surface-raised-shadow)]"
        >
          {children}
        </div>
      )}
    </div>
  );
}
