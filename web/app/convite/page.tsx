import Link from "next/link";
import { getInvitePreview } from "@/lib/invite-preview";
import AcceptInviteForm from "./accept-invite-form";
import LegalLinks from "../legal-links";

export default async function ConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const invite = id ? await getInvitePreview(id) : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            Trackly
          </span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-7 shadow-[var(--surface-raised-shadow)]">
          {!invite ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="font-display text-hero text-ink">
                Convite não encontrado
              </h1>
              <p className="text-sm text-ink-muted">
                Esse link de convite não é válido.
              </p>
              <Link
                href="/login"
                className="mt-2 text-sm font-medium text-brand hover:underline"
              >
                Ir para o login
              </Link>
            </div>
          ) : invite.inviteStatus === "active" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="font-display text-hero text-ink">Convite já utilizado</h1>
              <p className="text-sm text-ink-muted">
                Essa conta já foi ativada. Entre com seu e-mail para acessar.
              </p>
              <Link
                href="/login"
                className="mt-2 text-sm font-medium text-brand hover:underline"
              >
                Ir para o login
              </Link>
            </div>
          ) : (
            <AcceptInviteForm
              clientId={invite.id}
              clientInitials={invite.initials}
              clientName={invite.name}
              coachName={invite.coachName}
            />
          )}
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
