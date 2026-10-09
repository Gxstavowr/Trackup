import LegalLinks from "../legal-links";

/**
 * Layout compartilhado das telas de autenticação (login, cadastro, esqueci minha senha,
 * redefinir senha) — card centralizado sobre o fundo escuro do design system, mesmo
 * espírito do `.invite-card` do protótipo (`prototype/convite.html`).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
            Trackly
          </span>
        </div>
        <div className="rounded-lg border border-line bg-surface p-7 shadow-[var(--surface-raised-shadow)]">
          {children}
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
