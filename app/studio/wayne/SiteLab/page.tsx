import { SiteLab } from "@/components/wayne/site-lab";
import { listSiteReviews } from "@/lib/server/site-lab-store";
import { getCurrentUser } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/studio/wayne/SiteLab");
  let rows: Awaited<ReturnType<typeof listSiteReviews>> = [], error = "";
  try { rows = await listSiteReviews(user.id); }
  catch { error = "O laboratório está indisponível ou sua conta não tem acesso."; }
  return <SiteLab initialRows={rows} initialError={error} />;
}
