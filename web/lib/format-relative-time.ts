/**
 * Formata um timestamp `timestamptz` (ISO) como tempo relativo em português ("agora mesmo",
 * "há 5 min", "há 3h", "há 2 dias") até 6 dias; a partir daí cai pra data absoluta
 * `dd/mm/aaaa`. Usado só pela tela de notificações (`/coach/notificacoes`,
 * `/portal/notificacoes`) — decisão de forma (documentada no relatório da tarefa): simples o
 * suficiente pra não precisar de uma lib de datas nova só por isso.
 */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));

  if (diffSec < 60) return "agora mesmo";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour}h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `há ${diffDay} dia${diffDay > 1 ? "s" : ""}`;

  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
