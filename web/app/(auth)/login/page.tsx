import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUserId } from "@/lib/admin/auth";
import LoginForm from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // Proprietário já logado que abre /login vai direto ao painel (checagem no servidor).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (isAdminUserId(user?.id)) redirect("/admin");
  return <LoginForm next={typeof next === "string" ? next : ""} />;
}
