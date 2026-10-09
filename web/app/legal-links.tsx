import Link from "next/link";

/**
 * Links fixos pros Termos de Uso e a Política de Privacidade (LGPD art. 9º — informação de
 * acesso facilitado). Aparece no rodapé de TODA tela: login/cadastro, convite, coach e portal.
 */
export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-ink-faint ${className}`}>
      <Link href="/termos" className="hover:text-brand hover:underline">
        Termos de Uso
      </Link>
      <span aria-hidden> · </span>
      <Link href="/privacidade" className="hover:text-brand hover:underline">
        Política de Privacidade
      </Link>
    </p>
  );
}
