import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/auth";
import "./wayne.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "WAYNE Manager — Nexus Studio",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getCurrentUser())) redirect("/entrar?next=/studio/wayne");
  return children;
}
