"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/**
 * Botão de envio de `<form action>`: enquanto a action roda fica desabilitado, mostra o indicador
 * e troca o texto por `pendingLabel` (padrão "Salvando…"). Evita duplo envio e botão "morto".
 */
export function SubmitButton({
  children,
  pendingLabel = "Salvando…",
  ...rest
}: Omit<ComponentProps<typeof Button>, "type" | "pending" | "pendingLabel"> & {
  pendingLabel?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" pending={pending} pendingLabel={pendingLabel} {...rest}>
      {children}
    </Button>
  );
}
