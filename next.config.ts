import type { NextConfig } from "next";

if (process.env.VERCEL_ENV === "preview") {
  console.info("[nexus-ai-env-check]", {
    vercelEnv: process.env.VERCEL_ENV,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF || null,
    hasGroqApiKey: Boolean(process.env.GROQ_API_KEY?.trim()),
    hasClientKey: Boolean(process.env.CLIENT_KEY?.trim()),
    hasLegacyAiApiKey: Boolean(process.env.AI_API_KEY?.trim()),
  });
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.mercadopago.com https://*.supabase.co",
    "frame-src 'self' https://www.youtube-nocookie.com",
    "upgrade-insecure-requests",
  ].join("; ") },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
