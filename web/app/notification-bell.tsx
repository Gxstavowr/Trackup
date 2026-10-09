import Link from "next/link";
import { getUnreadNotificationCount, type NotificationRecipient } from "@/lib/repository";

/**
 * Sininho de notificações do cabeçalho, compartilhado entre `/coach` e `/portal` (item 4 —
 * fatia de notificações IN-APP). Decisão de UI (documentada no relatório da tarefa): um
 * link simples com contador, em vez de um dropdown flutuante — a tela dedicada
 * (`/coach/notificacoes` ou `/portal/notificacoes`) já resolve "ver e marcar como lida"
 * direito, e um dropdown some com pouco esforço extra sem agregar nada aqui.
 *
 * Variantes:
 *  - `"pill"` (padrão, usada pelo portal): botão em pílula com o texto "Notificações".
 *  - `"shell"` (usada pela barra/sidebar do coach): linha discreta que vira só o ícone de
 *    sino abaixo de `md` (o texto continua no `aria-label`), pra caber na barra compacta do
 *    mobile sem esconder a ação.
 *
 * Server Component assíncrono (busca a contagem direto via `lib/repository.ts`) — pode ser
 * `await`ado dentro de outro Server Component sem precisar de client state.
 */
export default async function NotificationBell({
  recipient,
  href,
  variant = "pill",
}: {
  recipient: NotificationRecipient;
  href: string;
  variant?: "pill" | "shell";
}) {
  const unreadCount = await getUnreadNotificationCount(recipient);
  const countLabel = unreadCount > 99 ? "99+" : unreadCount;

  if (variant === "shell") {
    return (
      <Link
        href={href}
        aria-label={
          unreadCount > 0
            ? `Notificações, ${unreadCount} ${unreadCount === 1 ? "não lida" : "não lidas"}`
            : "Notificações"
        }
        className="relative flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink md:min-w-0 md:justify-start"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 20a2 2 0 0 0 3.4 0" />
        </svg>
        <span className="hidden md:inline">Notificações</span>
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-coral px-1 text-[0.65rem] font-medium leading-4 text-on-coral md:static md:ml-auto md:min-w-[1.25rem] md:px-1.5 md:py-0.5 md:text-xs md:leading-normal">
            {countLabel}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="relative inline-flex min-h-11 items-center rounded-full border border-line px-5 py-2 font-mono text-sm text-ink hover:border-brand"
    >
      Notificações
      {unreadCount > 0 && (
        <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-coral px-1.5 py-0.5 text-xs font-medium text-on-coral">
          {countLabel}
        </span>
      )}
    </Link>
  );
}
