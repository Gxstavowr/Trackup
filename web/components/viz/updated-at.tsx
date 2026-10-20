/**
 * Faixa fina "Detalhes · última atualização: 15h32" (referência) — separa os KPIs do bloco de
 * detalhe e diz de quando é o dado. `at` é o momento REAL em que o dado foi lido/calculado
 * (ex.: `new Date()` no Server Component que fez a consulta) — nunca um horário fixo.
 * Formata no fuso de São Paulo para servidor e navegador renderizarem o mesmo texto.
 */
export function UpdatedAtStrip({
  at,
  title = "Detalhes",
  children,
  className = "",
}: {
  at: Date | string;
  title?: string;
  /** Conteúdo extra à direita do título (ex.: filtro compacto). */
  children?: React.ReactNode;
  className?: string;
}) {
  const date = typeof at === "string" ? new Date(at) : at;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "";
  const label = `${hh}h${mm}`;

  return (
    <div
      className={`flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-surface-raised px-4 py-2 text-sm ${className}`}
    >
      <span className="font-semibold text-ink-muted">{title}</span>
      {children}
      <span className="ml-auto text-xs text-ink-faint">
        última atualização:{" "}
        <time dateTime={date.toISOString()} className="font-semibold text-ink-muted tabular-nums">
          {label}
        </time>
      </span>
    </div>
  );
}
