import { getNotifications, getUnreadNotificationCount } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import { markAllNotificationsAsReadAction, markNotificationAsReadAction } from "./actions";

const EVENT_LABEL: Record<string, string> = {
  checkin_received: "Check-in",
  checkin_overdue: "Check-in atrasado",
  checkin_reminder: "Lembrete de check-in",
  orientation_ready: "Orientação",
  payment_overdue: "Pagamento atrasado",
  workout_updated: "Treino",
  nutrition_updated: "Nutrição",
};

/**
 * Tela "Notificações" do ALUNO (item 4 — fatia de notificações IN-APP), espelhando
 * `/coach/notificacoes` quase 1:1 — mesma decisão de UI (página dedicada em vez de
 * dropdown), documentada lá.
 */
export default async function PortalNotificationsPage() {
  await requireClient();

  const [notifications, unreadCount] = await Promise.all([
    getNotifications("client"),
    getUnreadNotificationCount("client"),
  ]);

  return (
    <>
      <PageHeader title="Notificações">
        {unreadCount > 0 && (
          <form action={markAllNotificationsAsReadAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-line-strong"
            >
              Marcar todas
            </button>
          </form>
        )}
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState
          title="Nenhuma notificação ainda"
          text="Avisos sobre treino, nutrição e outros eventos do seu acompanhamento aparecem aqui."
        />
      ) : (
        <ul className={`${CARD} overflow-hidden`}>
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5 last:border-b-0 ${
                notification.read ? "" : "bg-brand-tint"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  {!notification.read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  )}
                  <span
                    className={`font-mono text-xs uppercase tracking-wide ${
                      notification.read ? "text-ink-faint" : "text-ink-muted"
                    }`}
                  >
                    {EVENT_LABEL[notification.event_type] ?? notification.event_type}
                  </span>
                </div>
                <p className="break-words text-sm text-ink">{notification.message}</p>
                <span
                  className={`text-xs ${notification.read ? "text-ink-faint" : "text-ink-muted"}`}
                >
                  {formatRelativeTime(notification.created_at)}
                </span>
              </div>

              {!notification.read && (
                <form action={markNotificationAsReadAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-line px-3.5 text-xs font-medium text-ink transition-colors hover:border-line-strong"
                  >
                    Marcar como lida
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
