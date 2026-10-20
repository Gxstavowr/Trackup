import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMyServicePackage, respondToContractChange } from "@/lib/onboarding/contracts";
import { BILLING_PERIOD_LABELS, PACKAGES, formatPriceBRL } from "@/lib/onboarding/packages";
import { logout } from "@/lib/actions/logout";
import { buttonClass } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { formatBRL, formatDateOnly } from "@/lib/finance/format";
import { todayInSaoPaulo } from "@/lib/finance/dates";
import { displayPaymentStatus, PERIOD_LABEL, type PaymentStatus, type SubscriptionPeriod } from "@/lib/finance/metrics";
import { resolveClientNotificationPrefs } from "@/lib/student-profile";
import { CARD, PageHeader } from "../portal-ui";
import { requireClient } from "../require-client";
import { NotificationPrefsForm, ProfileForm } from "./profile-forms";
import ContractChangeCard, { type ContractResponseState } from "./contract-change-card";

export const metadata: Metadata = { title: "Minha conta · Trackly" };

/**
 * Resposta do aluno a uma mudança de pacote (V5, item 14). Roda com a sessão do aluno; a RPC
 * `respond_to_contract_change` deriva o aluno de auth.uid() e só aceita contratos dele.
 */
async function respondToContractChangeAction(
  _prev: ContractResponseState,
  formData: FormData
): Promise<ContractResponseState> {
  "use server";
  await requireClient();
  const contractId = String(formData.get("contractId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!contractId || (decision !== "accept" && decision !== "decline")) {
    return { error: "Resposta inválida. Recarregue a página e tente de novo." };
  }
  const result = await respondToContractChange({ contractId, accept: decision === "accept" });
  if (!result.ok) return { error: result.error };
  revalidatePath("/portal/conta");
  return { ok: true, accepted: decision === "accept" };
}

function formatDay(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Ativo", tone: "success" },
  paused: { label: "Pausado", tone: "warning" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

const GENDER_LABEL: Record<string, string> = {
  female: "Feminino",
  male: "Masculino",
  other: "Outro",
  feminino: "Feminino",
  masculino: "Masculino",
  outro: "Outro",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <h2 className="t-subtitle text-ink">{title}</h2>
        {hint && <p className="t-helper">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line px-4 py-3.5 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function LinkRow({ href, title, text, external }: { href: string; title: string; text?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{title}</span>
        {text && <span className="text-xs text-ink-muted">{text}</span>}
      </span>
      <Icon name="chevron" size={18} className="shrink-0 text-ink-faint" />
    </>
  );
  const cls =
    "flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-raised";
  return external ? (
    <a href={href} download className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/**
 * Minha conta (V2 tarefa 31). O aluno só tem SELECT na própria linha de `clients` (RLS
 * `clients_self_read`); desde a migration 0018 ele edita NOME e TELEFONE pela RPC
 * `update_my_profile` (nada mais da linha) e escolhe quais avisos in-app do coach recebe
 * (`client_notification_preferences`, gravada pela RPC `set_my_notification_preferences`). O resto
 * dos dados pessoais (idade, altura, sexo, objetivo, início) continua só leitura — é do coach.
 * V3 #22: tela utilitária, sem controles de mentira — e-mail/push não existem, então não há opção
 * para eles. Ordem: perfil → plano → notificações → privacidade/legal → sair.
 * Plano e cobrança vêm de `subscriptions`/`payments` (policies `*_client_read`, migration 0004).
 * Direitos de privacidade (exportar, revogar, excluir) ficam em `/meus-dados`, já existente.
 */
export default async function AccountPage() {
  const { user, client } = await requireClient();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("clients")
    .select("name, email, phone, gender, age, height_cm, objective, start_date")
    .eq("id", client.id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id, plan_name, price_cents, period, status")
    .eq("client_id", client.id)
    .maybeSingle();

  const { data: openPayments } = subscription && subscription.status !== "cancelled"
    ? await supabase
        .from("payments")
        .select("due_date, amount_cents, status")
        .eq("subscription_id", subscription.id)
        .in("status", ["pending", "overdue"])
        .order("due_date", { ascending: true })
        .limit(20)
    : { data: null };

  // Sem linha (nunca salvou) ou sem a tabela (migration 0018 ainda não aplicada) = tudo ligado.
  const { data: prefsRow } = await supabase
    .from("client_notification_preferences")
    .select("orientation_ready, workout_updated, nutrition_updated")
    .eq("client_id", client.id)
    .maybeSingle();
  const prefs = resolveClientNotificationPrefs(prefsRow);

  // Pacote de serviço (V5). Sem a migração 0022: `available = false` e a seção não aparece.
  const servicePackage = await getMyServicePackage();
  const currentPackage = servicePackage.current;
  // A mudança pendente pode já estar em vigor (a confirmação não segura a vigência).
  const pendingChanges = [...(currentPackage ? [currentPackage] : []), ...servicePackage.upcoming].filter(
    (e) => e.clientConfirmation === "pending"
  );
  const otherUpcoming = servicePackage.upcoming.filter((e) => e.clientConfirmation !== "pending");

  // Mesma regra do coach: `pending` vencida é "em atraso". Atrasada não é "próxima": linhas separadas.
  const today = todayInSaoPaulo();
  const isLate = (p: { status: string; due_date: string }) =>
    displayPaymentStatus(p.status as PaymentStatus, p.due_date, today) === "overdue";
  const overduePayment = (openPayments ?? []).find(isLate) ?? null;
  const nextPayment = (openPayments ?? []).find((p) => !isLate(p)) ?? null;

  const name = profile?.name ?? client.name;
  const email = profile?.email ?? user.email ?? null;
  const status = subscription ? (SUBSCRIPTION_STATUS[subscription.status] ?? { label: subscription.status, tone: "neutral" as BadgeTone }) : null;
  const gender = profile?.gender ? (GENDER_LABEL[profile.gender.toLowerCase()] ?? profile.gender) : null;

  const personal: { label: string; value: string | null }[] = [
    { label: "Idade", value: profile?.age != null ? `${profile.age} anos` : null },
    { label: "Altura", value: profile?.height_cm != null ? `${profile.height_cm} cm` : null },
    { label: "Sexo", value: gender },
    { label: "Objetivo", value: profile?.objective ?? null },
    { label: "Início do acompanhamento", value: profile?.start_date ? formatDateOnly(profile.start_date) : null },
  ];
  const filled = personal.filter((p) => p.value);

  return (
    <>
      <PageHeader title="Minha conta" />

      <Section title="Editar perfil" hint="Seu nome e telefone. Você pode alterar quando quiser.">
        <ProfileForm initialName={name} initialPhone={profile?.phone ?? ""} email={email} />
      </Section>

      {filled.length > 0 && (
        <Section title="Dados do acompanhamento" hint="Definidos pelo seu coach. Para alterar, fale com ele.">
          <div className={`${CARD} overflow-hidden`}>
            <dl>
              {filled.map((p) => (
                <Row key={p.label} label={p.label}>
                  {p.value}
                </Row>
              ))}
            </dl>
          </div>
        </Section>
      )}

      {servicePackage.available && (currentPackage || servicePackage.upcoming.length > 0) && (
        <Section title="Meu pacote" hint="O serviço que você contratou com seu coach.">
          {currentPackage && (
            <div className={`${CARD} overflow-hidden`}>
              <div className="flex flex-col gap-0.5 border-b border-line bg-surface-raised px-4 py-3.5">
                <span className="t-label text-ink-faint">Pacote atual</span>
                <span className="font-display text-base font-bold text-ink">{PACKAGES[currentPackage.package].label}</span>
                <span className="text-xs text-ink-muted">{PACKAGES[currentPackage.package].includes}</span>
              </div>
              <dl>
                <Row label="Valor combinado">
                  {currentPackage.priceCents === 0 ? "Cortesia" : formatPriceBRL(currentPackage.priceCents)}
                  <span className="font-normal text-ink-muted">
                    {" · "}
                    {BILLING_PERIOD_LABELS[currentPackage.billingPeriod]}
                  </span>
                </Row>
                <Row label="Desde">{formatDay(currentPackage.effectiveFrom)}</Row>
              </dl>
            </div>
          )}
          {pendingChanges.map((change) => (
            <ContractChangeCard
              key={change.contractId}
              contractId={change.contractId}
              current={
                currentPackage && currentPackage.contractId !== change.contractId
                  ? { package: currentPackage.package, priceCents: currentPackage.priceCents, billingPeriod: currentPackage.billingPeriod }
                  : null
              }
              next={{ package: change.package, priceCents: change.priceCents, billingPeriod: change.billingPeriod }}
              effectiveFrom={change.effectiveFrom}
              startsToday={change.effectiveFrom <= today}
              respondAction={respondToContractChangeAction}
            />
          ))}
          {otherUpcoming.map((change) => (
            <p key={change.contractId} className="rounded-lg border border-dashed border-line-strong px-4 py-3.5 text-sm text-ink-muted">
              A partir de {formatDay(change.effectiveFrom)}, seu pacote passa a ser{" "}
              <span className="font-medium text-ink">{PACKAGES[change.package].label}</span> (
              {change.priceCents === 0 ? "cortesia" : formatPriceBRL(change.priceCents)} ·{" "}
              {BILLING_PERIOD_LABELS[change.billingPeriod].toLowerCase()})
              {change.clientConfirmation === "confirmed" ? ", como você confirmou." : change.clientConfirmation === "declined" ? ". Você recusou esta mudança; fale com seu coach." : "."}
            </p>
          ))}
        </Section>
      )}

      <Section title="Meu plano">
        {subscription && status ? (
          <div className={`${CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface-raised px-4 py-3.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="t-label text-ink-faint">Assinatura</span>
                <span className="break-words font-display text-base font-bold text-ink">{subscription.plan_name}</span>
              </span>
              <span className="shrink-0">
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </span>
            </div>
            <dl>
              <Row label="Valor">
                {formatBRL(subscription.price_cents)}
                <span className="font-normal text-ink-muted">
                  {" · "}
                  {PERIOD_LABEL[subscription.period as SubscriptionPeriod] ?? subscription.period}
                </span>
              </Row>
              {overduePayment && (
                <Row label="Cobrança em atraso">
                  <span className="font-semibold text-danger-text">
                    venceu em {formatDateOnly(overduePayment.due_date)} · {formatBRL(overduePayment.amount_cents)}
                  </span>
                  <span className="ml-2 inline-block align-middle">
                    <Badge tone="danger" dot>
                      Em atraso
                    </Badge>
                  </span>
                </Row>
              )}
              {nextPayment ? (
                <Row label="Próxima cobrança">
                  {formatDateOnly(nextPayment.due_date)} · {formatBRL(nextPayment.amount_cents)}
                </Row>
              ) : (
                !overduePayment && (
                  <Row label="Próxima cobrança">
                    <span className="font-normal text-ink-muted">Nenhuma cobrança em aberto</span>
                  </Row>
                )
              )}
            </dl>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-sm text-ink-muted">
            Seu coach ainda não cadastrou um plano de cobrança para você. Dúvidas sobre valores? Fale com ele.
          </p>
        )}
      </Section>

      <Section title="Notificações" hint="Avisos do seu coach aqui no app. Desmarque o que não quiser receber.">
        <NotificationPrefsForm initial={prefs} />
        <div className={`${CARD} overflow-hidden`}>
          <LinkRow href="/portal/notificacoes" title="Ver minhas notificações" text="Treino, nutrição, check-in e orientações" />
        </div>
      </Section>

      <Section title="Privacidade, dados e informações legais" hint="Seus dados são vistos só por você e pelo seu coach.">
        <div className={`${CARD} overflow-hidden`}>
          <LinkRow href="/meus-dados" title="Meus dados e autorizações" text="Revogar autorização, pedir correção ou exclusão" />
          <LinkRow href="/meus-dados/exportar" external title="Baixar meus dados" text="Arquivo JSON com tudo que existe sobre você" />
          <LinkRow href="/privacidade" title="Política de Privacidade" />
          <LinkRow href="/termos" title="Termos de Uso" />
        </div>
      </Section>

      <form action={logout}>
        <button type="submit" className={buttonClass({ variant: "secondary", size: "lg", width: "full" })}>
          <Icon name="logout" size={18} />
          Sair da conta
        </button>
      </form>
    </>
  );
}
