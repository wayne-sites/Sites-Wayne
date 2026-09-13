import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-pages";
import { getFeatureStatus } from "@/lib/server/features";
import { getOAuthProviders } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Acesse sua conta do Nexus Brasil.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return <AuthPage mode="login" ready={getFeatureStatus("auth").ready} providers={getOAuthProviders()} />;
}
