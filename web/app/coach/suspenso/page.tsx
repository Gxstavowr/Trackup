import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, buttonClass } from "@/components/ui";
import { cardClass } from "@/components/ui/card";
import { getCoachBilling, PAYMENT_METHOD_PATH, SUBSCRIPTION_PATH } from "@/lib/billing/coach";
import { isBillingBlocked } from "@/lib/billing/state";
import { requireCoach } from "../require-coach";

/**
 * "Plano suspenso": única tela da área do coach (além de "Minha assinatura" e do Sair) enquanto a
 * assinatura do Trackly está suspensa ou cancelada. O portal do aluno não é afetado.
 */
export default async function CoachSuspendedPage() {
  await requireCoach();
  const billing = await getCoachBilling();
  if (!isBillingBlocked(billing?.status)) redirect("/coach");

  const cancelled = billing?.status === "cancelled";

  return (
    <section className={`${cardClass} mx-auto flex max-w-xl flex-col items-start gap-5 p-6 md:p-8`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand">
        <Icon name="wallet" size={24} />
      </span>
      <div className="flex flex-col gap-2">
        <span className="t-label text-ink-faint">Trackly · Assinatura</span>
        <h1 className="t-title text-ink">{cancelled ? "Plano cancelado" : "Plano suspenso"}</h1>
        <p className="text-sm text-ink-muted">
          {cancelled
            ? "Sua assinatura do Trackly foi cancelada, por isso a área do coach está pausada."
            : "Não recebemos o pagamento da sua assinatura do Trackly dentro do prazo, por isso a área do coach está pausada."}
        </p>
        <p className="text-sm text-ink">
          <span className="font-semibold">Nada foi apagado.</span> Seus alunos, check-ins, treinos,
          dietas e histórico continuam guardados — e seus alunos seguem acessando o portal deles.
          Reative o plano para voltar de onde parou.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <Link href={PAYMENT_METHOD_PATH} className={buttonClass({ variant: "primary", width: "mobile" })}>
          Reativar <Icon name="arrow-right" size={16} />
        </Link>
        <Link href={SUBSCRIPTION_PATH} className={buttonClass({ variant: "tertiary", width: "mobile" })}>
          Minha assinatura
        </Link>
      </div>
      <p className="text-xs text-ink-faint">
        Depois do pagamento, a liberação acontece automaticamente assim que a SyncPay confirmar.
        Recarregue esta página em alguns instantes.
      </p>
    </section>
  );
}
