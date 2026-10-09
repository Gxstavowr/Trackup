"use client";

import { useEffect, useRef } from "react";
import { markReviewOpenedAction } from "./actions";

/**
 * Marca `checkin_instances.review_opened_at` quando o coach ABRE a avaliação (primeira vez).
 * É um efeito no cliente — e não uma escrita durante o render do Server Component — pra que
 * prefetch/re-render do servidor nunca contem como "abriu". A action é idempotente (o UPDATE só
 * casa com `review_opened_at is null`), então dupla execução (Strict Mode, recarregar) é inofensiva.
 *
 * Fica montado o tempo todo na tela da avaliação (não só enquanto está "pendente"): assim ele
 * sabe com QUE semana a tela foi aberta (`weekNumber` da primeira montagem) e só marca essa
 * semana. Depois de "Concluir e enviar", a fila avança o aluno pra semana seguinte na MESMA
 * tela (sem navegação): essa semana ainda não foi aberta pelo coach e não pode ser marcada como
 * aberta por causa do envio da anterior. Ela é marcada quando o coach abre a avaliação de
 * verdade — navegando até ela ou recarregando a página, que montam este componente de novo.
 */
export default function MarkReviewOpened({
  clientId,
  weekNumber,
  pending,
}: {
  clientId: string;
  weekNumber: number;
  /** A avaliação desta semana está "pendente" (check-in enviado, ainda não aberta)? */
  pending: boolean;
}) {
  const openedWeek = useRef(weekNumber);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !pending) return;
    if (weekNumber !== openedWeek.current) return; // a tela avançou de semana sozinha (após um envio)
    fired.current = true;
    void markReviewOpenedAction(clientId);
  }, [clientId, weekNumber, pending]);

  return null;
}
