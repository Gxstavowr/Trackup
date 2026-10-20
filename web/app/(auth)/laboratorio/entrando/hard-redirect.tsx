"use client";

import { useEffect } from "react";

/** Navegação completa para `to` (já validado no servidor), com link de reserva. */
export default function HardRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div role="status" className="flex flex-col items-center gap-3 text-center">
      <p className="text-base font-semibold text-ink">Abrindo o perfil demo…</p>
      <a href={to} className="text-sm text-brand underline-offset-4 hover:underline">
        Se nada acontecer, toque aqui
      </a>
    </div>
  );
}
