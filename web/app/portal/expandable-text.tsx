"use client";

import { useState } from "react";

/**
 * Texto curto que expande ao toque (mensagem do coach na Home). Mostra 3 linhas; o botão só
 * aparece se o texto é longo o bastante para ser cortado.
 */
export default function ExpandableText({ text, threshold = 150 }: { text: string; threshold?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold || text.split("\n").length > 3;

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        className={`whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-ink ${
          open || !long ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-ml-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-brand transition-colors hover:bg-brand-tint"
        >
          {open ? "Mostrar menos" : "Ler mensagem completa"}
        </button>
      )}
    </div>
  );
}
