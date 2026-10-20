import Link from "next/link";
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD } from "./portal-ui";
import Icon from "@/components/ui/icon";
import { CompletionMark } from "@/components/ui/completion-mark";

/**
 * Estado "check-in enviado / avaliado" do aluno. Usado pela página `/portal/checkin` (qualquer
 * dia da semana) e também pelo formulário guiado, logo depois de enviar. O ponto central: agora
 * a próxima ação é do COACH — e o aluno sabe o que fazer enquanto espera.
 */
export default function CheckinSent({
  weekNumber,
  reviewed,
}: {
  weekNumber: number;
  reviewed: boolean;
}) {
  if (reviewed) {
    return (
      <div className={`${CARD} tk-enter flex flex-col items-start gap-4 p-5`}>
        <span className="tk-pop flex h-14 w-14 items-center justify-center rounded-full bg-success text-on-accent">
          <Icon name="check" size={28} />
        </span>
        <div className="flex flex-col gap-1.5">
          <span className="t-label text-success">Ciclo concluído</span>
          <p className="font-display text-2xl text-ink">Semana {weekNumber} concluída</p>
          <p className="text-sm text-ink-muted">
            Seu coach avaliou o seu check-in e a orientação já está disponível. O próximo check-in abre na
            próxima semana.
          </p>
        </div>
        <Link href="/portal/avaliacao" className={BUTTON_PRIMARY}>
          Ver avaliação semanal
        </Link>
      </div>
    );
  }

  return (
    <div className="tk-stagger flex flex-col gap-4" role="status">
      <div className="flex flex-col items-start gap-4 rounded-lg border border-success/30 bg-success-tint p-5">
        <CompletionMark size={56} />
        <div className="flex flex-col gap-1.5">
          <span className="t-label text-success">Enviado · semana {weekNumber}</span>
          <p className="font-display text-2xl leading-tight text-ink">
            Check-in enviado — agora é com o seu coach
          </p>
          <p className="text-sm text-ink-muted">
            Você não precisa fazer mais nada por aqui. Seu coach está avaliando as suas respostas.
          </p>
        </div>
      </div>

      <section className={`${CARD} flex flex-col gap-3 p-5`} aria-label="O que acontece agora">
        <h2 className="t-label text-ink-faint">O que acontece agora</h2>
        <ol className="flex flex-col gap-3 text-sm text-ink-muted">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-on-accent">
              <Icon name="check" size={14} />
            </span>
            <span className="text-ink">Você enviou o check-in.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand text-xs font-bold text-brand">
              2
            </span>
            <span>Seu coach avalia as respostas e ajusta o plano, se precisar.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs font-bold text-ink-faint">
              3
            </span>
            <span>Você recebe um aviso assim que a orientação estiver pronta.</span>
          </li>
        </ol>
      </section>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">Enquanto espera, é só seguir o plano:</p>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/portal/treino" className={BUTTON_GHOST}>
            Meu treino
          </Link>
          <Link href="/portal/nutricao" className={BUTTON_GHOST}>
            Minha nutrição
          </Link>
        </div>
        <Link href="/portal" className={`${BUTTON_GHOST} w-full`}>
          Voltar para o início
        </Link>
      </div>
    </div>
  );
}
