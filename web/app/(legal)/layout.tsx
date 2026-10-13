import LegalLinks from "../legal-links";
import Brand from "@/components/brand";

/**
 * Casca das páginas legais/LGPD (`/privacidade`, `/termos`, `/consentimento`) — coluna de
 * leitura larga sobre o fundo do design system. Públicas (fora de `/coach` e `/portal`), então
 * o proxy não exige sessão; `/consentimento` faz a própria checagem.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
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
