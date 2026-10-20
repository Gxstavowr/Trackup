/** `YYYY-MM-DD` (coluna `date`, sem fuso) → `dd/mm/aaaa`, sem deslocar o dia pelo fuso de quem vê. */
export function formatDateBR(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

/** Instante (`timestamptz`) → `dd/mm/aaaa` no fuso de São Paulo. */
export function formatInstantBR(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
