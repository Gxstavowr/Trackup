import { getEvaluationQueue } from "@/lib/evaluations";
import { monthOf, todayInSaoPaulo } from "@/lib/finance/dates";
import { getFinanceOverview, type FinancePayment } from "@/lib/finance/queries";
import { getClients, getPaymentStatusForClients } from "@/lib/repository";
import { getOrigin } from "@/lib/site-url";
import { requireCoach } from "../require-coach";
import { getOnboardingRows } from "../protocol-queue";
import AddClientForm from "./add-client-form";
import StudentList from "./student-list";
import { buildStudentEntry } from "./student-situation";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Lista de alunos do coach (`/coach/alunos`) — a tela OPERACIONAL: cada aluno com seus dados,
 * a situação do ACOMPANHAMENTO e a situação FINANCEIRA em áreas separadas, uma ação principal
 * por aluno, busca, filtros e ordenação por necessidade de ação (mais urgente primeiro).
 *
 * As três fontes (alunos, fila de avaliações, pagamentos) são lidas aqui, no servidor, e
 * combinadas em `StudentEntry` (`student-situation.ts`); a interação (busca/filtro/ordem) é
 * client-side em `student-list.tsx`, já que o volume de alunos de um coach é pequeno.
 */
export default async function CoachStudentsPage() {
  await requireCoach();

  const clients = await getClients();
  const origin = await getOrigin();
  const [queue, paymentStatusByClient, onboarding] = await Promise.all([
    getEvaluationQueue(), // deduplicado por requisição com o badge da navegação
    getPaymentStatusForClients(clients.map((c) => c.id)),
    getOnboardingRows(), // view do cadastro novo (V5); sem linhas se a migração não foi aplicada
  ]);
  const onboardingByClient = new Map(onboarding.rows.map((row) => [row.client_id, row]));

  // Detalhes da cobrança em atraso (valor, vencimento, telefone) só são necessários pra quem
  // está atrasado; aproveita a mesma consulta do Financeiro pra a mensagem de WhatsApp sair
  // igual nas duas telas. Se falhar, a linha cai no link "Cobrar pagamento" -> Financeiro.
  const latePaymentByClient = new Map<string, FinancePayment>();
  if ([...paymentStatusByClient.values()].includes("atrasado")) {
    try {
      const overview = await getFinanceOverview({ month: monthOf(todayInSaoPaulo()) });
      for (const payment of overview.late) {
        // `late` vem do mais antigo pro mais recente: fica a cobrança mais atrasada de cada aluno.
        if (!latePaymentByClient.has(payment.client.id)) latePaymentByClient.set(payment.client.id, payment);
      }
    } catch (err) {
      console.error("Não foi possível carregar as cobranças em atraso pra lista de alunos:", err);
    }
  }

  const evaluationByClient = new Map(queue.map((row) => [row.client.id, row]));
  const entries = clients.map((client) =>
    buildStudentEntry({
      client,
      evaluation: evaluationByClient.get(client.id) ?? null,
      paymentStatus: paymentStatusByClient.get(client.id) ?? "sem_assinatura",
      latePayment: latePaymentByClient.get(client.id) ?? null,
      inviteUrl: `${origin}/convite?id=${client.id}`,
      onboardingRow: onboardingByClient.get(client.id) ?? null,
    })
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="t-label text-ink-faint">
            Trackly · Coach
          </span>
          <h1 className="font-display text-hero text-ink">
            Alunos {clients.length > 0 && `(${clients.length})`}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Quem precisa da sua ação aparece primeiro. Acompanhamento e financeiro ficam separados.
          </p>
        </div>
        <AddClientForm />
      </header>

      {clients.length === 0 ? (
        <EmptyState
          icon="user"
          title="Nenhum aluno cadastrado ainda"
          text="Adicione seu primeiro aluno para gerar o link de convite e começar o acompanhamento."
        />
      ) : (
        <StudentList entries={entries} onboardingUnavailable={!onboarding.available} />
      )}
    </div>
  );
}
