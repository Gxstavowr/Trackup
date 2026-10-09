"use client";

import { useActionState } from "react";
import { acceptInvite, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = null;

export default function AcceptInviteForm({
  clientId,
  clientInitials,
  clientName,
  coachName,
}: {
  clientId: string;
  clientInitials: string;
  clientName: string;
  coachName: string;
}) {
  const [state, action, pending] = useActionState(acceptInvite, initialState);

  if (state?.success) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar initials={clientInitials} />
        <h1 className="font-display text-hero text-ink">Verifique seu e-mail</h1>
        <p className="text-sm text-ink-muted">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col items-center gap-3 text-center">
      <input type="hidden" name="clientId" value={clientId} />
      <Avatar initials={clientInitials} />
      <h1 className="font-display text-hero text-ink">
        {coachName} convidou {clientName} para participar do acompanhamento.
      </h1>
      <p className="text-sm text-ink-muted">
        Ao aceitar, {coachName.split(" ")[0]} vai poder acompanhar seus check-ins
        semanais, orientações e evolução — tudo em um só lugar. Vamos enviar um link de
        acesso para o seu e-mail.
      </p>
      <div className="flex w-full flex-col gap-2 text-left">
        <label className="flex items-start gap-3 rounded-md border border-line bg-surface-sunken px-3 py-3 text-sm text-ink">
          <input
            type="checkbox"
            name="privacy_policy"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="leading-relaxed">
            Li e aceito a{" "}
            <a href="/privacidade" target="_blank" className="text-brand hover:underline">
              Política de Privacidade
            </a>{" "}
            e os{" "}
            <a href="/termos" target="_blank" className="text-brand hover:underline">
              Termos de Uso
            </a>
            .
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-md border border-brand/50 bg-brand-tint px-3 py-3 text-sm text-ink">
          <input
            type="checkbox"
            name="health_data"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="leading-relaxed">
            <strong>Autorizo o tratamento dos meus dados de saúde</strong> (peso, medidas, fotos
            do corpo, alimentação, treinos e check-ins) por {coachName.split(" ")[0]}, por meio do
            Trackly, <strong>exclusivamente para o meu acompanhamento</strong>. Posso revogar a
            qualquer momento.
          </span>
        </label>
      </div>

      {state?.error && (
        <p className="w-full rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Aceitar convite"}
      </button>
    </form>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint font-display text-lg text-brand">
      {initials}
    </span>
  );
}
