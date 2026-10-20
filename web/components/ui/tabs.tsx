"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { pillItemClass, pillTrackClass } from "./pill";

export type TabItem = { id: string; label: string; content: ReactNode };

/** Abas (role=tablist) com setas/Home/End; alvo de 44px. Visual V5 em pílula (trilho escuro,
 * aba selecionada preenchida em claro) — o mesmo do `Segmented`. */
export function Tabs({
  items,
  defaultId,
  className = "",
}: {
  items: TabItem[];
  defaultId?: string;
  className?: string;
}) {
  const base = useId();
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent, index: number) {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    setActive(items[next].id);
    refs.current[items[next].id]?.focus();
  }

  return (
    <div className={className}>
      <div role="tablist" className={pillTrackClass}>
        {items.map((item, i) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={pillItemClass(selected)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          hidden={item.id !== active}
          className="tk-enter pt-4"
        >
          {item.id === active ? item.content : null}
        </div>
      ))}
    </div>
  );
}
