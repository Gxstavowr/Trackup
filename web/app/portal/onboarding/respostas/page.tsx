import { redirect } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { getMyQuestionnaire } from "@/lib/onboarding/questionnaire";
import { QUESTIONNAIRE_VERSION, groupAnswersForDisplay } from "@/lib/onboarding/questionnaire-catalog";
import { todayDateSP } from "@/lib/portal-today";
import { EmptyState, PageHeader } from "../../portal-ui";
import { requireClient } from "../../require-client";

/**
 * "Minhas respostas" (item 11: permitir que o aluno consulte o que enviou). Somente leitura: o
 * questionário enviado é histórico imutável. Respostas sensíveis aparecem só aqui (para o próprio
 * aluno) e na seção do coach, marcadas como privadas.
 */
const SENT_FMT = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function OnboardingAnswersPage() {
  await requireClient();
  const q = await getMyQuestionnaire();

  if (!q.available) {
    return (
      <>
        <PageHeader title="Respostas enviadas" />
        <EmptyState icon="checkin" title="Respostas indisponíveis no momento" text="Tente de novo em instantes." />
      </>
    );
  }

  const sent = q.submitted;
  if (!sent?.submitted_at) {
    redirect(q.onboardingRequired || q.draft ? "/portal/onboarding" : "/portal");
  }

  // Envio de versão anterior do catálogo: esconde as perguntas novas que ele nunca viu.
  const { groups, extra } = groupAnswersForDisplay(sent.sections, sent.answers, {
    today: todayDateSP(),
    hideEmpty: sent.catalog_version !== QUESTIONNAIRE_VERSION,
  });

  return (
    <>
      <PageHeader title="Respostas enviadas" eyebrow="Questionário inicial">
        <Link
          href="/portal/onboarding"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand"
        >
          <Icon name="chevron" size={16} className="rotate-180" /> Voltar
        </Link>
      </PageHeader>

      <div className="card flex flex-col gap-2 p-4">
        <p className="text-sm text-ink">
          Enviado em <strong className="font-semibold">{SENT_FMT.format(new Date(sent.submitted_at))}</strong>
        </p>
        <p className="flex items-start gap-2 text-xs text-ink-muted">
          <Icon name="privacy" size={16} className="mt-px shrink-0" />
          As respostas marcadas como privadas (saúde, sintomas, medicamentos, renda) ficam visíveis só para você e para o seu coach.
          Para corrigir algo, fale com ele.
        </p>
      </div>

      {groups.map((g) => (
        <section key={g.section} className="card flex flex-col gap-4 p-4 sm:p-5" aria-label={g.label}>
          <h2 className="t-label text-brand">{g.label}</h2>
          {g.steps.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 border-t border-line pt-3 first-of-type:border-t-0 first-of-type:pt-0">
              <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
              <dl className="flex flex-col gap-2.5">
                {s.items.map((it) => (
                  <div key={it.key} className="flex flex-col gap-0.5">
                    <dt className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      {it.label}
                      {it.sensitive && (
                        <Badge tone="neutral" className="!px-2 !py-0.5 text-[0.6875rem]">
                          Privado
                        </Badge>
                      )}
                    </dt>
                    <dd className={`whitespace-pre-line break-words text-sm ${it.value === "Não respondido" ? "text-ink-faint" : "text-ink"}`}>{it.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      ))}

      {extra.length > 0 && (
        <section className="card flex flex-col gap-2 p-4" aria-label="Outras respostas">
          <h2 className="t-label text-ink-faint">Outras respostas</h2>
          <dl className="flex flex-col gap-2">
            {extra.map((it) => (
              <div key={it.key} className="flex flex-col gap-0.5">
                <dt className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  {it.label}
                  {it.sensitive && (
                    <Badge tone="neutral" className="!px-2 !py-0.5 text-[0.6875rem]">
                      Privado
                    </Badge>
                  )}
                </dt>
                <dd className="whitespace-pre-line break-words text-sm text-ink">{it.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
