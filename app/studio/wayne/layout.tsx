import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { isWayneOwner } from "@/lib/server/wayne-owner";
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
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/studio/wayne");
  if (!(await isWayneOwner(user.id))) notFound();
  return children;
}
