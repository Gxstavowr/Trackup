import type { Metadata } from "next";
import { connection } from "next/server";
import { Sora, Inter } from "next/font/google";
import "./globals.css";

// Sora (geométrica, larga, pesos até 800) para títulos e números; Inter para corpo e controles.
// Sem fonte mono: números usam tabular-nums.
const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trackly",
  description: "Trackly — acompanhamento de coaches e alunos.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP com nonce (proxy.ts + lib/csp.ts): o nonce só existe em renderização por request,
  // então nenhuma página pode ser pré-gerada no build — sem isso, páginas estáticas (ex.:
  // /login) sairiam sem nonce e o navegador bloquearia os scripts delas.
  await connection();
  return (
    <html
      lang="pt-BR"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
