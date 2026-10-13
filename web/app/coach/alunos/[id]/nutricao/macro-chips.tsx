import { formatNumber, type MacrosJson } from "@/lib/food-macros";

/**
 * Chips kcal · P · C · G. Valor ausente aparece como "—" (nunca 0). `showKcal={false}` deixa só
 * P/C/G — para quando a kcal já aparece em destaque ao lado (`lib/meal-kcal.ts`).
 */
export default function MacroChips({
  macros,
  size = "sm",
  className = "",
  showKcal = true,
}: {
  macros: MacrosJson | null | undefined;
  size?: "sm" | "md";
  className?: string;
  showKcal?: boolean;
}) {
  const all: { label: string; value: number | null | undefined; unit: string; digits: number }[] = [
    { label: "", value: macros?.kcal, unit: " kcal", digits: 0 },
    { label: "P", value: macros?.protein_g, unit: " g", digits: 1 },
    { label: "C", value: macros?.carbs_g, unit: " g", digits: 1 },
    { label: "G", value: macros?.fat_g, unit: " g", digits: 1 },
  ];
  const items = showKcal ? all : all.slice(1);
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {items.map((it, i) => (
        <span
          key={i}
          className={`${pad} rounded-full border border-line bg-surface-sunken/60 tabular-nums ${
            it.value == null ? "text-ink-faint" : "text-ink-muted"
          }`}
        >
          {it.label && <b className="mr-1 font-semibold text-ink-faint">{it.label}</b>}
          {it.value == null ? "—" : `${formatNumber(it.value, it.digits)}${it.unit}`}
        </span>
      ))}
    </span>
  );
}
