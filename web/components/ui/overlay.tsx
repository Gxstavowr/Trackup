"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Icon from "./icon";

/**
 * Base de Modal e Drawer: `<dialog>` nativo (foco preso, Esc fecha, backdrop). Controlado por
 * `open`/`onClose`; o conteúdo só é montado enquanto aberto.
 */
function Overlay({
  open,
  onClose,
  title,
  children,
  panelClass,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  panelClass: string;
  kind: "modal" | "drawer";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Só a entrada é animada (CSS em globals.css); o conteúdo desmonta ao fechar.
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`${panelClass} ${kind === "modal" ? "tk-modal" : "tk-drawer"} border border-line-strong bg-surface text-ink shadow-[var(--shadow-overlay)] backdrop:bg-black/70 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="t-subtitle">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-brand active:bg-line"
            >
              <Icon name="x" />
            </button>
          </div>
          {/* Drawer sobe da base no celular: o fim do conteúdo respeita a área segura do iOS
              (home indicator) para o último campo/botão continuar alcançável. */}
          <div
            className={`overflow-y-auto p-5 ${kind === "drawer" ? "pb-[calc(1.25rem+env(safe-area-inset-bottom))]" : ""}`}
          >
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

type OverlayProps = { open: boolean; onClose: () => void; title: string; children: ReactNode };

export function Modal(props: OverlayProps) {
  return (
    <Overlay {...props} kind="modal" panelClass="m-auto max-h-[85dvh] w-[min(92vw,32rem)] rounded-lg p-0" />
  );
}

/** Painel lateral (direita no desktop, subindo da base no celular). */
export function Drawer(props: OverlayProps) {
  return (
    <Overlay
      {...props}
      kind="drawer"
      panelClass="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[88dvh] w-full max-w-none rounded-t-lg p-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-lg"
    />
  );
}
