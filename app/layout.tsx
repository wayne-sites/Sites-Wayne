import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/config/site";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

function resolveMetadataBase() {
  const fallback = "https://sites-wayne.vercel.app";
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  try {
    const url = new URL(configured || fallback);
    if (url.protocol !== "https:" && url.protocol !== "http:") return new URL(fallback);
    return url;
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: `${siteConfig.name} — ${siteConfig.slogan}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: ["Brasil", "inteligência artificial", "comunidades", "vídeos", "marketplace", "educação"],
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    type: "website",
    locale: "pt_BR",
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={`${geistSans.variable} ${geistMono.variable}`}><PwaRegister />{children}</body></html>;
}
