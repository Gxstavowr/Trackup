/**
 * Medidas/classes compartilhadas da navegação do coach. Ficam FORA de `coach-nav.tsx` porque
 * aquele módulo é "use client": um Server Component (layout.tsx) que importasse constantes de
 * lá receberia referências de cliente, não os valores.
 */

/** Tamanho único dos ícones da navegação (sidebar, sino, abas inferiores e sheet "Mais"). */
export const NAV_ICON_SIZE = 20;

/** Item da sidebar: 44px de altura, ícone numa coluna de 20px, rótulo 14px. */
export const SIDEBAR_ITEM =
  "group relative flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";
