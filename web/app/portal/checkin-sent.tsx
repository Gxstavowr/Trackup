import Link from "next/link";
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD } from "./portal-ui";

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
      <div className={`${CARD} flex flex-col items-start gap-3 p-5`}>
        <span className="rounded-full bg-ok-tint px-3 py-1 font-mono text-xs uppercase tracking-wide text-ok">
          Ciclo concluído
        </span>
        <p className="font-display text-xl text-ink">Semana {weekNumber} concluída</p>
        <p className="text-sm text-ink-muted">
          Seu coach avaliou o seu check-in. A orientação está na Home. O próximo check-in abre na
          próxima semana.
        </p>
        <Link href="/portal" className={BUTTON_PRIMARY}>
          Ver a orientação do coach
        </Link>
      </div>
    );
  }

  return (
    <div className={`${CARD} flex flex-col items-start gap-4 p-5`} role="status">
      <span className="rounded-full bg-brand-tint px-3 py-1 font-mono text-xs uppercase tracking-wide text-brand">
        Enviado · aguardando o coach
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-xl text-ink">Check-in enviado — agora é com o seu coach</p>
        <p className="text-sm text-ink-muted">
          O check-in da semana {weekNumber} já está com ele. Você não precisa fazer mais nada por
          aqui.
        </p>
      </div>

      <ol className="flex w-full flex-col gap-2 text-sm text-ink-muted">
        <li className="flex gap-3">
          <span className="font-mono text-ink-faint">1</span>
          <span>Seu coach recebe um aviso e avalia as suas respostas.</span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-faint">2</span>
          <span>Ele monta a orientação da semana e ajusta o plano, se precisar.</span>
        </li>
        <li className="flex gap-3">
          <span className="font-mono text-ink-faint">3</span>
          <span>Você recebe uma notificação assim que a orientação estiver pronta.</span>
        </li>
      </ol>

      <p className="text-sm text-ink">Enquanto espera, é só seguir o plano:</p>
      <div className="grid w-full grid-cols-2 gap-3">
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
  );
}
