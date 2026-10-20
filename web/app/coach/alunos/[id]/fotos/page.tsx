import { notFound } from "next/navigation";
import { getClient } from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { listClientPhotos, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import EvolutionSubnav from "../evolution-subnav";
import PhotoTriptych from "../photo-triptych";
import WeekComparison from "../avaliacao/week-comparison";
import { loadComparison } from "../avaliacao/load-comparison";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Fotos de evolução do aluno — visão READ-ONLY do coach (item 5 do TODO). Rota:
 * `/coach/alunos/[id]/fotos` (aba "Fotos" do layout do aluno, que já fornece cabeçalho,
 * navegação e logout). Agrupa por semana (mais recente primeiro) e por posição.
 *
 * As imagens vêm do bucket PRIVADO via URLs assinadas de curta duração, geradas no servidor
 * a cada render por `listClientPhotos` — que só devolve algo se o usuário logado for o coach
 * dono deste aluno (ou admin da conta); senão devolve `null` e a página responde 404, igual
 * a "aluno inexistente" (não vaza que o aluno/fotos existem). Como a URL expira, recarregar
 * a página gera URLs novas. Sem comparador/slider (isso é o item 14).
 */
export default async function ClientPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { comparar } = await searchParams;
  // Guard de role (sessão + coach_users) — o layout do aluno também chama, mas layouts não
  // re-renderizam entre abas, então a página que expõe dado checa por conta própria.
  await requireCoach();

  const client = await getClient(id);
  if (!client) {
    notFound();
  }

  const photos = await listClientPhotos(id);
  if (photos === null) {
    // Coach da mesma conta, mas sem vínculo com este aluno (não é o dono nem admin).
    notFound();
  }

  const byWeek = new Map<number, CheckinPhoto[]>();
  for (const photo of photos) {
    byWeek.set(photo.week_number, [...(byWeek.get(photo.week_number) ?? []), photo]);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => b[0] - a[0]);

  // Comparação integrada (V2 tarefa 13): a semana mais recente com fotos contra uma semana anterior.
  // É a mesma peça da avaliação; `?comparar=N` escolhe a semana comparativa.
  const latestWeek = weeks[0]?.[0] ?? null;
  const comparison =
    latestWeek !== null ? await loadComparison(id, client.start_date, latestWeek, comparar) : null;

  return (
    <div className="flex flex-col gap-8">
      <EvolutionSubnav clientId={id} active="fotos" />
      {comparison && latestWeek !== null && (
        <WeekComparison
          key={`${id}:${latestWeek}`}
          clientId={id}
          currentWeek={latestWeek}
          weeks={comparison.weeks}
          adherenceIsScale
          initialCompareWeek={comparison.compareWeek}
          initialPhotos={comparison.initialPhotos}
          context="photos"
        />
      )}
      {weeks.length === 0 ? (
        <EmptyState icon="camera" title="Nenhuma foto enviada" text="As fotos aparecem aqui assim que o aluno enviar no check-in semanal." />
      ) : (
        weeks.map(([week, weekPhotos]) => (
          <section key={week} className="flex flex-col gap-3">
            <h2 className="t-subtitle text-ink">Semana {week}</h2>
            <PhotoTriptych weekNumber={week} photos={weekPhotos} />
          </section>
        ))
      )}
    </div>
  );
}
