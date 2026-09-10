"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./nexus-worker-presence.module.css";

type WorkerStatus = "offline" | "online" | "disabled" | "error";
type WorkerPlatform = "windows" | "linux" | "macos" | "docker" | "vm" | "other";

type WorkerPresence = {
  id: string;
  name: string;
  platform: WorkerPlatform;
  status: WorkerStatus;
  lastSeenAt: string | null;
  secondsSinceSeen: number | null;
  tools: string[];
  capabilities: string[];
  createdAt: string;
};

type WorkersResponse = { workers?: WorkerPresence[]; error?: string };

function statusLabel(status: WorkerStatus) {
  if (status === "online") return "ONLINE AGORA";
  if (status === "disabled") return "DESATIVADO";
  if (status === "error") return "ERRO";
  return "OFFLINE";
}

function heartbeatLabel(worker: WorkerPresence) {
  if (!worker.lastSeenAt || worker.secondsSinceSeen === null) return "heartbeat nunca recebido";
  const seconds = worker.secondsSinceSeen;
  if (seconds < 60) return `heartbeat há ${seconds}s`;
  if (seconds < 3600) return `heartbeat há ${Math.floor(seconds / 60)}min`;
  if (seconds < 86_400) return `heartbeat há ${Math.floor(seconds / 3600)}h`;
  return `heartbeat em ${new Date(worker.lastSeenAt).toLocaleString()}`;
}

export function NexusWorkerPresence() {
  const [workers, setWorkers] = useState<WorkerPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/nexus/workers", { method: "GET", cache: "no-store" });
      const data = await response.json() as WorkersResponse;
      if (!response.ok || !Array.isArray(data.workers)) {
        setError(data.error || "Não foi possível consultar os workers.");
        return;
      }
      setWorkers(data.workers);
      setError("");
    } catch {
      setError("Não foi possível atualizar a presença dos workers.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const online = workers.filter((worker) => worker.status === "online").length;

  return (
    <section className={styles.panel} aria-live="polite">
      <div className={styles.header}>
        <div>
          <span>WORKER PRESENCE</span>
          <h2>Nós conectados</h2>
          <p>ONLINE exige heartbeat com no máximo 2 minutos. O status é recalculado em cada leitura, sem depender do cron diário.</p>
        </div>
        <div className={styles.summary}>
          <strong>{online}</strong>
          <span>online / {workers.length} registrados</span>
          <button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "ATUALIZANDO..." : "ATUALIZAR"}</button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {!error && loading && workers.length === 0 && (
        <div className={styles.empty}>Consultando presença dos workers...</div>
      )}

      {!loading && !error && workers.length === 0 && (
        <div className={styles.empty}>Nenhum worker registrado neste workspace.</div>
      )}

      {workers.length > 0 && (
        <div className={styles.grid}>
          {workers.map((worker) => (
            <article key={worker.id} className={styles.worker}>
              <div className={styles.workerTop}>
                <div>
                  <span className={styles.platform}>{worker.platform.toUpperCase()}</span>
                  <h3>{worker.name}</h3>
                </div>
                <span className={styles.status} data-status={worker.status}>{statusLabel(worker.status)}</span>
              </div>
              <p>{heartbeatLabel(worker)}</p>
              <div className={styles.meta}>
                <span>{worker.tools.length ? worker.tools.join(" • ") : "sem tools anunciadas"}</span>
                <span>{worker.capabilities.length} capabilities</span>
              </div>
              <code>{worker.id.slice(0, 8)}</code>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
