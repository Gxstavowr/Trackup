/**
 * Ângulos das fotos do check-in — FONTE ÚNICA (V3, tarefa 3). Módulo PURO (sem I/O, sem
 * `server-only`) pra servir também aos componentes de cliente; `lib/storage/buckets.ts`
 * reexporta tudo daqui junto com as regras de path do Storage.
 *
 *  - Check-in NOVO: quatro fotos obrigatórias — frente, lateral esquerda, lateral direita, costas.
 *  - LEGADO: `side` ("Lateral (registro anterior)") vem dos check-ins com 3 fotos. Continua válido
 *    pra LER/assinar/exportar, mas não é aceito em upload novo. Nunca é reclassificado como
 *    esquerda ou direita: é uma posição própria (não se compara com `left`/`right`).
 *
 * Banco: CHECK de `photos.angle` = ('front','left','right','back','side') — migration 0017.
 */

/** Posições pedidas em todo check-in novo, na ordem de exibição. */
export const CHECKIN_PHOTO_ANGLES = ["front", "left", "right", "back"] as const;
export type CheckinPhotoAngle = (typeof CHECKIN_PHOTO_ANGLES)[number];

/** Posições que só existem em registros antigos. */
export const LEGACY_PHOTO_ANGLES = ["side"] as const;
export type LegacyPhotoAngle = (typeof LEGACY_PHOTO_ANGLES)[number];

/** Toda posição que pode existir no banco (novas + legado), na ordem de exibição. */
export type PhotoAngle = CheckinPhotoAngle | LegacyPhotoAngle;
export const PHOTO_ANGLES: readonly PhotoAngle[] = [...CHECKIN_PHOTO_ANGLES, ...LEGACY_PHOTO_ANGLES];

/** Quantidade de fotos obrigatórias por check-in. */
export const REQUIRED_PHOTO_COUNT = CHECKIN_PHOTO_ANGLES.length;

/** Qualquer posição válida (inclui o legado) — leitura, assinatura, export. */
export function isPhotoAngle(value: unknown): value is PhotoAngle {
  return typeof value === "string" && (PHOTO_ANGLES as readonly string[]).includes(value);
}

/** Só as posições de check-in novo — upload e validação do envio. */
export function isCheckinPhotoAngle(value: unknown): value is CheckinPhotoAngle {
  return typeof value === "string" && (CHECKIN_PHOTO_ANGLES as readonly string[]).includes(value);
}

export function isLegacyPhotoAngle(value: unknown): value is LegacyPhotoAngle {
  return typeof value === "string" && (LEGACY_PHOTO_ANGLES as readonly string[]).includes(value);
}

/** Rótulo único em todo o app (formulário, comparação, progresso, coach). */
export const PHOTO_ANGLE_LABEL: Record<PhotoAngle, string> = {
  front: "Frente",
  left: "Lateral esquerda",
  right: "Lateral direita",
  back: "Costas",
  side: "Lateral (registro anterior)",
};

/** Rótulo curto pra botões/seletores estreitos. */
export const PHOTO_ANGLE_SHORT_LABEL: Record<PhotoAngle, string> = {
  front: "Frente",
  left: "Lat. esquerda",
  right: "Lat. direita",
  back: "Costas",
  side: "Lateral (antiga)",
};

/** Como a posição entra numa frase: "Sem foto de frente na semana 5". */
export const PHOTO_ANGLE_PHRASE: Record<PhotoAngle, string> = {
  front: "de frente",
  left: "da lateral esquerda",
  right: "da lateral direita",
  back: "de costas",
  side: "lateral (registro anterior)",
};

/**
 * Nome canônico do arquivo dentro da pasta do aluno: `week-{n}/{angle}.jpg`. Aceita o legado
 * `side` — fotos antigas continuam assináveis e exportáveis (LGPD).
 */
export const PHOTO_FILE_RE = new RegExp(`^week-\\d+\\/(${PHOTO_ANGLES.join("|")})\\.jpg$`);

/** Posições presentes em `angles` na ordem canônica (novas primeiro, legado no fim). */
export function sortPhotoAngles(angles: Iterable<string>): PhotoAngle[] {
  const set = new Set(angles);
  return PHOTO_ANGLES.filter((a) => set.has(a));
}

/** Posições obrigatórias que ainda faltam (ordem canônica). */
export function missingCheckinPhotoAngles(present: Iterable<string>): CheckinPhotoAngle[] {
  const set = new Set(present);
  return CHECKIN_PHOTO_ANGLES.filter((a) => !set.has(a));
}

/**
 * Posições a exibir para UMA semana (grade de fotos):
 *  - semana só com registro antigo (tem `side` e nenhuma lateral nova) -> frente, lateral
 *    (registro anterior), costas — o formato em que ela foi enviada, sem "esquerda/direita
 *    não enviada" inventadas;
 *  - qualquer outra -> as 4 posições novas, e a lateral antiga no fim se também existir.
 */
export function displayAnglesForWeek(present: Iterable<string>): PhotoAngle[] {
  const set = new Set(present);
  const legacyOnly = set.has("side") && !set.has("left") && !set.has("right");
  if (legacyOnly) return ["front", "side", "back"];
  return set.has("side") ? [...CHECKIN_PHOTO_ANGLES, "side"] : [...CHECKIN_PHOTO_ANGLES];
}

/** Classes de grade pra N fotos: 4 vira 2x2 no celular; 3 fica em linha. */
export function photoGridClass(count: number): string {
  if (count <= 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-2 sm:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
}
