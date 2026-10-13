import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "../../require-coach";
import { getStudentContext } from "./student-context";
import StudentHeader from "./student-header";
import StudentTabs, { type StudentTab } from "./student-tabs";

/**
 * Abas do contexto do aluno (máx. 6): Resumo, Avaliação, Treino, Nutrição, Evolução, Pagamentos.
 * Fotos e Histórico vivem dentro de Evolução (seções Métricas | Fotos | Histórico, cada uma com
 * a sua URL). NÃO são itens da navegação principal — vivem aqui, dentro do aluno.
 */
const STUDENT_TABS: StudentTab[] = [
  { segment: "", label: "Resumo" },
  // Avaliação é o fluxo principal do coach: fica logo depois do Resumo, em destaque.
  { segment: "avaliacao", label: "Avaliação" },
  { segment: "treino", label: "Treino" },
  { segment: "nutricao", label: "Nutrição" },
  { segment: "evolucao", label: "Evolução", also: ["fotos", "historico"] },
  { segment: "pagamento", label: "Pagamentos" },
];

/**
 * Layout do aluno (`/coach/alunos/[id]/*`): faixa de contexto (nome, idade, altura, objetivo,
 * situação, próxima ação) + abas, comuns a todas as telas do aluno. A situação vem da MESMA fonte
 * da lista de Alunos (`getStudentContext`). Guard de role e posse ficam aqui também
 * (`requireCoach` + `getStudentContext` -> 404 via RLS pra id inexistente OU de outra conta, sem
 * vazar o motivo), mas cada página continua checando por conta própria — layouts não
 * re-renderizam entre abas.
 */
export default async function StudentLayout({
  children,
  params,
}: LayoutProps<"/coach/alunos/[id]">) {
  const { id } = await params;
  await requireCoach();

  const ctx = await getStudentContext(id);
  if (!ctx) {
    notFound();
  }

  const state = ctx.entry.tracking.state;
  const evaluationNeedsCoach = state === "pending" || state === "in_progress" || state === "draft";
  const tabs = STUDENT_TABS.map((tab) =>
    tab.segment === "avaliacao" ? { ...tab, attention: evaluationNeedsCoach } : tab
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          href="/coach/alunos"
          className="inline-flex min-h-11 w-fit items-center tabular-nums text-sm text-ink-muted hover:text-brand"
        >
          ← Alunos
        </Link>
        <StudentHeader ctx={ctx} />
        <StudentTabs clientId={id} tabs={tabs} />
      </header>

      {children}
    </div>
  );
}
