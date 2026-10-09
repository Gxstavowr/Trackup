import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoach } from "../../require-coach";
import { getStudentContext } from "./student-context";
import StudentHeader from "./student-header";
import StudentTabs, { type StudentTab } from "./student-tabs";

/**
 * Abas do contexto do aluno, na ordem do produto: Resumo, Avaliação, Treino, Nutrição, Fotos,
 * Pagamentos, Histórico. NÃO são itens da navegação principal do coach — vivem aqui, dentro do
 * aluno. Histórico (item 16) fecha a lista de propósito: é a visão "big picture" da relação ao
 * longo dos meses, depois de todas as abas operacionais. Evolução (item 15) entra logo depois de
 * Nutrição: tendência numérica das métricas — peso e o que mais o coach estiver acompanhando
 * para este aluno (item 17) — distinta do Histórico, que é a timeline de eventos.
 */
const STUDENT_TABS: StudentTab[] = [
  { segment: "", label: "Resumo" },
  // Avaliação é o fluxo principal do coach: fica logo depois do Resumo, em destaque.
  { segment: "avaliacao", label: "Avaliação" },
  { segment: "treino", label: "Treino" },
  { segment: "nutricao", label: "Nutrição" },
  { segment: "evolucao", label: "Evolução" },
  { segment: "fotos", label: "Fotos" },
  { segment: "pagamento", label: "Pagamentos" },
  { segment: "historico", label: "Histórico" },
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
          className="inline-flex min-h-11 w-fit items-center font-mono text-sm text-ink-muted hover:text-brand"
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
