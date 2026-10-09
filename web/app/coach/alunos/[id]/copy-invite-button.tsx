"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "../icons";

/** "Copiar link do convite" — mesma ação e rótulo da lista de Alunos, pro cabeçalho do perfil. */
export default function CopyInviteButton({ url, className }: { url: string; className: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard pode falhar (permissão negada, contexto não seguro etc.) — sem feedback de
      // erro dedicado, é um detalhe secundário da tela.
    }
  }

  return (
    <button type="button" onClick={copyLink} className={`${className} gap-2`}>
      {copied ? <CheckIcon /> : <LinkIcon />}
      <span aria-live="polite">{copied ? "Link copiado!" : "Copiar link do convite"}</span>
    </button>
  );
}
