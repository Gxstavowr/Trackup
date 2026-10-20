import type { CheckinWindow } from "@/lib/portal-today";

/**
 * Estado do cartão de check-in na Home do aluno (item 29 da V5). O cartão fica visível a semana
 * toda; esta função pura decide QUAL dos estados mostrar. Sem I/O: quem chama passa o que já leu.
 *
 *  - `locked`        aluno novo ainda sem protocolo publicado (check-in bloqueado até lá);
 *  - `unavailable`   sem check-in criado para a semana (cadastro em finalização);
 *  - `not_configured` coach ainda não montou as perguntas;
 *  - `before_open`   antes da janela (seg–qui): bloqueado até sexta, com quando abre;
 *  - `open`          janela sex–dom: ação principal;
 *  - `submitted`     enviado, aguardando a avaliação do coach;
 *  - `reviewed`      avaliação concluída: acesso à avaliação semanal.
 */
export type CheckinCardState =
  | { kind: "locked" }
  | { kind: "unavailable" }
  | { kind: "not_configured"; weekNumber: number }
  | { kind: "before_open"; weekNumber: number; reminder: boolean; daysUntilOpen: number; opensLabel: string }
  | { kind: "open"; weekNumber: number; closesLabel: string }
  | { kind: "submitted"; weekNumber: number }
  | { kind: "reviewed"; weekNumber: number };

export type CheckinCardInput = {
  /** Check-in liberado para o aluno (false = aluno novo sem protocolo publicado). */
  released: boolean;
  /** Instância da semana, se existir. */
  instance: { status: string; weekNumber: number } | null;
  /** Quantidade de perguntas configuradas pelo coach. */
  questionCount: number;
  window: CheckinWindow;
};

/** "Abre amanhã (sexta-feira)" / "Abre na sexta-feira · em 3 dias". */
export function opensLabelFor(win: Extract<CheckinWindow, { state: "reminder" | "closed" }>): string {
  if (win.state === "reminder") return "Abre amanhã, sexta-feira";
  const n = win.daysUntilOpen;
  return `Abre na sexta-feira · em ${n} ${n === 1 ? "dia" : "dias"}`;
}

export function pickCheckinCardState(input: CheckinCardInput): CheckinCardState {
  if (!input.released) return { kind: "locked" };
  if (!input.instance) return { kind: "unavailable" };

  const { status, weekNumber } = input.instance;
  // Enviado/avaliado vale em qualquer dia da semana, inclusive fora da janela.
  if (status === "reviewed") return { kind: "reviewed", weekNumber };
  if (status === "submitted") return { kind: "submitted", weekNumber };
  if (input.questionCount === 0) return { kind: "not_configured", weekNumber };

  const win = input.window;
  if (win.state === "open") return { kind: "open", weekNumber, closesLabel: win.closesLabel };
  return {
    kind: "before_open",
    weekNumber,
    reminder: win.state === "reminder",
    daysUntilOpen: win.state === "closed" ? win.daysUntilOpen : 1,
    opensLabel: opensLabelFor(win),
  };
}
