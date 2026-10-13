"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { TreinoActionState } from "./actions";

export { formatPrescription } from "@/lib/workout-format";

/** Monta um FormData a partir de um objeto simples (campos nulos/undefined viram vazio). */
export function toFormData(values: Record<string, string | number | null | undefined>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v == null ? "" : String(v));
  return fd;
}

// ---------------------------------------------------------------------------
// Estado de salvamento — toda alteração do rascunho é gravada na hora (Server Action);
// o chip mostra salvando / salvo / erro.
// ---------------------------------------------------------------------------

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string };

type SaveCtx = {
  state: SaveState;
  run: (fn: () => Promise<TreinoActionState>) => Promise<TreinoActionState>;
};

const Ctx = createContext<SaveCtx | null>(null);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const run = useCallback(async (fn: () => Promise<TreinoActionState>) => {
    setState({ kind: "saving" });
    try {
      const result = await fn();
      if (result?.error) setState({ kind: "error", message: result.error });
      else setState({ kind: "saved", at: new Date() });
      return result;
    } catch {
      const result = { error: "Falha de conexão. Tente de novo." };
      setState({ kind: "error", message: result.error });
      return result;
    }
  }, []);

  const value = useMemo(() => ({ state, run }), [state, run]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSave(): SaveCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSave fora de SaveStatusProvider");
  return ctx;
}

export function SaveChip({ draft }: { draft: boolean }) {
  const { state } = useSave();
  let text: string;
  let cls = "text-ink-faint";
  if (state.kind === "saving") {
    text = "Salvando…";
    cls = "text-ink-muted";
  } else if (state.kind === "saved") {
    text = `Salvo às ${state.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    cls = "text-success";
  } else if (state.kind === "error") {
    text = state.message;
    cls = "text-danger-text";
  } else {
    text = draft ? "Alterações são salvas no rascunho na hora" : "Somente leitura";
  }
  return (
    <span role="status" aria-live="polite" className={`text-xs font-medium ${cls}`}>
      {state.kind === "saved" && <span aria-hidden>✓ </span>}
      {text}
    </span>
  );
}
