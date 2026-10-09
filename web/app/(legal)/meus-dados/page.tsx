import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireClientSession } from "@/app/portal/require-client";
import {
  LEGAL_VERSION,
  REQUEST_RESPONSE_DAYS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from "@/lib/legal/documents";
import { revokeHealthConsentAction } from "./actions";
import PrivacyRequestForm from "./privacy-request-form";

export const metadata: Metadata = { title: "Meus dados · Trackly" };

type RequestRow = {
  id: string;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  details: string | null;
  response: string | null;
  created_at: string;
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Central de privacidade do ALUNO (LGPD art. 18). Fica FORA de `/portal` de propósito: usa
 * `requireClientSession` (sem o gate de consentimento), então continua acessível depois de uma
 * revogação — o titular nunca perde o acesso aos próprios direitos.
 */
export default async function MyDataPage(props: PageProps<"/meus-dados">) {
  const { user } = await requireClientSession();
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const [{ data: consents }, { data: requests }] = await Promise.all([
    supabase
      .from("consent_records")
      .select("purpose, action, document_version, created_at")
      .eq("user_id", user.id)
      .eq("purpose", "health_data")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("data_subject_requests")
      .select("id, request_type, status, details, response, created_at")
      .eq("requester_user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const health = consents?.[0] as { action: string; document_version: string; created_at: string } | undefined;
  const healthActive = health?.action === "granted" && health.document_version === LEGAL_VERSION;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <Link href="/portal" className="text-sm text-ink-muted hover:text-brand">
          ← Voltar ao portal
        </Link>
        <h1 className="font-display text-hero text-ink">Privacidade e meus dados</h1>
        <p className="text-sm text-ink-muted">
          Seus dados de acompanhamento são vistos apenas por você e pelo profissional que te
          convidou. Entenda tudo na{" "}
          <Link href="/privacidade" className="text-brand hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </header>

      {searchParams.revogado && (
        <p className="rounded-md border border-brand/40 bg-brand-tint px-4 py-3 text-sm text-ink">
          Autorização revogada. Seu profissional foi avisado e o portal fica pausado até você
          autorizar de novo. Você ainda pode baixar seus dados ou pedir a exclusão abaixo.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Baixar meus dados</h2>
        <p className="text-sm text-ink-muted">
          Um arquivo com tudo que existe sobre você: perfil, check-ins, medidas, treinos,
          alimentação, pagamentos e links para suas fotos (válidos por 1 hora).
        </p>
        <a
          href="/meus-dados/exportar"
          download
          className="inline-flex min-h-11 w-fit items-center rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:border-brand"
        >
          Baixar arquivo (JSON)
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Autorização de dados de saúde</h2>
        {healthActive ? (
          <>
            <p className="text-sm text-ink-muted">
              Autorizado em {fmt(health!.created_at)}. Se revogar, o acompanhamento pelo app é
              pausado, pois ele depende desses dados.
            </p>
            <form action={revokeHealthConsentAction} className="flex flex-col gap-3">
              <label className="flex items-start gap-2.5 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  name="confirm"
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                />
                Entendo que meu acompanhamento pelo Trackly será pausado.
              </label>
              <button
                type="submit"
                className="inline-flex min-h-11 w-fit items-center rounded-md border border-coral/40 px-4 py-2 text-sm font-medium text-coral-text hover:bg-coral-tint"
              >
                Revogar autorização
              </button>
            </form>
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            Sem autorização ativa.{" "}
            <Link href="/consentimento" className="text-brand hover:underline">
              Autorizar e voltar ao portal
            </Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg text-ink">Fazer um pedido</h2>
        <p className="text-sm text-ink-muted">
          Corrigir um dado, pedir a exclusão de tudo ou tirar uma dúvida. Seu profissional
          responde em até {REQUEST_RESPONSE_DAYS} dias.
        </p>
        <PrivacyRequestForm />
      </section>

      {requests && requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg text-ink">Meus pedidos</h2>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {(requests as RequestRow[]).map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink">{REQUEST_TYPE_LABELS[r.request_type]}</span>
                  <span className="font-mono text-label uppercase tracking-widest text-ink-faint">
                    {REQUEST_STATUS_LABELS[r.status]} · {fmt(r.created_at)}
                  </span>
                </div>
                {r.details && <p className="text-ink-muted">{r.details}</p>}
                {r.response && <p className="text-ink">Resposta: {r.response}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
