import "server-only";
import { cache } from "react";
import { getEvaluationQueue, type EvaluationRow } from "@/lib/evaluations";
import { monthOf, todayInSaoPaulo } from "@/lib/finance/dates";
import { getFinanceOverview, type FinancePayment } from "@/lib/finance/queries";
import { getClient, getPaymentStatusForClients, type Client } from "@/lib/repository";
import { getOrigin } from "@/lib/site-url";
import { buildStudentEntry, type StudentEntry } from "../student-situation";

export type StudentContext = {
  client: Client;
  /** A MESMA entrada que a lista de Alunos monta (situação, próxima ação, botão principal, financeiro). */
  entry: StudentEntry;
  /** Linha da fila de avaliações do aluno (semana/período/estado); `null` fora da fila (convite, pausa). */
  evaluation: EvaluationRow | null;
};

/**
 * Contexto do aluno pra todas as telas de `/coach/alunos/[id]/*` (cabeçalho, Resumo...).
 *
 * Situação, rótulos e ação principal saem de `buildStudentEntry` — a MESMA função e as MESMAS
 * fontes (`getEvaluationQueue` + status de pagamento) da lista de Alunos —, então o perfil nunca
 * contradiz a lista. `cache()` do React: layout e página da mesma requisição pagam uma ida ao
 * banco só. `null` = aluno inexistente ou de outra conta (RLS): quem chama responde 404.
 */
export const getStudentContext = cache(async (id: string): Promise<StudentContext | null> => {
  const client = await getClient(id);
  if (!client) return null;

  const [queue, paymentStatusByClient, origin] = await Promise.all([
    getEvaluationQueue(), // deduplicado por requisição com o badge da navegação
    getPaymentStatusForClients([id]),
    getOrigin(),
  ]);
  const paymentStatus = paymentStatusByClient.get(id) ?? "sem_assinatura";

  // Detalhes da cobrança em atraso (valor, vencimento, telefone) só quando atrasado — mesma
  // consulta da lista, pra a mensagem de WhatsApp sair igual. Se falhar, o botão cai no link
  // "Cobrar pagamento" -> aba Pagamentos.
  let latePayment: FinancePayment | null = null;
  if (paymentStatus === "atrasado") {
    try {
      const overview = await getFinanceOverview({ month: monthOf(todayInSaoPaulo()) });
      latePayment = overview.late.find((p) => p.client.id === id) ?? null;
    } catch (err) {
      console.error("Não foi possível carregar a cobrança em atraso do aluno:", err);
    }
  }

  const evaluation = queue.find((row) => row.client.id === id) ?? null;
  const entry = buildStudentEntry({
    client,
    evaluation,
    paymentStatus,
    latePayment,
    inviteUrl: `${origin}/convite?id=${client.id}`,
  });

  return { client, entry, evaluation };
});
