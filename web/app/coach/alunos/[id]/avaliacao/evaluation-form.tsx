"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { saveEvaluationAction, type EvaluationActionState } from "./actions";
import CycleDoneBanner from "./cycle-done-banner";
import { textareaClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";

const initialState: EvaluationActionState = null;

type FormProps = {
  clientId: string;
  clientName: string;
  weekNumber: number;
  initialText: string;
  initialNote: string;
  hasDraft: boolean;
};

/**
 * Avaliação da semana: nota do coach (privada) + orientação para o aluno.
 *
 * Duas camadas, de propósito:
 *  - ESTE componente fica montado enquanto o coach está com este aluno aberto e guarda o
 *    resultado da action (`useActionState`). Depois de "Concluir e enviar", a fila avança o aluno
 *    pra semana seguinte (já enviada) e a página se re-renderiza NO MESMO LUGAR: aqui o resultado
 *    sobrevive e vira a confirmação "Orientação da semana N enviada".
 *  - `EvaluationFields` (texto, nota, painel de confirmação) leva `key = aluno + semana`: quando a
 *    semana mostrada muda, ele é REMONTADO e nada da semana anterior (texto, nota, painel aberto)
 *    vaza pra semana nova — um clique em "Confirmar e enviar" jamais reenvia o texto antigo.
 */
export default function EvaluationForm(props: FormProps) {
  const { clientId, clientName, weekNumber } = props;
  const [state, action, pending] = useActionState(saveEvaluationAction, initialState);
  const firstName = clientName.trim().split(/\s+/)[0] ?? clientName;

  // Enviada, e a tela já está em OUTRA semana (a fila avançou): a confirmação cita a semana enviada.
  const sentWeek =
    state?.success === "sent" && state.week !== undefined && state.week !== weekNumber ? state.week : null;

  return (
    <div className="flex flex-col gap-4">
      {sentWeek !== null && (
        <CycleDoneBanner key={sentWeek}>
          Orientação da semana {sentWeek} enviada a {clientName}: o ciclo da semana {sentWeek} está
          concluído e {firstName} já recebeu a notificação. Você está agora na avaliação da semana {weekNumber}.
        </CycleDoneBanner>
      )}
      <EvaluationFields
        key={`${clientId}:${weekNumber}`}
        {...props}
        state={state}
        action={action}
        pending={pending}
      />
    </div>
  );
}

/**
 * Formulário em si.
 *  - "Salvar rascunho": grava `orientations` com `is_draft = true` (uma linha por aluno+semana).
 *  - "Finalizar avaliação": pede CONFIRMAÇÃO explícita (painel inline, acessível e
 *    testável — sem `window.confirm`) antes de enviar; enviar conclui o ciclo e notifica o aluno.
 * Campos controlados (`useState`): o React 19 reseta formulários não controlados ao fim de uma
 * action, o que apagaria o texto do coach depois de "Salvar rascunho".
 */
function EvaluationFields({
  clientId,
  clientName,
  weekNumber,
  initialText,
  initialNote,
  hasDraft,
  state: actionState,
  action,
  pending,
}: FormProps & {
  state: EvaluationActionState;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [note, setNote] = useState(initialNote);
  const [confirming, setConfirming] = useState(false);
  const [intent, setIntent] = useState<"draft" | "send" | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const textId = useId();
  const hintId = useId();
  // O painel de confirmação cresce dentro de um card com rolagem própria: traz-o inteiro para a vista.
  useEffect(() => {
    if (confirming) confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [confirming]);

  // Só o resultado desta semana vale aqui (erro/rascunho de outra semana não é repetido).
  const state = actionState?.week === weekNumber ? actionState : null;
  const empty = text.trim() === "";
  const firstName = clientName.trim().split(/\s+/)[0] ?? clientName;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      {/* A semana que o coach está vendo: o servidor recusa gravar se a fila já estiver em outra. */}
      <input type="hidden" name="weekNumber" value={weekNumber} />

      {/* Desktop: o painel rola por dentro (ex.: confirmação aberta). O rótulo é filho direto do form
          (não do bloco do textarea) para ficar preso logo abaixo do cabeçalho sticky do painel
          (~3.6rem: pt-5 + kicker + gap-1 + t-subtitle + pb-3 + borda) enquanto o form rola. */}
      <label
        htmlFor={textId}
        className="-mb-2.5 text-sm font-semibold text-ink lg:sticky lg:top-[3.6rem] lg:z-[5] lg:-mx-5 lg:-mt-1.5 lg:-mb-4 lg:bg-surface lg:px-5 lg:py-1.5"
      >
        Orientação para {firstName}
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <span id={hintId} className="text-xs text-ink-muted">
          O aluno vê este texto no portal quando você finalizar a avaliação.
        </span>
        <textarea
          id={textId}
          aria-describedby={hintId}
          name="text"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={textareaClass}
          placeholder="O que manter, o que ajustar e o foco para a próxima semana."
        />
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-ink">Nota do coach</span>
        <span className="text-xs text-ink-muted">Privada: só você vê. Registre o que observou nesta avaliação.</span>
        <textarea
          name="coachNote"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={textareaClass}
          placeholder="Ex.: pontos para conferir na próxima conversa…"
        />
      </label>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md border border-coral/30 bg-coral-tint px-3 py-2 text-sm text-coral-text"
        >
          {state.error}
        </p>
      )}
      {state?.success === "draft" && !pending && (
        <p
          role="status"
          className="tk-fade rounded-md border border-brand/30 bg-brand-tint px-3 py-2 text-sm text-brand"
        >
          Rascunho salvo{state.savedAt ? ` às ${state.savedAt}` : ""}. Você pode sair e continuar
          depois — o aluno ainda não vê nada.
        </p>
      )}

      {!confirming ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending || empty}
            onClick={() => setConfirming(true)}
            className={buttonClass({ variant: "primary", size: "lg", width: "full" })}
          >
            Finalizar avaliação
          </button>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={pending}
            onClick={() => setIntent("draft")}
            className={buttonClass({ variant: "secondary", width: "full" })}
          >
            {pending && intent === "draft"
              ? "Salvando…"
              : hasDraft || state?.success === "draft"
                ? "Atualizar rascunho"
                : "Salvar rascunho"}
          </button>
          {empty && (
            <p className="text-xs text-ink-faint">
              Escreva a orientação para poder finalizar. O rascunho pode ser salvo a qualquer momento.
            </p>
          )}
        </div>
      ) : (
        <div
          ref={confirmRef}
          role="group"
          aria-label="Confirmar envio da orientação"
          className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-brand-tint p-4"
        >
          <p className="font-semibold text-ink">
            Finalizar a avaliação da semana {weekNumber} e enviar a orientação para {firstName}?
          </p>
          <p className="text-sm text-ink-muted">
            {firstName} vai receber uma notificação e ver a orientação no portal. A avaliação da semana{" "}
            {weekNumber} será concluída e a orientação não poderá mais ser editada. A nota do coach
            continua privada.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="submit"
              name="intent"
              value="send"
              disabled={pending}
              onClick={() => setIntent("send")}
              className={buttonClass({ variant: "primary", size: "lg", width: "full" })}
            >
              {pending && intent === "send" ? "Enviando…" : "Confirmar e enviar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className={buttonClass({ variant: "secondary", width: "full" })}
            >
              Voltar e revisar
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
