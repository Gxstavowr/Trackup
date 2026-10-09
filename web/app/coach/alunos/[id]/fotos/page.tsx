import { notFound } from "next/navigation";
import { getClient } from "@/lib/repository";
import { requireCoach } from "../../../require-coach";
import { listClientPhotos, type CheckinPhoto } from "@/lib/storage/checkin-photos";
import PhotoTriptych from "../photo-triptych";

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  return (
    <div className="flex flex-col gap-8">
      {weeks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-hero text-ink">Nenhuma foto enviada</p>
          <p className="max-w-sm text-sm text-ink-muted">
            As fotos aparecem aqui assim que o aluno enviar no check-in semanal.
          </p>
        </div>
      ) : (
        weeks.map(([week, weekPhotos]) => (
          <section key={week} className="flex flex-col gap-3">
            <h2 className="text-lg font-medium text-ink">Semana {week}</h2>
            <PhotoTriptych weekNumber={week} photos={weekPhotos} />
          </section>
        ))
      )}
    </div>
  );
}
