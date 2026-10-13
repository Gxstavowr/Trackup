"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { helperClass, inputBaseClass, labelClass } from "@/components/ui/field";
import { cardClass } from "@/components/ui/card";
import {
  CLIENT_NOTIFICATION_PREFS,
  NAME_MAX,
  PHONE_MAX,
  type ClientNotificationPrefs,
} from "@/lib/student-profile";
import {
  updateNotificationPrefsAction,
  updateProfileAction,
  type PrefsFormState,
  type ProfileFormState,
} from "./actions";

// Mantém o botão de salvar visível acima da barra de abas quando o foco/rolagem chega nele.
const ABOVE_NAV = { scrollMarginBottom: "calc(var(--portal-nav-h, 4.25rem) + env(safe-area-inset-bottom) + 1.5rem)" };

function Feedback({ state, success }: { state: { ok?: boolean; error?: string } | null; success: string }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {state?.error ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {state.error}
        </p>
      ) : state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-sm text-success">{success}</p>
      ) : null}
    </div>
  );
}

/**
 * "Editar perfil": nome de exibição e telefone/WhatsApp. Campos controlados — o React 19 reseta
 * formulário não controlado depois da action, e em erro o aluno perderia o que digitou.
 */
export function ProfileForm({
  initialName,
  initialPhone,
  email,
}: {
  initialName: string;
  initialPhone: string;
  email: string | null;
}) {
  const [state, action] = useActionState<ProfileFormState, FormData>(updateProfileAction, null);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const inputCls = (bad: boolean) =>
    `${inputBaseClass} ${bad ? "border-danger" : "border-line-control hover:border-ink-faint"}`;

  return (
    <form action={action} className={`${cardClass} flex flex-col gap-4 p-4`} noValidate>
      <label className={labelClass}>
        <span>Nome</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={NAME_MAX}
          autoComplete="name"
          aria-invalid={state?.field === "name" || undefined}
          className={inputCls(state?.field === "name")}
        />
        <span className={helperClass}>É como seu coach vê você no Trackly.</span>
      </label>

      <label className={labelClass}>
        <span>Telefone / WhatsApp</span>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={PHONE_MAX}
          autoComplete="tel"
          placeholder="(11) 98765-4321"
          aria-invalid={state?.field === "phone" || undefined}
          className={inputCls(state?.field === "phone")}
        />
        <span className={helperClass}>Opcional. Seu coach usa este número para falar com você pelo WhatsApp.</span>
      </label>

      {email && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">E-mail</span>
          <span className="break-words text-ink-muted">{email}</span>
          <span className={helperClass}>É o seu login. Para trocar, fale com seu coach.</span>
        </div>
      )}

      <Feedback key={state?.savedAt ?? "p"} state={state} success="Perfil atualizado." />

      <div style={ABOVE_NAV}>
        <SubmitButton size="lg" width="full">
          Salvar perfil
        </SubmitButton>
      </div>
    </form>
  );
}

/** Quais avisos do coach o aluno recebe no app (sininho/Notificações). */
export function NotificationPrefsForm({ initial }: { initial: ClientNotificationPrefs }) {
  const [state, action] = useActionState<(PrefsFormState & { at?: number }) | null, FormData>(
    async (prev, formData) => ({ ...(await updateNotificationPrefsAction(prev, formData)), at: Date.now() }),
    null,
  );
  const [prefs, setPrefs] = useState(initial);

  return (
    <form action={action} className={`${cardClass} flex flex-col overflow-hidden`}>
      {/* O React 19 reseta o <form> após a action e devolve o checkbox ao `checked` inicial do DOM
          sem re-render; remontar a cada salvamento faz a tela voltar a refletir `prefs`. */}
      <fieldset key={state?.at ?? "n"}>
        <legend className="sr-only">Avisos que você recebe no app</legend>
        {CLIENT_NOTIFICATION_PREFS.map((p) => (
          <label
            key={p.key}
            className="flex min-h-14 cursor-pointer items-center justify-between gap-4 border-b border-line px-4 py-3 transition-colors hover:bg-surface-raised"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">{p.label}</span>
              <span className="text-xs text-ink-muted">{p.text}</span>
            </span>
            <input
              type="checkbox"
              name={p.key}
              checked={prefs[p.key]}
              onChange={(e) => setPrefs((cur) => ({ ...cur, [p.key]: e.target.checked }))}
              className="size-5 shrink-0 accent-[var(--brand)]"
            />
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-3 p-4" style={ABOVE_NAV}>
        <Feedback key={state?.savedAt ?? "n"} state={state} success="Preferências salvas." />
        <SubmitButton variant="secondary" size="lg" width="full">
          Salvar preferências
        </SubmitButton>
      </div>
    </form>
  );
}
