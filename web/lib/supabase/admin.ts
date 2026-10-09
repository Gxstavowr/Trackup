import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a service role key — bypassa RLS completamente.
 *
 * Uso restrito a pontos específicos de bootstrap onde ainda não existe uma sessão
 * autenticada que satisfaça as policies normais (ex.: criar `accounts`/`coach_users` no
 * cadastro do coach, já que não há policy de INSERT para usuários comuns nessas tabelas;
 * ler o preview de um convite antes do aluno ter sessão; ativar `clients.auth_user_id` no
 * callback de auth, porque não existe policy de UPDATE para o próprio aluno em `clients`).
 *
 * NUNCA importar este arquivo de um Client Component ou de qualquer código que rode no
 * navegador — a `server-only` import acima quebra o build se isso acontecer por engano.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
