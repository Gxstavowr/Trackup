import type { Metadata } from "next";
import { connection } from "next/server";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
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
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
