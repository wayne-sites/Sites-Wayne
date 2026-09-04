import { AuthPage } from "@/components/auth-pages";
import { getAuthCaptchaConfig, getFeatureStatus } from "@/lib/server/features";

export default function SignUpPage() {
  return <AuthPage mode="signup" ready={getFeatureStatus("auth").ready} captchaSiteKey={getAuthCaptchaConfig().siteKey} />;
}
