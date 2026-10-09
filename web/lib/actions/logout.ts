"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Logout compartilhado pelos stubs de `/coach` e `/portal` (item 5 do TODO). Server
 * Action simples — encerra a sessão no Supabase Auth (o que limpa os cookies via o
 * `setAll` do client de servidor) e manda pro login.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
