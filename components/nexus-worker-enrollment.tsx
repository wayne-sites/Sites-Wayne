"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./nexus-worker-enrollment.module.css";

type Platform = "windows" | "linux" | "macos";

type EnrollmentResponse = {
  worker?: {
    id: string;
    workspaceId: string;
    name: string;
    platform: Platform;
    status: "offline";
  };
  credential?: {
    token: string;
    displayOnce: true;
  };
  error?: string;
};

export function NexusWorkerEnrollment() {
  const [name, setName] = useState("Meu Nexus Worker");
  const [platform, setPlatform] = useState<Platform>("windows");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState<"token" | "command" | "">("");

  const baseUrl = typeof window === "undefined" ? "https://seu-nexus.vercel.app" : window.location.origin;

  const command = useMemo(() => {
    if (!token) return "";
    if (platform === "windows") {
      return `$env:NEXUS_BASE_URL=\"${baseUrl}\"\n$env:NEXUS_WORKER_TOKEN=\"${token}\"\nnode .\\workers\\nexus-worker\\index.mjs`;
    }
    return `NEXUS_BASE_URL='${baseUrl}' NEXUS_WORKER_TOKEN='${token}' node workers/nexus-worker/index.mjs`;
  }, [baseUrl, platform, token]);

  async function enroll(event: FormEvent) {
    event.preventDefault();
    if (loading || name.trim().length < 2) return;
    setLoading(true);
    setError("");
    setToken("");
    setWorkerId("");
    setCopied("");
    try {
      const response = await fetch("/api/nexus/workers/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), platform }),
      });
      const data = await response.json() as EnrollmentResponse;
      if (!response.ok || !data.worker || !data.credential?.token) {
        setError(data.error || "Não foi possível registrar o worker.");
        return;
      }
      setWorkerId(data.worker.id);
      setToken(data.credential.token);
    } catch {
      setError("Não foi possível conectar ao Worker Enrollment.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, type: "token" | "command") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <span>WORKER NETWORK</span>
          <h2>Conectar este computador ao Nexus</h2>
          <p>O runtime atual executa somente JSON e Markdown allowlisted. Shell, Python arbitrário, Docker e browser automation permanecem bloqueados.</p>
        </div>
        <strong>ZERO COST • SAFE RUNTIME</strong>
      </div>

      <form className={styles.form} onSubmit={enroll}>
        <label>
          <span>Nome do worker</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </label>
        <label>
          <span>Sistema</span>
          <select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>
            <option value="windows">Windows</option>
            <option value="linux">Linux</option>
            <option value="macos">macOS</option>
          </select>
        </label>
        <button type="submit" disabled={loading || name.trim().length < 2}>{loading ? "REGISTRANDO..." : "GERAR CREDENCIAL"}</button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {token && (
        <div className={styles.credential}>
          <div className={styles.warning}>
            <strong>Mostrado uma única vez</strong>
            <span>O servidor guarda somente o SHA-256 desta credencial. Copie agora e não envie o token em chats, issues ou commits.</span>
          </div>

          <div className={styles.secretRow}>
            <code>{token}</code>
            <button type="button" onClick={() => copy(token, "token")}>{copied === "token" ? "COPIADO" : "COPIAR TOKEN"}</button>
          </div>

          <div className={styles.commandBlock}>
            <div><span>Worker ID</span><code>{workerId}</code></div>
            <p>Com o repositório `Sites-Wayne` disponível neste computador e Node.js 22+, execute:</p>
            <pre>{command}</pre>
            <button type="button" onClick={() => copy(command, "command")}>{copied === "command" ? "COMANDO COPIADO" : "COPIAR COMANDO"}</button>
          </div>

          <div className={styles.flow}>
            <span>HEARTBEAT</span><b>→</b><span>CLAIM LEASE</span><b>→</b><span>ALLOWLIST</span><b>→</b><span>RESULT</span><b>→</b><span>AUDIT</span>
          </div>
        </div>
      )}
    </section>
  );
}
