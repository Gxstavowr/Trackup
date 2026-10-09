import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para uso em Server Components / Server Actions / Route Handlers.
 * `cookies()` é assíncrono nesta versão do Next.js (App Router) — precisa de `await`.
 *
 * O `setAll` pode falhar quando chamado a partir de um Server Component (só Server
 * Actions/Route Handlers podem escrever cookies) — nesse caso o erro é ignorado porque
 * o middleware de sessão (a ser adicionado num ciclo futuro) é quem cuida de refresh de
 * sessão nesses casos.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de um Server Component — ignorado (ver comentário acima).
          }
        },
      },
    }
  );
}
