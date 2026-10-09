"use client";

import { useEffect, useRef, useState } from "react";
import type { CheckinPhoto } from "@/lib/storage/checkin-photos";

const ANGLES: { angle: CheckinPhoto["angle"]; label: string }[] = [
  { angle: "front", label: "Frente" },
  { angle: "side", label: "Lado" },
  { angle: "back", label: "Costas" },
];

/** Espera antes da única nova tentativa de carregar a imagem que falhou. */
const RETRY_DELAY_MS = 800;

/**
 * As três posições (frente, lado, costas) de UMA semana, lado a lado. Peça reutilizável: a aba
 * Fotos renderiza uma por semana, a avaliação renderiza a semana atual, e a comparação visual
 * (item 14) poderá renderizar duas (atual x comparativa) sem mexer aqui. Recebe só as fotos
 * daquela semana, com as URLs assinadas já geradas no servidor (`listClientPhotos`).
 *
 * Client Component só pra tratar falha de CARREGAMENTO da imagem (rede/Storage): a URL assinada
 * existe, mas o download pode falhar; sem tratamento o quadro ficaria em branco. As URLs e a
 * lógica de Storage não mudam.
 */
export default function PhotoTriptych({
  weekNumber,
  photos,
}: {
  weekNumber: number;
  photos: CheckinPhoto[];
}) {
  const byAngle = new Map(photos.map((p) => [p.angle, p]));

  return (
    <div className="grid grid-cols-3 gap-3">
      {ANGLES.map(({ angle, label }) => {
        const photo = byAngle.get(angle);
        return (
          <figure key={angle} className="flex min-w-0 flex-col gap-1.5">
            <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-sunken">
              {photo?.url ? (
                // `key` na URL: uma URL nova (re-render do servidor) recomeça o estado de carga/erro.
                <PhotoImage key={photo.url} src={photo.url} alt={`${label} — semana ${weekNumber}`} />
              ) : (
                <Placeholder text={photo ? "Foto indisponível" : "Não enviada"} />
              )}
            </div>
            <figcaption className="text-center text-xs text-ink-faint">{label}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function Placeholder({ text, side }: { text: string; side?: "left" | "right" }) {
  // `side`: no comparador a imagem pode ficar parcialmente coberta pelo slider — o texto fica na
  // METADE do quadro que pertence àquela semana (esquerda = comparativa, direita = atual).
  const position =
    side === "left" ? "inset-y-0 left-0 w-1/2" : side === "right" ? "inset-y-0 right-0 w-1/2" : "inset-0";
  return (
    <span
      className={`absolute ${position} flex items-center justify-center px-2 text-center text-xs text-ink-faint`}
    >
      {text}
    </span>
  );
}

/**
 * Uma imagem com fallback. Falhou ao carregar: tenta UMA vez de novo (remonta o `<img>` com a mesma
 * URL, depois de uma pausa curta) e, se falhar de novo, mostra o mesmo "Foto indisponível" de
 * quando o objeto não existe mais no bucket. Também cobre o erro que aconteceu ANTES da
 * hidratação (o `onError` ainda não estava ligado): o efeito confere o `<img>` já renderizado.
 */
export function PhotoImage({ src, alt, side }: { src: string; alt: string; side?: "left" | "right" }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleError = () => {
    if (attempt === 0) {
      timer.current = setTimeout(() => setAttempt(1), RETRY_DELAY_MS);
    } else {
      setFailed(true);
    }
  };

  useEffect(() => {
    // Erro anterior à hidratação: `complete` já é true e não há pixels.
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      timer.current = setTimeout(() => (attempt === 0 ? setAttempt(1) : setFailed(true)), 0);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [attempt]);

  if (failed) return <Placeholder text="Foto indisponível" side={side} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada privada do Supabase Storage; next/image não serve pra isso.
    <img
      key={attempt}
      ref={imgRef}
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
