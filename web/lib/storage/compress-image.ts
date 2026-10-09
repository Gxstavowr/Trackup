/**
 * Compressão de imagem NO NAVEGADOR antes do upload (canvas -> JPEG). Roda só em Client
 * Components (usa `document`/`createImageBitmap`) — por isso este arquivo não tem
 * `server-only` e não importa nada do servidor.
 *
 * Lado maior ~1600px, qualidade inicial 0.82. Como a Server Action de upload tem teto de
 * 1MB de corpo (padrão do Next), se o JPEG resultante passar de `maxBytes` a qualidade
 * cai em passos e, se ainda assim não couber, a dimensão também — nunca devolve algo
 * maior que o limite (lança erro se não conseguir).
 */
export const MAX_SIDE_PX = 1600;
export const JPEG_QUALITY = 0.82;
/** Margem sob o teto de 1MB do corpo da Server Action (multipart tem overhead). */
export const MAX_UPLOAD_BYTES = 900_000;

const FALLBACK_QUALITIES = [0.7, 0.58, 0.46];

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decode(file: Blob): Promise<Decoded> {
  // `imageOrientation: "from-image"` aplica o EXIF (foto de celular em pé não sai deitada).
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImageToJpeg(
  file: Blob,
  opts: { maxSide?: number; quality?: number; maxBytes?: number } = {}
): Promise<Blob> {
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES;
  let maxSide = opts.maxSide ?? MAX_SIDE_PX;
  const startQuality = opts.quality ?? JPEG_QUALITY;
  const qualities = [startQuality, ...FALLBACK_QUALITIES.filter((q) => q < startQuality)];

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("Não foi possível ler essa imagem. Tente outra foto (JPEG ou PNG).");
  }

  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Seu navegador não suporta o processamento de imagem.");
      // Fundo branco: PNG com transparência viraria preto ao virar JPEG.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await toJpeg(canvas, quality);
        if (blob && blob.size <= maxBytes) return blob;
      }
      maxSide = Math.round(maxSide * 0.75);
    }
  } finally {
    decoded.close();
  }
  throw new Error("Não foi possível reduzir a foto o suficiente. Tente outra imagem.");
}
