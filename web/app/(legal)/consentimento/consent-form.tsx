"use client";

import { useActionState } from "react";
import Link from "next/link";
import { logout } from "@/lib/actions/logout";
import type { ConsentPurpose } from "@/lib/legal/documents";
import { acceptConsents, type ConsentState } from "./actions";

const initialState: ConsentState = null;

const LINK = "text-brand hover:underline";

function PurposeText({ purpose, role }: { purpose: ConsentPurpose; role: "coach" | "client" }) {
  switch (purpose) {
    case "terms_of_use":
      return (
        <>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className={LINK}>
            Termos de Uso
          </Link>
          , inclusive minha responsabilidade como <strong>controlador</strong> dos dados dos
          alunos que eu cadastrar (obter o consentimento deles e atender seus pedidos).
        </>
      );
    case "privacy_policy":
      return (
        <>
          Li e aceito a{" "}
          <Link href="/privacidade" target="_blank" className={LINK}>
            Política de Privacidade
          </Link>
          {role === "client" ? ", que explica quais dados são coletados, por quê e quem tem acesso." : "."}
        </>
      );
    case "health_data":
      return (
        <>
          <strong>Autorizo o tratamento dos meus dados de saúde</strong> — peso, medidas
          corporais, fotos do corpo, alimentação, treinos, sono, energia e respostas dos
          check-ins — pelo profissional que me convidou, por meio do Trackly,{" "}
          <strong>exclusivamente para o meu acompanhamento</strong>. Sei que posso revogar essa
          autorização a qualquer momento em Privacidade, no meu portal.
        </>
      );
  }
}

export default function ConsentForm({
  role,
  purposes,
}: {
  role: "coach" | "client";
  purposes: ConsentPurpose[];
}) {
  const [state, action, pending] = useActionState(acceptConsents, initialState);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-hero text-ink">Antes de continuar</h1>
        <p className="text-sm text-ink-muted">
          {role === "client"
            ? "Seu acompanhamento envolve dados de saúde, que a LGPD protege de forma especial. Precisamos da sua autorização expressa para tratá-los."
            : "Atualizamos nossos documentos ou este é seu primeiro acesso. Leia e confirme para continuar usando o Trackly."}
        </p>
      </header>

      <form action={action} className="flex flex-col gap-3">
        {purposes.map((purpose) => (
          <label
            key={purpose}
            className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm text-ink ${
              purpose === "health_data"
                ? "border-brand/50 bg-brand-tint"
                : "border-line bg-surface-sunken"
            }`}
          >
            <input
              type="checkbox"
              name={purpose}
              required
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand)]"
            />
            <span className="leading-relaxed">
              <PurposeText purpose={purpose} role={role} />
            </span>
          </label>
        ))}

        {state?.error && (
          <p className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 w-full rounded-md bg-brand py-2.5 font-medium text-on-accent transition-opacity disabled:opacity-60"
        >
          {pending ? "Registrando…" : "Concordo e quero continuar"}
        </button>
      </form>

      {role === "client" && (
        <p className="text-center text-sm text-ink-muted">
          Prefere não autorizar? Você ainda pode{" "}
          <Link href="/meus-dados" className={LINK}>
            baixar ou pedir a exclusão dos seus dados
          </Link>
          .
        </p>
      )}

      <form action={logout} className="text-center">
        <button type="submit" className="text-sm text-ink-muted hover:text-ink hover:underline">
          Não concordo — sair
        </button>
      </form>
    </div>
  );
}
