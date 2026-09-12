import type { Metadata } from "next";
import { AuthPage } from "@/components/auth-pages";
import { getFeatureStatus } from "@/lib/server/features";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta no Nexus Brasil.",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return <AuthPage mode="signup" ready={getFeatureStatus("auth").ready} />;
}
