export const NEXUS_WORKER_PROTOCOL_VERSION = "1";
export const NEXUS_WORKER_PLATFORMS = ["windows", "linux", "macos", "docker", "vm", "other"] as const;

export type NexusWorkerPlatform = (typeof NEXUS_WORKER_PLATFORMS)[number];

export type NexusWorkerResources = {
  cpuCores: number;
  ramMb: number;
  gpu: boolean;
  gpuName: string | null;
};

export type NexusWorkerAnnouncement = {
  protocolVersion: string;
  name: string;
  platform: NexusWorkerPlatform;
  tools: string[];
  capabilities: string[];
  resources: NexusWorkerResources;
};

export type NexusWorkerSnapshot = NexusWorkerAnnouncement & {
  id: string;
  status: "online" | "offline" | "disabled" | "error";
  lastSeenAt: string | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanToken(value: unknown, max = 120) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase();
  if (!cleaned || cleaned.length > max || !/^[a-z0-9][a-z0-9._-]*$/.test(cleaned)) return null;
  return cleaned;
}

function cleanList(value: unknown, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const cleaned = cleanToken(item);
    if (!cleaned) return null;
    result.push(cleaned);
  }
  return [...new Set(result)];
}

export function parseNexusWorkerAnnouncement(value: unknown):
  | { ok: true; data: NexusWorkerAnnouncement }
  | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: "worker_invalid" };
  if (value.protocolVersion !== NEXUS_WORKER_PROTOCOL_VERSION) return { ok: false, error: "worker_protocol_unsupported" };

  if (typeof value.name !== "string") return { ok: false, error: "worker_name_invalid" };
  const name = value.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return { ok: false, error: "worker_name_invalid" };

  if (typeof value.platform !== "string" || !(NEXUS_WORKER_PLATFORMS as readonly string[]).includes(value.platform)) {
    return { ok: false, error: "worker_platform_invalid" };
  }

  const tools = cleanList(value.tools, 256);
  const capabilities = cleanList(value.capabilities, 512);
  if (!tools || !capabilities) return { ok: false, error: "worker_capabilities_invalid" };

  if (!isPlainObject(value.resources)) return { ok: false, error: "worker_resources_invalid" };
  const cpuCores = value.resources.cpuCores;
  const ramMb = value.resources.ramMb;
  const gpu = value.resources.gpu;
  const gpuNameRaw = value.resources.gpuName;
  if (!Number.isInteger(cpuCores) || Number(cpuCores) < 1 || Number(cpuCores) > 1024) return { ok: false, error: "worker_cpu_invalid" };
  if (!Number.isInteger(ramMb) || Number(ramMb) < 128 || Number(ramMb) > 16_777_216) return { ok: false, error: "worker_ram_invalid" };
  if (typeof gpu !== "boolean") return { ok: false, error: "worker_gpu_invalid" };
  if (gpuNameRaw !== null && gpuNameRaw !== undefined && (typeof gpuNameRaw !== "string" || gpuNameRaw.trim().length > 160)) {
    return { ok: false, error: "worker_gpu_name_invalid" };
  }

  return {
    ok: true,
    data: {
      protocolVersion: NEXUS_WORKER_PROTOCOL_VERSION,
      name,
      platform: value.platform as NexusWorkerPlatform,
      tools,
      capabilities,
      resources: {
        cpuCores: Number(cpuCores),
        ramMb: Number(ramMb),
        gpu,
        gpuName: typeof gpuNameRaw === "string" && gpuNameRaw.trim() ? gpuNameRaw.trim() : null,
      },
    },
  };
}

export function selectNexusWorker(
  workers: NexusWorkerSnapshot[],
  request: { capability: string; toolId: string; gpuRequired?: boolean; minRamMb?: number },
  referenceAt = new Date(),
) {
  const capability = cleanToken(request.capability);
  const toolId = cleanToken(request.toolId, 80);
  if (!capability || !toolId) return null;
  const minRamMb = Math.max(0, Math.min(request.minRamMb || 0, 16_777_216));
  const freshnessCutoff = referenceAt.getTime() - 2 * 60 * 1000;

  const eligible = workers.filter((worker) => {
    if (worker.status !== "online" || !worker.lastSeenAt) return false;
    const lastSeen = new Date(worker.lastSeenAt).getTime();
    if (!Number.isFinite(lastSeen) || lastSeen < freshnessCutoff) return false;
    if (!worker.tools.includes(toolId) || !worker.capabilities.includes(capability)) return false;
    if (request.gpuRequired && !worker.resources.gpu) return false;
    if (worker.resources.ramMb < minRamMb) return false;
    return true;
  });

  eligible.sort((left, right) => {
    if (!request.gpuRequired && left.resources.gpu !== right.resources.gpu) return left.resources.gpu ? 1 : -1;
    if (left.resources.ramMb !== right.resources.ramMb) return right.resources.ramMb - left.resources.ramMb;
    return right.resources.cpuCores - left.resources.cpuCores;
  });

  return eligible[0] || null;
}
