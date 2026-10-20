import { getClientOnboardingRow } from "../../protocol-queue";
import { buildOnboardingInfo } from "../student-situation";
import StudentTabsNav, { type StudentTab } from "./questionario/tabs-nav";

export type { StudentTab };

/**
 * Abas do contexto do aluno. O layout (`layout.tsx`) passa as abas fixas; aqui entram as do
 * cadastro novo (V5): "Questionário inicial" (só para aluno com questionário/onboarding) e
 * "Pacote". Ordem: Resumo, Questionário inicial, Avaliação semanal, Treino, Nutrição, Pacote,
 * Evolução, Pagamentos. Sem a view `client_onboarding_status` (migração pendente) a aba
 * Questionário simplesmente não aparece.
 */
export default async function StudentTabs({
  clientId,
  tabs,
}: {
  clientId: string;
  tabs: StudentTab[];
}) {
  const row = await getClientOnboardingRow(clientId);
  const hasOnboarding = !!row && (row.onboarding_required || row.questionnaire_status !== null);
  const info = hasOnboarding ? buildOnboardingInfo(row) : null;
  // Questionário recebido e ainda não aberto pelo coach: pede a atenção dele.
  const needsOpening = info?.stage === "questionnaire_submitted";

  const out: StudentTab[] = [];
  for (const tab of tabs) {
    const label = tab.segment === "avaliacao" ? "Avaliação semanal" : tab.label;
    out.push({ ...tab, label });
    if (tab.segment === "" && hasOnboarding) {
      out.push({ segment: "questionario", label: "Questionário inicial", attention: needsOpening });
    }
    if (tab.segment === "nutricao") out.push({ segment: "pacote", label: "Pacote" });
  }
  return <StudentTabsNav clientId={clientId} tabs={out} />;
}
