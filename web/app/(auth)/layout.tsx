import LegalLinks from "../legal-links";
import Brand from "@/components/brand";

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
        <div className="mb-8 flex justify-center">
          <Brand variant="full" />
        </div>
        <div className="card p-7 shadow-[var(--surface-raised-shadow)]">
          {children}
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </main>
  );
}
