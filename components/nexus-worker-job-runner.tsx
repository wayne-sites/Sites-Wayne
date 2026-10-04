"use client";

import { useMemo, useState } from "react";
import styles from "./nexus-worker-job-runner.module.css";

type Project = {
  id: string;
  name: string;
};

type JobStatus = {
  id: string;
  project_id: string;
  tool_id: string | null;
  capability: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  output: Record<string, unknown> | null;
  error: string | null;
  claim_attempts: number;
  tool_run_id: string | null;
  artifact_id: string | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type JobListResponse = { jobs?: JobStatus[]; error?: string };
type JobCreateResponse = { job?: { job_id: string }; error?: string };

const capabilities = [
  { id: "data.json.validate", label: "Validar JSON", defaultText: "{\"nexus\":\"studio-online\"}" },
  { id: "data.json.format", label: "Formatar JSON", defaultText: "{\"nexus\":\"studio-online\",\"worker\":true}" },
  { id: "document.markdown.normalize", label: "Normalizar Markdown", defaultText: "# Nexus\n\nWorker físico online.   " },
  { id: "document.markdown.inspect", label: "Inspecionar Markdown", defaultText: "# Nexus\n\n[Studio](https://example.com)" },
] as const;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function NexusWorkerJobRunner({ projects }: { projects: Project[] }) {
  const preferredProject = useMemo(
    () => projects.find((project) => project.name === "Nexus Universal Tool Network") || projects[0] || null,
    [projects],
  );
  const [projectId, setProjectId] = useState(preferredProject?.id || "");
  const [capability, setCapability] = useState<(typeof capabilities)[number]["id"]>("data.json.validate");
  const [text, setText] = useState<string>(capabilities[0].defaultText);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<JobStatus | null>(null);

  function changeCapability(value: (typeof capabilities)[number]["id"]) {
    setCapability(value);
    const selected = capabilities.find((item) => item.id === value);
    if (selected) setText(selected.defaultText);
    setJob(null);
    setError("");
  }

  async function loadJob(jobId: string) {
    const response = await fetch("/api/nexus/jobs", { cache: "no-store" });
    const data = await response.json() as JobListResponse;
    if (!response.ok) throw new Error(data.error || "Não foi possível consultar o job.");
    return data.jobs?.find((item) => item.id === jobId) || null;
  }

  async function run() {
    if (!projectId || running || !text.trim()) return;
    setRunning(true);
    setError("");
    setJob(null);
    try {
      const response = await fetch("/api/nexus/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          capability,
          input: capability === "data.json.format" ? { text, spaces: 2 } : { text },
          zeroCostMode: true,
        }),
      });
      const data = await response.json() as JobCreateResponse;
      if (!response.ok || !data.job?.job_id) throw new Error(data.error || "Não foi possível enfileirar o job.");

      const jobId = data.job.job_id;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const current = await loadJob(jobId);
        if (current) setJob(current);
        if (current?.status === "succeeded" || current?.status === "failed" || current?.status === "cancelled") break;
        await wait(1000);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao executar job.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span>PHYSICAL WORKER E2E</span>
          <h2>Executar no Worker conectado</h2>
          <p>Cria um job autenticado no Studio, aguarda o Worker físico, e mostra resultado, Tool Run e Artifact.</p>
        </div>
        <strong>ZERO COST • ALLOWLIST</strong>
      </div>

      {!projects.length ? (
        <div className={styles.error}>Crie um projeto Nexus antes de executar um job.</div>
      ) : (
        <div className={styles.form}>
          <label>
            <span>Projeto</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label>
            <span>Capability</span>
            <select value={capability} onChange={(event) => changeCapability(event.target.value as (typeof capabilities)[number]["id"])}>
              {capabilities.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.id}</option>)}
            </select>
          </label>
          <label className={styles.full}>
            <span>Entrada</span>
            <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={200000} />
          </label>
          <button type="button" onClick={run} disabled={running || !projectId || !text.trim()}>
            {running ? "EXECUTANDO..." : "EXECUTAR NO WORKER"}
          </button>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      {job && (
        <div className={styles.result}>
          <div className={styles.statusRow}>
            <span>JOB</span>
            <strong data-status={job.status}>{job.status.toUpperCase()}</strong>
          </div>
          <div className={styles.meta}>
            <div><span>Tool</span><code>{job.tool_id || "—"}</code></div>
            <div><span>Capability</span><code>{job.capability}</code></div>
            <div><span>Tentativas</span><code>{job.claim_attempts}</code></div>
            <div><span>Tool Run</span><code>{job.tool_run_id || "pendente"}</code></div>
            <div><span>Artifact</span><code>{job.artifact_id || "pendente"}</code></div>
          </div>
          {job.output && <pre>{JSON.stringify(job.output, null, 2)}</pre>}
          {job.error && <div className={styles.error}>{job.error}</div>}
        </div>
      )}
    </section>
  );
}
