import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleShell } from "@/components/module-shell";
import { NexusStudioHome } from "@/components/nexus-studio-home";
import { getCurrentUser } from "@/lib/supabase/auth";
import { listNexusProjectsForUser, type NexusProject } from "@/lib/server/nexus-core-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nexus Studio — Universal Creation Engine",
  description: "Workspace persistente para projetos e artefatos do Nexus Brasil.",
  robots: { index: false, follow: false },
};

export default async function NexusStudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  let projects: NexusProject[] = [];
  let coreReady = true;
  try {
    projects = await listNexusProjectsForUser(user.id, 100);
  } catch {
    coreReady = false;
  }

  const pairingEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim())
    && (process.env.NEXUS_WORKER_PAIRING_V1 === "1" || process.env.VERCEL_ENV === "preview");

  return (
    <ModuleShell
      active="/studio"
      eyebrow="NEXUS CORE • CREATOR WORKSPACE"
      title="Uma infraestrutura. Milhares de tipos de criação."
      description="PROJECT, ARTIFACT, TOOL, EXECUTION, INTEGRATION e DEPLOYMENT formam a base persistente do Universal Creation Engine."
      action={<Link className="primary-button" href="/builder">ABRIR BUILDER <span>→</span></Link>}
    >
      <NexusStudioHome initialProjects={projects} coreReady={coreReady} pairingEnabled={pairingEnabled} />
    </ModuleShell>
  );
}
