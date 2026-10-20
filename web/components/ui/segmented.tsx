"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "./icon";
import { pillItemClass, pillTrackClass } from "./pill";

export { pillItemClass, pillTrackClass };

export type SegmentedItem = {
  id: string;
  label: ReactNode;
  icon?: IconName;
  /** Com `href`, o item é um link (filtro por URL, ex.: `?status=pendente`); sem, é um botão. */
  href?: string;
  /** Contador opcional ao lado do rótulo (ex.: quantidade no filtro). Só exibido se > 0. */
  count?: number;
  /** Item indisponível (ex.: sem dados): não navega nem dispara `onChange`. */
  disabled?: boolean;
};

/**
 * Controle segmentado / abas em pílula. Dois modos:
 *  - Links: todos os itens com `href` — o selecionado ganha `aria-current="page"`. Funciona
 *    a partir de Server Components (props serializáveis), sem estado no cliente.
 *  - Botões: passe `onChange` — cada item é `aria-pressed`, dentro de `role="group"`.
 * Para conteúdo em painéis (tablist completo com setas), use `Tabs`, que já usa este visual.
 *
 * @example <Segmented label="Período" value={period} items={[{id:"mes",label:"Mês",href:"?p=mes"}]} />
 */
export function Segmented({
  items,
  value,
  onChange,
  label,
  size = "md",
  className = "",
}: {
  items: SegmentedItem[];
  /** `id` do item selecionado. */
  value: string;
  onChange?: (id: string) => void;
  /** Nome acessível do grupo (ex.: "Período", "Situação do pagamento"). */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const content = (item: SegmentedItem, selected: boolean) => (
    <>
      {item.icon && <Icon name={item.icon} size={size === "sm" ? 16 : 18} />}
      <span>{item.label}</span>
      {item.count !== undefined && item.count > 0 && (
        <span
          className={`rounded-full px-1.5 text-xs leading-5 tabular-nums ${
            selected ? "bg-on-pill-active/10" : "bg-surface-raised text-ink-muted"
          }`}
        >
          {item.count}
        </span>
      )}
    </>
  );

  return (
    <div role="group" aria-label={label} className={`${pillTrackClass} ${className}`}>
      {items.map((item) => {
        const selected = item.id === value;
        if (item.href !== undefined && !onChange) {
          if (item.disabled) {
            return (
              <span key={item.id} aria-disabled="true" className={pillItemClass(selected, size)}>
                {content(item, selected)}
              </span>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={selected ? "page" : undefined}
              className={pillItemClass(selected, size)}
              scroll={false}
            >
              {content(item, selected)}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected}
            disabled={item.disabled}
            onClick={() => onChange?.(item.id)}
            className={pillItemClass(selected, size)}
          >
            {content(item, selected)}
          </button>
        );
      })}
    </div>
  );
}
