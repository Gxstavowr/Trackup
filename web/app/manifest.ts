import type { MetadataRoute } from "next";

/**
 * Web App Manifest (item TODO — PWA do portal do aluno). Convenção nativa do App Router:
 * este arquivo só pode viver na raiz de `app/` (Next.js serve automaticamente em
 * `/manifest.webmanifest` e injeta o `<link rel="manifest">` em toda a árvore de páginas),
 * mas `start_url`/`scope` abaixo restringem a instalabilidade ao portal do aluno — é essa a
 * fatia pedida, não o app inteiro (a área /coach não tem PWA e não deve virar um "app"
 * instalável separado por enquanto).
 *
 * Cores replicadas dos tokens reais de app/globals.css (tema dark premium): --paper (fundo)
 * e --brand (accent champagne) — não são valores inventados.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trackly — Portal do Aluno",
    short_name: "Trackly",
    description:
      "Acompanhamento contínuo com seu coach — check-ins, treino, nutrição e evolução.",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    orientation: "portrait-primary",
    lang: "pt-BR",
    dir: "ltr",
    background_color: "#0a0a09",
    theme_color: "#0a0a09",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
