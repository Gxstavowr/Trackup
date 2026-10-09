import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveHomeForCurrentUser } from "@/lib/auth/resolve-home";
import { getMissingConsents } from "@/lib/legal/consent";
import ConsentForm from "./consent-form";

/**
 * Gate de consentimento (LGPD). `requireCoach`/`requireClient` mandam pra cá quem ainda não
 * aceitou TODAS as finalidades obrigatórias na versão atual (`lib/legal/documents.ts`) — cobre o
 * primeiro acesso do aluno depois do convite, coaches antigos e toda troca de versão do texto.
 */
export default async function ConsentPage() {
  const supabase = await createClient();
  const home = await resolveHomeForCurrentUser(supabase);
  if (!home) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = home === "/coach" ? "coach" : "client";
  const missing = await getMissingConsents(supabase, user!.id, role);
  if (missing.length === 0) redirect(home);

  return <ConsentForm role={role} purposes={missing} />;
}
