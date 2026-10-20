import { CHECKIN_PHOTO_ANGLES, type CheckinPhotoAngle, type PhotoAngle } from "@/lib/storage/photo-angles";

/**
 * Apoio PURO à comparação de fotos do Progresso (V5 item 32): cobertura das quatro posições por
 * semana, atalhos de seleção de semanas e posições comparáveis entre duas semanas. Sem I/O.
 * Registros antigos (`side`, "Lateral (registro anterior)") contam como posição própria: nunca
 * entram na cobertura das quatro posições novas nem são tratados como esquerda/direita.
 */

export type PhotoCoverage = {
  /** Posições novas presentes (0 a 4). */
  count: number;
  /** As quatro posições do check-in novo. */
  complete: boolean;
  /** Tem a lateral de registro antigo. */
  legacy: boolean;
};

export function photoCoverage(angles: readonly PhotoAngle[]): PhotoCoverage {
  const count = CHECKIN_PHOTO_ANGLES.filter((a) => angles.includes(a)).length;
  return { count, complete: count === CHECKIN_PHOTO_ANGLES.length, legacy: angles.includes("side") };
}

/** "4 fotos", "2 de 4 fotos", "foto antiga" — texto curto para o seletor de semana. */
export function coverageLabel(angles: readonly PhotoAngle[]): string {
  const c = photoCoverage(angles);
  if (c.complete) return "4 posições";
  if (c.count === 0) return c.legacy ? "registro antigo" : "sem fotos";
  return `${c.count} de 4 posições${c.legacy ? " + antiga" : ""}`;
}

export type CompareShortcut = { id: string; label: string; from: number; to: number };

/**
 * Atalhos de comparação sobre as semanas COM foto (ascendente, ≥ 2): sempre "mais recente" como
 * depois. Antes = início, semana anterior, e a semana mais próxima de 4 e de 12 semanas atrás
 * (por número de semana) quando forem diferentes das já oferecidas. Sem duplicar pares.
 */
export function suggestShortcuts(weekNumbers: readonly number[]): CompareShortcut[] {
  const weeks = [...weekNumbers].sort((a, b) => a - b);
  if (weeks.length < 2) return [];
  const last = weeks[weeks.length - 1];
  const earlier = weeks.slice(0, -1);
  const closestTo = (target: number) =>
    earlier.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), earlier[0]);

  const out: CompareShortcut[] = [];
  const seen = new Set<number>();
  const add = (id: string, label: string, from: number) => {
    if (seen.has(from)) return;
    seen.add(from);
    out.push({ id, label, from, to: last });
  };
  add("previous", "Semana anterior", earlier[earlier.length - 1]);
  const m4 = closestTo(last - 4);
  if (last - m4 >= 3) add("m4", "Cerca de 1 mês atrás", m4);
  const m12 = closestTo(last - 12);
  if (last - m12 >= 8) add("m12", "Cerca de 3 meses atrás", m12);
  add("start", "Desde o início", earlier[0]);
  return out;
}

/** Posições novas que existem NAS DUAS semanas (base da visão "4 posições"), na ordem de exibição. */
export function sharedNewAngles(
  a: readonly PhotoAngle[],
  b: readonly PhotoAngle[]
): CheckinPhotoAngle[] {
  return CHECKIN_PHOTO_ANGLES.filter((angle) => a.includes(angle) && b.includes(angle));
}
