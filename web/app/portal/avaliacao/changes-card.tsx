import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import type { AreaChanges, ChangeArea, ChangeLine } from "@/lib/evolution-plan-changes";

const AREA: Record<ChangeArea, { title: string; href: string; linkLabel: string }> = {
  training: { title: "Treino", href: "/portal/treino", linkLabel: "Ver treino atual" },
  nutrition: { title: "Nutrição", href: "/portal/nutricao", linkLabel: "Ver nutrição atual" },
  cardio: { title: "Cardio", href: "/portal/treino", linkLabel: "Ver cardio no treino" },
};

const KIND: Record<ChangeLine["kind"], { sign: string; label: string; cls: string }> = {
  added: { sign: "+", label: "Adicionado", cls: "text-success" },
  removed: { sign: "−", label: "Removido", cls: "text-danger-text" },
  changed: { sign: "~", label: "Alterado", cls: "text-warning" },
};

const VISIBLE_LINES = 6;

function dateBr(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function Lines({ lines }: { lines: ChangeLine[] }) {
  const item = (l: ChangeLine) => (
    <li key={l.id} className="flex items-start gap-2 text-sm leading-snug text-ink">
      <span aria-hidden className={`mt-px w-3 shrink-0 text-center font-bold ${KIND[l.kind].cls}`}>
        {KIND[l.kind].sign}
      </span>
      <span>
        <span className="sr-only">{KIND[l.kind].label}: </span>
        {l.text}
      </span>
    </li>
  );
  const head = lines.slice(0, VISIBLE_LINES);
  const rest = lines.slice(VISIBLE_LINES);
  return (
    <>
      <ul className="flex flex-col gap-2">{head.map(item)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-brand [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Mostrar mais {rest.length}</span>
            <span className="hidden group-open:inline">Mostrar menos</span>
          </summary>
          <ul className="flex flex-col gap-2">{rest.map(item)}</ul>
        </details>
      )}
    </>
  );
}

/**
 * Bloco de UMA área ("O que mudou"): mostra só o que o plano publicado diz. Estados:
 * primeiro plano, republicado sem diferença ou lista de mudanças. Sempre com link para o plano atual.
 */
export default function ChangesCard({ changes }: { changes: AreaChanges }) {
  if (changes.status === "none") return null;
  const meta = AREA[changes.area];
  const v = changes.version;
  return (
    <section aria-label={`O que mudou no ${meta.title.toLowerCase()}`} className="flex flex-col gap-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-base font-bold text-ink">{meta.title}</h3>
        {changes.status === "initial" && <Badge tone="info">Primeiro plano</Badge>}
        {changes.status === "changed" && <Badge tone="accent">{changes.lines.length === 1 ? "1 mudança" : `${changes.lines.length} mudanças`}</Badge>}
        {changes.status === "unchanged" && <Badge tone="neutral">Sem mudança de conteúdo</Badge>}
        {v && (
          <span className="text-xs text-ink-faint">
            “{v.name}” · publicado em {dateBr(v.publishedAt)}
          </span>
        )}
      </header>
      {changes.status === "initial" && (
        <p className="text-sm text-ink-muted">Seu coach publicou o primeiro plano de {meta.title.toLowerCase()}. Ainda não há versão anterior para comparar.</p>
      )}
      {changes.status === "unchanged" && (
        <p className="text-sm text-ink-muted">O plano foi publicado de novo, mas o conteúdo ficou igual ao anterior.</p>
      )}
      {changes.status === "changed" && <Lines lines={changes.lines} />}
      <Link href={meta.href} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand hover:underline">
        {meta.linkLabel}
        <Icon name="chevron" size={16} />
      </Link>
    </section>
  );
}
