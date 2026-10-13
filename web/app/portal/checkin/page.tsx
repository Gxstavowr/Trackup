import Link from "next/link";
import { getCompletedWorkoutSessionCountForWeek, getCurrentCheckin } from "@/lib/repository";
import { checkinWindow } from "@/lib/portal-today";
import { listPhotosForCheckin, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import CheckinForm from "../checkin-form";
import CheckinSent from "../checkin-sent";
import { BUTTON_GHOST, CARD, EmptyState, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import { Badge } from "@/components/ui/badge";

/**
 * Aba "Check-in" do aluno (item 25: check-in premium). A página decide QUAL estado mostrar:
 * já enviado/avaliado (qualquer dia — `CheckinSent`), fora da janela (quinta lembrete, seg–qua
 * fechado — `checkinWindow`), sem perguntas, ou o formulário guiado (`CheckinForm`, sex–dom).
 * A mesma janela é imposta no servidor em `submitCheckin`; aqui é só a interface.
 */
export default async function PortalCheckinPage() {
  const { client } = await requireClient();
  const checkin = await getCurrentCheckin(client.id);
  const win = checkinWindow();

  if (!checkin) {
    return (
      <>
        <PageHeader title="Check-in" />
        <EmptyState
          icon="checkin"
          title="Check-in ainda não disponível"
          text="Seu cadastro ainda está sendo finalizado pelo seu coach. Assim que estiver tudo pronto, o check-in da semana aparece aqui."
        />
      </>
    );
  }

  const { instance } = checkin;

  if (instance.status === "submitted" || instance.status === "reviewed") {
    return (
      <>
        <PageHeader title="Check-in" eyebrow={`Semana ${instance.week_number}`} />
        <CheckinSent weekNumber={instance.week_number} reviewed={instance.status === "reviewed"} />
      </>
    );
  }

  if (win.state !== "open") {
    const reminder = win.state === "reminder";
    return (
      <>
        <PageHeader title="Check-in" eyebrow={`Semana ${instance.week_number}`} />
        <div className={`${CARD} flex flex-col items-start gap-3 p-5`}>
          <Badge tone={reminder ? "warning" : "neutral"}>{reminder ? "Abre amanhã" : "Fechado por enquanto"}</Badge>
          <p className="font-display text-xl text-ink">
            {reminder
              ? "Amanhã é dia de check-in"
              : `O check-in abre na sexta-feira${
                  win.state === "closed"
                    ? ` (em ${win.daysUntilOpen} ${win.daysUntilOpen === 1 ? "dia" : "dias"})`
                    : ""
                }`}
          </p>
          <p className="text-sm text-ink-muted">
            O check-in fica aberto de sexta a domingo. {reminder
              ? "Reserve um momento amanhã para responder."
              : "De segunda a quinta, é só seguir o plano."}
          </p>
          <Link href="/portal" className={BUTTON_GHOST}>
            Voltar para o início
          </Link>
        </div>
      </>
    );
  }

  if (checkin.questions.length === 0) {
    return (
      <>
        <PageHeader title="Check-in" eyebrow={`Semana ${instance.week_number}`} />
        <EmptyState
          icon="checkin"
          title="Nenhuma pergunta configurada"
          text="Seu coach ainda não configurou o modelo de check-in desta conta."
        />
      </>
    );
  }

  // "Treinos realizados": sugestão a partir das sessões concluídas da semana (editável).
  let suggestedWorkouts: number | null = null;
  try {
    suggestedWorkouts = await getCompletedWorkoutSessionCountForWeek(client.id, instance.week_number);
  } catch {
    suggestedWorkouts = null; // sem sugestão não é fatal: o campo continua manual
  }

  // Fotos já enviadas na semana: o formulário já nasce com o contador e o passo inicial certos
  // (sem "0 de 4" piscando antes da hidratação). Falha aqui não é fatal: quadros vazios.
  let initialPhotos: CheckinPhoto[] = [];
  try {
    initialPhotos = (await listPhotosForCheckin(instance.id)) ?? [];
  } catch {
    initialPhotos = [];
  }

  return (
    <>
      <PageHeader title="Check-in" eyebrow={`Semana ${instance.week_number}`} />
      <CheckinForm
        suggestedWorkouts={suggestedWorkouts}
        checkinId={instance.id}
        weekNumber={instance.week_number}
        period={`Período ${formatDateOnly(instance.period_start)} a ${formatDateOnly(instance.period_end)} · aberto até domingo`}
        questions={checkin.questions}
        answers={checkin.answers}
        context={checkin.context}
        initialPhotos={initialPhotos}
      />
    </>
  );
}

/** Formata uma coluna `date` (ex.: "2026-09-18") sem passar por conversão de fuso horário. */
function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
