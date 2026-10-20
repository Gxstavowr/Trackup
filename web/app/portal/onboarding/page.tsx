import { redirect } from "next/navigation";
import { getMyQuestionnaire } from "@/lib/onboarding/questionnaire";
import { PageHeader, EmptyState } from "../portal-ui";
import { requireClient } from "../require-client";
import QuestionnaireForm from "./questionnaire-form";
import ProtocolPreparing from "./protocol-preparing";

/**
 * Onboarding do aluno (itens 9–11). O gate de `requireClient` traz para cá quem tem
 * `onboarding_required` e ainda não enviou o questionário. Estados:
 *  - questionário enviado → "Seu protocolo está sendo preparado" (`?enviado=1` logo após o envio);
 *  - rascunho / não iniciado → formulário guiado (retoma da etapa salva no servidor);
 *  - aluno legado sem questionário → início do portal (nada muda para ele);
 *  - migração pendente → aviso amigável, sem quebrar o portal.
 */
export default async function PortalOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireClient();
  const [q, params] = await Promise.all([getMyQuestionnaire(), searchParams]);

  if (!q.available) {
    return (
      <>
        <PageHeader title="Questionário inicial" />
        <EmptyState
          icon="checkin"
          title="Questionário indisponível no momento"
          text="Não conseguimos carregar o questionário agora. Tente de novo em instantes ou fale com seu coach."
        />
      </>
    );
  }

  if (q.submitted?.submitted_at && q.submitted.protocol_due_at) {
    return (
      <>
        <PageHeader title="Seu protocolo" eyebrow="Questionário inicial enviado" />
        <ProtocolPreparing
          pkg={q.package ?? q.submitted.package}
          submittedAt={q.submitted.submitted_at}
          protocolDueAt={q.submitted.protocol_due_at}
          coachOpenedAt={q.submitted.coach_opened_at}
          published={q.published}
          justSent={params.enviado === "1"}
        />
      </>
    );
  }

  if (!q.onboardingRequired && !q.draft) {
    redirect("/portal");
  }

  return (
    <>
      <PageHeader title="Questionário inicial" eyebrow="Antes do seu protocolo · responda uma vez" />
      <QuestionnaireForm
        sections={q.sections}
        initialAnswers={q.draft?.answers ?? {}}
        initialStep={q.draft?.current_step ?? null}
        hasDraft={q.draft !== null}
      />
    </>
  );
}
