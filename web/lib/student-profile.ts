/**
 * Perfil editável do aluno e preferências de notificação (migration 0018). Regras puras, sem
 * imports '@/' — testadas em `student-profile.test.ts`. As MESMAS regras são impostas no banco
 * por `public.update_my_profile` / `public.set_my_notification_preferences`; aqui elas só servem
 * para dar a mensagem certa antes da ida ao banco.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const PHONE_MAX = 25;
export const PHONE_DIGITS_MIN = 10;
export const PHONE_DIGITS_MAX = 15;

export type ProfileInput = { name: string; phone: string | null };
export type ProfileValidation =
  | { ok: true; value: ProfileInput }
  | { ok: false; field: "name" | "phone"; error: string };

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Apara e colapsa espaços (inclusive quebras de linha) — igual ao `regexp_replace(btrim(..), '\s+', ' ')` da função SQL. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function validateProfileInput(rawName: unknown, rawPhone: unknown): ProfileValidation {
  const name = normalizeName(typeof rawName === "string" ? rawName : "");
  if (name.length < NAME_MIN) {
    return { ok: false, field: "name", error: "Informe seu nome (pelo menos 2 letras)." };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, field: "name", error: `O nome pode ter no máximo ${NAME_MAX} caracteres.` };
  }
  if (CONTROL_CHARS.test(name)) {
    return { ok: false, field: "name", error: "O nome tem caracteres inválidos." };
  }

  const phoneTrimmed = (typeof rawPhone === "string" ? rawPhone : "").trim();
  if (!phoneTrimmed) return { ok: true, value: { name, phone: null } };

  const digits = phoneTrimmed.replace(/\D/g, "").length;
  if (
    phoneTrimmed.length > PHONE_MAX ||
    !/^[0-9 +().-]+$/.test(phoneTrimmed) ||
    digits < PHONE_DIGITS_MIN ||
    digits > PHONE_DIGITS_MAX
  ) {
    return {
      ok: false,
      field: "phone",
      error: "Telefone inválido. Use DDD + número, ex.: (11) 98765-4321.",
    };
  }
  return { ok: true, value: { name, phone: phoneTrimmed } };
}

/** Eventos que o coach dispara PARA o aluno e que o aluno pode silenciar (colunas da tabela). */
export const CLIENT_NOTIFICATION_PREFS = [
  {
    key: "orientation_ready",
    label: "Orientação da semana",
    text: "Quando seu coach avaliar o check-in e enviar a orientação.",
  },
  { key: "workout_updated", label: "Treino atualizado", text: "Quando seu coach publicar um treino novo." },
  {
    key: "nutrition_updated",
    label: "Plano de nutrição atualizado",
    text: "Quando seu coach publicar um plano alimentar novo.",
  },
] as const;

export type ClientNotificationPrefKey = (typeof CLIENT_NOTIFICATION_PREFS)[number]["key"];
export type ClientNotificationPrefs = Record<ClientNotificationPrefKey, boolean>;

export const DEFAULT_CLIENT_NOTIFICATION_PREFS: ClientNotificationPrefs = {
  orientation_ready: true,
  workout_updated: true,
  nutrition_updated: true,
};

/** Linha do banco (ou nada) -> preferências completas; sem linha = tudo ligado. */
export function resolveClientNotificationPrefs(
  row: Partial<Record<ClientNotificationPrefKey, unknown>> | null | undefined
): ClientNotificationPrefs {
  const out = { ...DEFAULT_CLIENT_NOTIFICATION_PREFS };
  if (!row) return out;
  for (const { key } of CLIENT_NOTIFICATION_PREFS) {
    if (typeof row[key] === "boolean") out[key] = row[key] as boolean;
  }
  return out;
}

/**
 * O aluno quer receber esta notificação? Só eventos da lista podem ser silenciados; qualquer outro
 * `event_type` passa (true).
 */
export function clientWantsNotification(prefs: ClientNotificationPrefs, eventType: string): boolean {
  const known = CLIENT_NOTIFICATION_PREFS.some((p) => p.key === eventType);
  return known ? prefs[eventType as ClientNotificationPrefKey] : true;
}

/** Checkboxes do formulário: marcado = presente no FormData com valor "on". */
export function prefsFromCheckboxes(get: (key: string) => unknown): ClientNotificationPrefs {
  const out = { ...DEFAULT_CLIENT_NOTIFICATION_PREFS };
  for (const { key } of CLIENT_NOTIFICATION_PREFS) out[key] = get(key) === "on";
  return out;
}
