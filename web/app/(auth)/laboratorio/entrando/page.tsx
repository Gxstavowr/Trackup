import type { Metadata } from "next";
import { labEntryDestination } from "@/app/admin/laboratorio/_lib/cookie";
import HardRedirect from "./hard-redirect";

export const metadata: Metadata = { title: "Abrindo o perfil demo", robots: { index: false } };

/**
 * Ponte do Laboratório: `switchToLabProfile` redireciona para cá depois de trocar a sessão, e esta
 * página abre o destino com navegação COMPLETA (documento novo). Sem ela, o redirect "soft" da
 * Server Action travava em laço quando o destino redirecionava de novo (aluno do zero →
 * questionário). Não lê sessão nem dados: o destino é validado contra a lista fechada e a
 * autorização continua nas próprias rotas de destino.
 */
export default async function LabEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { para } = await searchParams;
  const to = labEntryDestination(para) ?? "/";
  return <HardRedirect to={to} />;
}
