export type NexusWorkerJobRequest = {
  projectId: string;
  capability: string;
  input: Record<string, unknown>;
  zeroCostMode: true;
};

export type NexusWorkerJobCompletion = {
  jobId: string;
  leaseId: string;
  status: "succeeded" | "failed";
  output: Record<string, unknown> | null;
  error: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+){1,7}$/;
const MAX_INPUT_BYTES = 250_000;
const MAX_OUTPUT_BYTES = 500_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonBytes(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function parseNexusWorkerJobRequest(value: unknown):
  | { ok: true; data: NexusWorkerJobRequest }
  | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: "job_invalid" };

  const projectId = typeof value.projectId === "string" ? value.projectId.trim() : "";
  if (!UUID_PATTERN.test(projectId)) return { ok: false, error: "job_project_invalid" };

  const capability = typeof value.capability === "string" ? value.capability.trim().toLowerCase() : "";
  if (!CAPABILITY_PATTERN.test(capability) || capability.length > 120) {
    return { ok: false, error: "job_capability_invalid" };
  }

  if (!isPlainObject(value.input) || jsonBytes(value.input) > MAX_INPUT_BYTES) {
    return { ok: false, error: "job_input_invalid" };
  }

  if (value.zeroCostMode === false) return { ok: false, error: "paid_execution_disabled" };
  if (value.zeroCostMode !== undefined && value.zeroCostMode !== true) {
    return { ok: false, error: "job_zero_cost_invalid" };
  }

  return {
    ok: true,
    data: { projectId, capability, input: value.input, zeroCostMode: true },
  };
}

export function parseNexusWorkerJobCompletion(value: unknown):
  | { ok: true; data: NexusWorkerJobCompletion }
  | { ok: false; error: string } {
  if (!isPlainObject(value)) return { ok: false, error: "job_completion_invalid" };

  const jobId = typeof value.jobId === "string" ? value.jobId.trim() : "";
  const leaseId = typeof value.leaseId === "string" ? value.leaseId.trim() : "";
  if (!UUID_PATTERN.test(jobId)) return { ok: false, error: "job_id_invalid" };
  if (!UUID_PATTERN.test(leaseId)) return { ok: false, error: "job_lease_invalid" };

  if (value.status !== "succeeded" && value.status !== "failed") {
    return { ok: false, error: "job_finish_status_invalid" };
  }

  const output = value.output === undefined || value.output === null ? null : value.output;
  if (output !== null && (!isPlainObject(output) || jsonBytes(output) > MAX_OUTPUT_BYTES)) {
    return { ok: false, error: "job_output_invalid" };
  }

  const error = typeof value.error === "string" ? value.error.trim() : null;
  if (error && error.length > 5000) return { ok: false, error: "job_error_too_large" };
  if (value.status === "failed" && !error) return { ok: false, error: "job_error_required" };

  return {
    ok: true,
    data: {
      jobId,
      leaseId,
      status: value.status,
      output,
      error: value.status === "failed" ? error : null,
    },
  };
}
