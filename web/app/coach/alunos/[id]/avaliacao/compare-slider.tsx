"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { PhotoImage } from "../photo-triptych";

/** O que ocupa um lado do quadro. Nunca carrega foto de outra semana: cada lado é de UMA semana. */
export type SideView =
  | { kind: "photo"; url: string; alt: string }
  | { kind: "loading"; text: string }
  | { kind: "message"; text: string };

export type SideProps = {
  weekNumber: number;
  /** "Semana 5 · 13/09" — o mesmo rótulo das legendas e da tabela de métricas. */
  label: string;
  view: SideView;
};

const KEY_STEP = 5;
const KEY_STEP_LARGE = 10;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Quadro de comparação: a foto da semana ATUAL (direita) fica embaixo e a da semana COMPARATIVA
 * (esquerda) é revelada por cima, da esquerda pra direita, até a posição do slider. Arrastar com
 * o ponteiro (mouse/toque) ou usar o teclado no controle (setas, PageUp/PageDown, Home/End).
 *
 * Cada lado se rotula sozinho: o chip de "Semana X" da esquerda mora DENTRO da camada recortada da
 * esquerda e o da direita dentro da camada da direita, então um rótulo nunca cai sobre a foto da
 * outra semana. Lado sem foto mostra um aviso na própria metade (sem trocar por outra semana).
 */
export default function CompareSlider({
  left,
  right,
  ariaLabel,
}: {
  left: SideProps;
  right: SideProps;
  ariaLabel: string;
}) {
  const [pos, setPos] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const moveTo = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPos(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleRef.current?.focus({ preventScroll: true });
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = pos - KEY_STEP;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = pos + KEY_STEP;
        break;
      case "PageDown":
        next = pos - KEY_STEP_LARGE;
        break;
      case "PageUp":
        next = pos + KEY_STEP_LARGE;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
    }
    if (next === null) return;
    e.preventDefault();
    setPos(clamp(next));
  };

  const rounded = Math.round(pos);

  return (
    <div
      ref={frameRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative mx-auto aspect-[3/4] w-full max-w-md touch-pan-y select-none overflow-hidden rounded-md border border-line bg-surface-sunken"
    >
      {/* Camada de baixo: semana atual (direita). */}
      <div className="absolute inset-0" data-compare-side="right" data-week={right.weekNumber}>
        <SideLayer side="right" view={right.view} />
        <Chip className="right-2">{right.label}</Chip>
      </div>

      {/* Camada de cima: semana comparativa (esquerda), revelada até a posição do slider. */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        data-compare-side="left"
        data-week={left.weekNumber}
      >
        <div className="absolute inset-0 bg-surface" />
        <SideLayer side="left" view={left.view} />
        <Chip className="left-2">{left.label}</Chip>
      </div>

      {/* Controle: faixa de 44 px de largura (alvo de toque) com a linha e a alça. */}
      <div
        ref={handleRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${left.label} visível em ${rounded}% do quadro; ${right.label} no resto`}
        onKeyDown={onKeyDown}
        style={{ left: `${pos}%` }}
        className="group absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center outline-none"
      >
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-brand shadow-[0_0_0_1px_rgba(0,0,0,0.45)]" />
        <span
          aria-hidden
          className="relative flex size-11 items-center justify-center rounded-full border border-brand bg-paper text-brand shadow-lg group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-brand"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l-6 6 6 6M15 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

function Chip({ children, className }: { children: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-2 z-[1] whitespace-nowrap rounded-full bg-paper/80 px-2 py-1 text-xs font-medium text-ink ${className}`}
    >
      {children}
    </span>
  );
}

function SideLayer({ side, view }: { side: "left" | "right"; view: SideView }) {
  if (view.kind === "photo") {
    // `key` na URL: URL nova (foto renovada) recomeça o estado de carga/erro da imagem.
    return <PhotoImage key={view.url} src={view.url} alt={view.alt} side={side} />;
  }
  const position = side === "left" ? "left-0" : "right-0";
  return (
    <span
      className={`absolute inset-y-0 ${position} flex w-1/2 items-center justify-center px-3 text-center text-sm text-ink-muted ${
        view.kind === "loading" ? "motion-safe:animate-pulse" : ""
      }`}
    >
      {view.text}
    </span>
  );
}
