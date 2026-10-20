import Link from "next/link";
import { getNotifications, getUnreadNotificationCount } from "@/lib/repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { CARD, EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import { markAllNotificationsAsReadAction, markNotificationAsReadAction } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";

const EVENT_LABEL: Record<string, string> = {
  checkin_received: "Check-in",
  checkin_overdue: "Check-in atrasado",
  checkin_reminder: "Lembrete de check-in",
  orientation_ready: "Orientação",
  payment_overdue: "Pagamento atrasado",
  workout_updated: "Treino",
  nutrition_updated: "Nutrição",
  // V5 (0022): tipos novos. `questionnaire_submitted` e `invite_accepted` são avisos do coach;
  // ficam mapeados por segurança caso apareçam aqui.
  protocol_ready: "Protocolo pronto",
  package_changed: "Mudança de pacote",
  questionnaire_submitted: "Questionário enviado",
  invite_accepted: "Convite aceito",
};

/** Para onde cada tipo leva (as notificações não guardam link). Tipos sem entrada = sem link. */
const EVENT_LINK: Record<string, { href: string; label: string }> = {
  protocol_ready: { href: "/portal", label: "Ver meu protocolo" },
  package_changed: { href: "/portal/conta", label: "Ver em Minha conta" },
  questionnaire_submitted: { href: "/portal/onboarding/respostas", label: "Ver respostas enviadas" },
  invite_accepted: { href: "/portal", label: "Ir para o início" },
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
            <SubmitButton variant="secondary" className="shrink-0" pendingLabel="Marcando…">
              Marcar todas
            </SubmitButton>
          </form>
        )}
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState
          icon="bell"
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
                    className={`text-xs font-semibold ${
                      notification.read ? "text-ink-faint" : "text-ink-muted"
                    }`}
                  >
                    {EVENT_LABEL[notification.event_type] ?? notification.event_type}
                  </span>
                </div>
                <p className="break-words text-sm text-ink">{notification.message}</p>
                {EVENT_LINK[notification.event_type] && (
                  <Link
                    href={EVENT_LINK[notification.event_type].href}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-brand"
                  >
                    {EVENT_LINK[notification.event_type].label}
                  </Link>
                )}
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
    </>
  );
}
