import Link from "next/link";
import { getNotifications, getUnreadNotificationCount } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { requireCoach } from "../require-coach";
import { markAllNotificationsAsReadAction, markNotificationAsReadAction } from "./actions";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";

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
 * Tela "Notificações" do COACH (item 4 — fatia de notificações IN-APP). Decisão de UI
 * (documentada no relatório da tarefa): página dedicada em vez de dropdown flutuante — mais
 * simples de implementar bem (empty state próprio, marcar uma ou todas como lidas sem
 * precisar de client state complexo) do que um popover.
 */
export default async function CoachNotificationsPage() {
  await requireCoach();

  const [notifications, unreadCount] = await Promise.all([
    getNotifications("coach"),
    getUnreadNotificationCount("coach"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="t-label text-ink-faint">
            Trackly · Coach
          </span>
          <h1 className="font-display text-hero text-ink">Notificações</h1>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <form action={markAllNotificationsAsReadAction}>
              <SubmitButton variant="secondary" pendingLabel="Marcando…">
                Marcar todas como lidas
              </SubmitButton>
            </form>
          )}
          <Link
            href="/coach"
            className="inline-flex min-h-11 items-center rounded-full border border-line px-5 py-2 text-sm font-medium text-ink hover:border-brand"
          >
            Voltar
          </Link>
        </div>
      </header>

      {notifications.length === 0 ? (
        <EmptyState icon="bell" title="Nenhuma notificação ainda" text="Avisos sobre check-ins enviados pelos seus alunos e outros eventos aparecem aqui." />
      ) : (
        <ul className="overflow-hidden card">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 ${
                notification.read ? "" : "bg-brand-tint"
              }`}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  {!notification.read && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  )}
                  <span
                    className={`text-xs font-semibold ${
                      notification.read ? "text-ink-faint" : "text-ink-muted"
                    }`}
                  >
                    {EVENT_LABEL[notification.event_type] ?? notification.event_type}
                    {notification.client_name && ` · ${notification.client_name}`}
                  </span>
                </div>
                <p className="text-sm text-ink">{notification.message}</p>
                <span
                  className={`text-xs ${notification.read ? "text-ink-faint" : "text-ink-muted"}`}
                >
                  {formatRelativeTime(notification.created_at)}
                </span>
              </div>

              {!notification.read && (
                <form action={markNotificationAsReadAction}>
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <SubmitButton variant="secondary" size="sm" className="shrink-0" pendingLabel="Marcando…">
                    Marcar como lida
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
