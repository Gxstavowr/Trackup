import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CONTROLLER,
  REQUEST_RESPONSE_DAYS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type DataSubjectRequestStatus,
  type DataSubjectRequestType,
} from "@/lib/legal/documents";
import { BUTTON_OUTLINE, BUTTON_PRIMARY, CARD, EYEBROW } from "../financeiro/ui";
import { requireCoach } from "../require-coach";
import {
  deleteStudentForRequestAction,
  requestAccountDeletionAction,
  resolvePrivacyRequestAction,
} from "./actions";

type RequestRow = {
  id: string;
  requester_role: "coach" | "client";
  requester_user_id: string;
  requester_name: string | null;
  client_id: string | null;
  request_type: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  details: string | null;
  response: string | null;
  created_at: string;
};

const ERRORS: Record<string, string> = {
  pedido: "Não foi possível atualizar o pedido. Tente novamente.",
  motivo: "Para recusar um pedido, escreva o motivo — o aluno precisa saber por quê.",
  confirmar: "Marque a confirmação antes de continuar.",
  exclusao: "Não foi possível excluir os dados do aluno. Nada foi marcado como concluído.",
};

const PURPOSE_LABELS: Record<string, string> = {
  terms_of_use: "Termos de Uso",
  privacy_policy: "Política de Privacidade",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/**
 * Configurações › Privacidade (LGPD). O coach é o controlador dos dados dos alunos: aqui ele vê
 * e responde os pedidos deles (prazo de 15 dias), exporta e exclui dados, e
 * vê os próprios aceites. RLS: `dsr_coach_read` só mostra pedidos de alunos da própria conta.
 */
export default async function CoachSettingsPage(props: PageProps<"/coach/configuracoes">) {
  const { user } = await requireCoach();
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const [{ data: requestRows }, { data: consents }] = await Promise.all([
    supabase
      .from("data_subject_requests")
      .select(
        "id, requester_role, requester_user_id, requester_name, client_id, request_type, status, details, response, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("consent_records")
      .select("purpose, action, document_version, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const requests = (requestRows ?? []) as RequestRow[];
  const studentRequests = requests.filter((r) => r.requester_role === "client");
  const open = studentRequests.filter((r) => r.status === "open" || r.status === "in_progress");
  const closed = studentRequests.filter((r) => r.status === "completed" || r.status === "rejected");
  const ownRequests = requests.filter((r) => r.requester_user_id === user.id);
  const pendingAccountDeletion = ownRequests.some(
    (r) => r.request_type === "deletion" && (r.status === "open" || r.status === "in_progress")
  );

  // Alunos que ainda existem (pra saber se dá pra exportar/excluir a partir do pedido).
  const clientIds = [...new Set(open.map((r) => r.client_id).filter((id): id is string => !!id))];
  const { data: existing } = clientIds.length
    ? await supabase.from("clients").select("id").in("id", clientIds)
    : { data: [] as { id: string }[] };
  const existingIds = new Set((existing ?? []).map((c) => c.id));

  const today = new Date().toISOString();
  const errorCode = typeof searchParams.erro === "string" ? searchParams.erro : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <span className={EYEBROW}>Trackly · Coach</span>
        <h1 className="font-display text-hero text-ink">Configurações</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Privacidade e LGPD. Você é o <strong className="text-ink">controlador</strong> dos dados
          dos seus alunos: responda os pedidos deles em até {REQUEST_RESPONSE_DAYS} dias.
        </p>
      </header>

      {errorCode && ERRORS[errorCode] && (
        <p className="rounded-md border border-coral/30 bg-coral-tint px-4 py-3 text-sm text-coral-text">
          {ERRORS[errorCode]}
        </p>
      )}
      {searchParams.excluido && (
        <p className="rounded-md border border-brand/40 bg-brand-tint px-4 py-3 text-sm text-ink">
          Dados do aluno excluídos e pedido marcado como concluído.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">Pedidos dos alunos</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-6 py-8 text-center text-sm text-ink-muted">
            Nenhum pedido em aberto.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((r) => {
              const deadline = new Date(new Date(r.created_at).getTime() + REQUEST_RESPONSE_DAYS * DAY_MS);
              const overdue = deadline.toISOString() < today;
              const clientExists = !!r.client_id && existingIds.has(r.client_id);
              return (
                <li key={r.id} className={`${CARD} flex flex-col gap-3 p-5`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-ink">
                      <strong>{r.requester_name ?? "Aluno"}</strong> ·{" "}
                      {REQUEST_TYPE_LABELS[r.request_type]}
                    </span>
                    <span className={`${EYEBROW} ${overdue ? "text-coral-text" : ""}`}>
                      {REQUEST_STATUS_LABELS[r.status]} · aberto {fmt(r.created_at)} · prazo{" "}
                      {fmt(deadline.toISOString())}
                    </span>
                  </div>
                  {r.details && <p className="text-sm text-ink-muted">{r.details}</p>}

                  {clientExists && (
                    <a href={`/coach/privacidade/exportar/${r.client_id}`} download className={`${BUTTON_OUTLINE} w-fit`}>
                      Exportar dados do aluno (JSON)
                    </a>
                  )}

                  <form action={resolvePrivacyRequestAction} className="flex flex-col gap-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <textarea
                      name="response"
                      rows={2}
                      maxLength={2000}
                      placeholder="Resposta ao aluno (obrigatória para recusar)"
                      className="rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    />
                    <div className="flex flex-wrap gap-2">
                      {r.status === "open" && (
                        <button name="status" value="in_progress" className={BUTTON_OUTLINE}>
                          Em andamento
                        </button>
                      )}
                      <button name="status" value="completed" className={BUTTON_PRIMARY}>
                        Concluir
                      </button>
                      <button name="status" value="rejected" className={BUTTON_OUTLINE}>
                        Recusar
                      </button>
                    </div>
                  </form>

                  {r.request_type === "deletion" && clientExists && (
                    <form
                      action={deleteStudentForRequestAction}
                      className="flex flex-col gap-2 rounded-md border border-coral/30 p-4"
                    >
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="clientId" value={r.client_id!} />
                      <label className="flex items-start gap-2.5 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          name="confirm"
                          required
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                        />
                        Excluir definitivamente {r.requester_name ?? "este aluno"}: check-ins,
                        medidas, fotos, planos, pagamentos e login. Não dá para desfazer.
                      </label>
                      <button className={`${BUTTON_OUTLINE} w-fit border-coral/40 text-coral-text`}>
                        Excluir todos os dados
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {closed.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted hover:text-ink">
              Pedidos encerrados ({closed.length})
            </summary>
            <ul className="mt-3 flex flex-col divide-y divide-line rounded-md border border-line">
              {closed.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
                  <span className="text-ink">
                    {r.requester_name ?? "Aluno"} · {REQUEST_TYPE_LABELS[r.request_type]} ·{" "}
                    {REQUEST_STATUS_LABELS[r.status]}
                  </span>
                  {r.response && <span className="text-ink-muted">{r.response}</span>}
                  <span className={EYEBROW}>{fmt(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">Seus aceites</h2>
        {consents && consents.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line text-sm">
            {consents.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span className="text-ink">
                  {PURPOSE_LABELS[c.purpose] ?? c.purpose} · versão {c.document_version}
                </span>
                <span className={EYEBROW}>
                  {c.action === "granted" ? "Aceito" : "Revogado"} em {fmt(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">Nenhum registro ainda.</p>
        )}
        <p className="text-sm text-ink-muted">
          <Link href="/termos" className="text-brand hover:underline">
            Termos de Uso
          </Link>{" "}
          ·{" "}
          <Link href="/privacidade" className="text-brand hover:underline">
            Política de Privacidade
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl text-ink">Encerrar conta</h2>
        {pendingAccountDeletion ? (
          <p className="text-sm text-ink-muted">
            Pedido de encerramento registrado. O Trackly conclui em até {REQUEST_RESPONSE_DAYS}{" "}
            dias e confirma por e-mail. Dúvidas: {CONTROLLER.dpoEmail}.
          </p>
        ) : (
          <form action={requestAccountDeletionAction} className="flex flex-col gap-3">
            <label className="flex items-start gap-2.5 text-sm text-ink-muted">
              <input
                type="checkbox"
                name="confirm"
                required
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              Quero encerrar minha conta e excluir todos os dados dela, inclusive dos meus alunos.
              Exporte o que precisar antes.
            </label>
            <button className={`${BUTTON_OUTLINE} w-fit border-coral/40 text-coral-text`}>
              Pedir encerramento da conta
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
