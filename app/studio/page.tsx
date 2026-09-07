import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ModuleShell } from "@/components/module-shell";
import { NexusStudioHome } from "@/components/nexus-studio-home";
import { getCurrentUser } from "@/lib/supabase/auth";
import { listNexusProjectsForUser } from "@/lib/server/nexus-core-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nexus Studio — Universal Creation Engine",
  description: "Workspace persistente para projetos e artefatos do Nexus Brasil.",
  robots: { index: false, follow: false },
};

export default async function NexusStudioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");

  let projects = [];
  let coreReady = true;
  try {
    projects = await listNexusProjectsForUser(user.id, 100);
  } catch {
    coreReady = false;
  }

  return (
    <ModuleShell
      active="/studio"
      eyebrow="NEXUS CORE • CREATOR WORKSPACE"
      title="Uma infraestrutura. Milhares de tipos de criação."
      description="PROJECT, ARTIFACT, TOOL, EXECUTION, INTEGRATION e DEPLOYMENT formam a base persistente do Universal Creation Engine."
      action={<a className="primary-button" href="/builder">ABRIR BUILDER <span>→</span></a>}
    >
      <NexusStudioHome initialProjects={projects} coreReady={coreReady} />
    </ModuleShell>
  );
}
