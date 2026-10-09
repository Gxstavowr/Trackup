import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só em `next dev`: o portal do aluno no Maestri abre o app por 127.0.0.1 (origem separada de
  // localhost, para coach e aluno ficarem logados ao mesmo tempo). Sem isso o dev server bloqueia
  // os scripts dessa origem e a página não fica interativa.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
