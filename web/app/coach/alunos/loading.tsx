import { Skeleton } from "@/components/ui/skeleton";

/** Lista de alunos: cabeçalho, busca e linhas no formato real. */
export default function StudentsLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Carregando alunos…</span>
      <div aria-hidden className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-11 w-36" />
      </div>
      <Skeleton className="h-11 w-full" />
      <ul aria-hidden className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="card flex items-center gap-4 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}
