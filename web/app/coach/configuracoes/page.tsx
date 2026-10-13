import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/actions/logout";
import { Badge, Icon, type IconName } from "@/components/ui";
import { cardClass } from "@/components/ui/card";
import { requireCoach } from "../require-coach";
import PrivacySection from "./privacy-section";
import QuestionsManager, { type ManagedQuestion } from "./questions-manager";
import { buildCheckinSteps } from "@/lib/checkin-steps";
import { PasswordForm, ProfileForm } from "./settings-forms";
import { SubmitButton } from "@/components/ui/submit-button";

const SECTIONS = [
  { id: "perfil", label: "Perfil profissional", icon: "user" },
  { id: "notificacoes", label: "Notificações", icon: "bell" },
  { id: "acompanhamento", label: "Acompanhamento semanal", icon: "checkin" },
  { id: "conta", label: "Conta", icon: "settings" },
  { id: "privacidade", label: "Privacidade e LGPD", icon: "privacy" },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

type SectionId = (typeof SECTIONS)[number]["id"];

function SectionCard({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <section className={`${cardClass} flex flex-col gap-4 p-5 md:p-6`}>
      <div>
        <h2 className="t-subtitle text-ink">{title}</h2>
        {text && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{text}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="t-label text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-ink sm:text-right">{value}</dd>
    </div>
  );
}

const PLAN_LABEL: Record<string, string> = { trial: "Período de teste" };

type AccountRel = { name: string; niche: string | null; plan: string };
function oneAccount(rel: unknown): AccountRel | undefined {
  return (Array.isArray(rel) ? rel[0] : rel) as AccountRel | undefined;
}

/**
 * Configurações do coach (`/coach/configuracoes?secao=`). Fora do fluxo operacional (item
 * secundário da navegação): perfil, notificações, acompanhamento semanal, conta e
 * privacidade/LGPD. A seção ativa vem da URL; só ela consulta o banco.
 */
export default async function CoachSettingsPage(props: PageProps<"/coach/configuracoes">) {
  const { user, coach } = await requireCoach();
  const searchParams = await props.searchParams;
  const raw = typeof searchParams.secao === "string" ? searchParams.secao : "";
  const active: SectionId = SECTIONS.some((s) => s.id === raw) ? (raw as SectionId) : "perfil";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <span className="t-label text-ink-faint">Trackly · Coach</span>
        <h1 className="t-title text-ink">Configurações</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Sua conta, seus avisos e a privacidade dos seus alunos.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <nav
          aria-label="Seções das configurações"
          className="flex flex-wrap gap-x-1 border-b border-line lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0"
        >
          {SECTIONS.map((s) => {
            const selected = s.id === active;
            return (
              <Link
                key={s.id}
                href={`/coach/configuracoes?secao=${s.id}`}
                aria-current={selected ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors lg:mb-0 lg:rounded-md lg:border-b-0 lg:border-l-2 ${
                  selected
                    ? "border-brand text-ink lg:bg-surface-raised"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                <Icon name={s.icon} size={18} />
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {active === "perfil" && <ProfileSection userId={user.id} fallbackName={coach.name} />}
          {active === "notificacoes" && <NotificationsSection />}
          {active === "acompanhamento" && <TrackingSection />}
          {active === "conta" && <AccountSection email={user.email ?? ""} />}
          {active === "privacidade" && (
            <PrivacySection
              userId={user.id}
              errorCode={typeof searchParams.erro === "string" ? searchParams.erro : null}
              deleted={!!searchParams.excluido}
            />
          )}
        </div>
      </div>
    </div>
  );
}

async function ProfileSection({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("coach_users")
    .select("name, accounts(name, niche, plan)")
    .eq("id", userId)
    .maybeSingle();
  const account = oneAccount(row?.accounts);

  return (
    <SectionCard
      title="Perfil profissional"
      text="Como você e sua consultoria aparecem no Trackly. As alterações valem para toda a sua conta."
    >
      <ProfileForm name={row?.name ?? fallbackName} accountName={account?.name ?? ""} niche={account?.niche ?? ""} />
    </SectionCard>
  );
}

const COACH_EVENTS = [
  ["Check-in recebido", "Quando um aluno envia o check-in semanal."],
  ["Pagamento atrasado", "Quando uma cobrança de aluno passa do vencimento."],
] as const;

function NotificationsSection() {
  return (
    <SectionCard
      title="Notificações"
      text="Estes são os avisos que o Trackly gera para você hoje. Eles chegam no sino do app, sem configuração extra."
    >
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {COACH_EVENTS.map(([title, text]) => (
          <li key={title} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-sm text-ink-muted">{text}</p>
            </div>
            <Badge tone="success" dot>
              Ativo no app
            </Badge>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">
        Escolher canais (e-mail, push) e silenciar tipos de aviso ainda não está disponível.
      </p>
      <Link
        href="/coach/notificacoes"
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-brand hover:underline"
      >
        Ver minhas notificações <Icon name="arrow-right" size={16} />
      </Link>
    </SectionCard>
  );
}

/** Etapa do formulário do aluno em que a pergunta cai (mesma regra do check-in). */
function stepOf(q: { id: string; key: string; label: string; type: string; unit: string | null; tracks: string | null; required: boolean; active: boolean }, all: (typeof q)[]) {
  const groups = buildCheckinSteps(all.filter((x) => x.active));
  return groups.find((g) => g.questions.some((x) => x.key === q.key))?.id ?? "body";
}

async function TrackingSection() {
  const supabase = await createClient();
  const { data: template } = await supabase
    .from("checkin_templates")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: questions } = template
    ? await supabase
        .from("checkin_questions")
        .select("id, key, label, type, unit, help_text, tracks, required, active, sort_order")
        .eq("template_id", template.id)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const all = questions ?? [];
  const { data: answerRows } = await supabase.from("checkin_answers").select("question_key");
  const answeredKeys = new Set((answerRows ?? []).map((a) => a.question_key as string));
  const toManaged = (q: (typeof all)[number]): ManagedQuestion => ({
    id: q.id,
    key: q.key,
    label: q.label,
    type: q.type,
    unit: q.unit,
    helpText: q.help_text ?? null,
    required: q.required,
    step: stepOf(q, all),
    answered: answeredKeys.has(q.key),
  });
  const list = all.filter((q) => q.active).map(toManaged);
  const archived = all.filter((q) => !q.active).map(toManaged);

  return (
    <>
      <SectionCard
        title="Janela do check-in"
        text="Todos os alunos usam a mesma janela semanal. Ela é definida pelo Trackly e não muda por conta."
      >
        <dl className="rounded-md border border-line px-4">
          <Row label="Abre" value="Sexta-feira (lembrete na quinta)" />
          <Row label="Fecha" value="Domingo, 23h59 (horário de São Paulo)" />
          <Row label="Depois do prazo" value="Check-in não enviado vira “perdido” na semana" />
        </dl>
      </SectionCard>

      <SectionCard
        title="Perguntas do check-in"
        text={`Modelo “${template?.name ?? "Padrão"}”: o que o aluno responde toda semana. Adicione, edite, reordene ou remova perguntas.`}
      >
        <QuestionsManager questions={list} archived={archived} />
      </SectionCard>

      <SectionCard
        title="Métricas e metas por aluno"
        text="Quais medidas cada aluno acompanha (peso, cintura, métricas próprias) é configurado no Resumo do aluno."
      >
        <Link
          href="/coach/alunos"
          className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-brand hover:underline"
        >
          Abrir lista de alunos <Icon name="arrow-right" size={16} />
        </Link>
      </SectionCard>
    </>
  );
}

async function AccountSection({ email }: { email: string }) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("coach_users")
    .select("created_at, accounts(name, niche, plan)")
    .maybeSingle();
  const plan = oneAccount(row?.accounts)?.plan;

  return (
    <>
      <SectionCard title="Dados de acesso">
        <dl className="rounded-md border border-line px-4">
          <Row label="E-mail de login" value={email || "—"} />
          <Row label="Plano" value={plan ? (PLAN_LABEL[plan] ?? plan) : "—"} />
          <Row
            label="Conta criada em"
            value={row?.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR") : "—"}
          />
        </dl>
        <p className="text-sm text-ink-muted">Para trocar o e-mail de login, fale com o suporte do Trackly.</p>
      </SectionCard>

      <SectionCard title="Alterar senha" text="Vale para os próximos acessos. Você continua conectado neste aparelho.">
        <PasswordForm />
      </SectionCard>

      <SectionCard title="Sessão">
        <form action={logout}>
          <SubmitButton variant="secondary" icon="logout" pendingLabel="Saindo…">
            Sair da conta
          </SubmitButton>
        </form>
      </SectionCard>
    </>
  );
}
