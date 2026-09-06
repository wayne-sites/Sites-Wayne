import { AuthPage } from "@/components/auth-pages";
import { safeNextPath } from "@/lib/auth-security";
import { getAuthCaptchaConfig, getFeatureStatus } from "@/lib/server/features";
import { getOAuthProviders } from "@/lib/supabase/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return <AuthPage mode="login" ready={getFeatureStatus("auth").ready} providers={getOAuthProviders()} nextPath={safeNextPath(params.next)} captchaSiteKey={getAuthCaptchaConfig().siteKey} />;
}
