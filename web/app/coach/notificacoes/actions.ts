"use server";

import { revalidatePath } from "next/cache";
import {
  markAllNotificationsAsRead as markAllNotificationsAsReadRecord,
  markNotificationAsRead as markNotificationAsReadRecord,
} from "@/lib/repository";
import { requireActiveCoach } from "../require-coach";

/**
 * "Marcar como lida" (uma notificação). Form simples sem `useActionState`, mesmo padrão de
 * `publishWorkoutPlanAction`/`markPaymentAsPaidAction` — não precisa de feedback de erro
 * dedicado na UI pra essa ação.
 */
export async function markNotificationAsReadAction(formData: FormData): Promise<void> {
  await requireActiveCoach();
  const notificationId = String(formData.get("notificationId") || "");
  if (!notificationId) return;

  await markNotificationAsReadRecord(notificationId);
  revalidatePath("/coach/notificacoes");
  revalidatePath("/coach", "layout"); // o sino de notificações vive no layout do coach
}

/** "Marcar todas como lidas". */
export async function markAllNotificationsAsReadAction(): Promise<void> {
  await requireActiveCoach();
  await markAllNotificationsAsReadRecord("coach");
  revalidatePath("/coach/notificacoes");
  revalidatePath("/coach", "layout"); // o sino de notificações vive no layout do coach
}
