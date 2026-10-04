"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./nexus-worker-enrollment.module.css";

type Platform = "windows" | "linux" | "macos";
type SecretKind = "token" | "pairing" | "";

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

type PairingResponse = {
  pairing?: {
    id: string;
    code: string;
    displayOnce: true;
    expiresAt: string;
  };
  error?: string;
};

const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") || "";
const workerGatewayUrl = publicSupabaseUrl ? `${publicSupabaseUrl}/functions/v1/nexus-worker-gateway` : "";

export function NexusWorkerEnrollment({ pairingEnabled }: { pairingEnabled: boolean }) {
  const pairingAvailable = pairingEnabled && Boolean(workerGatewayUrl);
  const [name, setName] = useState("Meu Nexus Worker");
  const [platform, setPlatform] = useState<Platform>("windows");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [secret, setSecret] = useState("");
  const [secretKind, setSecretKind] = useState<SecretKind>("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState<"secret" | "command" | "">("");

  const baseUrl = typeof window === "undefined" ? "https://seu-nexus.vercel.app" : window.location.origin;

  const command = useMemo(() => {
    if (!secret) return "";
    const transport = workerGatewayUrl || baseUrl;

    if (platform === "windows") {
      return `& .\\install.ps1 -GatewayUrl \"${transport}\" -Start`;
    }
    return `bash ./install.sh --gateway '${transport}' --start`;
  }, [baseUrl, platform, secret]);

  async function enroll(event: FormEvent) {
    event.preventDefault();
    if (loading || name.trim().length < 2) return;
    setLoading(true);
    setError("");
    setSecret("");
    setSecretKind("");
    setReferenceId("");
    setExpiresAt("");
    setCopied("");

    try {
      if (pairingAvailable) {
        const response = await fetch("/api/nexus/workers/pairings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), platform }),
        });
        const data = await response.json() as PairingResponse;
        if (!response.ok || !data.pairing?.code) {
          setError(data.error || "Não foi possível criar o pareamento.");
          return;
        }
        setReferenceId(data.pairing.id);
        setSecret(data.pairing.code);
        setSecretKind("pairing");
        setExpiresAt(data.pairing.expiresAt);
        return;
      }

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
      setReferenceId(data.worker.id);
      setSecret(data.credential.token);
      setSecretKind("token");
    } catch {
      setError("Não foi possível conectar ao Worker Enrollment.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(value: string, type: "secret" | "command") {
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
        <button type="submit" disabled={loading || name.trim().length < 2}>
          {loading ? "REGISTRANDO..." : pairingAvailable ? "GERAR CÓDIGO DE PAREAMENTO" : "GERAR CREDENCIAL"}
        </button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {secret && (
        <div className={styles.credential}>
          <div className={styles.warning}>
            <strong>{secretKind === "pairing" ? "Código temporário • uso único" : "Mostrado uma única vez"}</strong>
            <span>
              {secretKind === "pairing"
                ? `O banco guarda somente o SHA-256 deste código. Ele expira em até 10 minutos${expiresAt ? ` (${new Date(expiresAt).toLocaleTimeString()})` : ""} e é invalidado após a primeira troca.`
                : "O servidor guarda somente o SHA-256 desta credencial. Copie agora e não envie o token em chats, issues ou commits."}
            </span>
          </div>

          <div className={styles.secretRow}>
            <code>{secret}</code>
            <button type="button" onClick={() => copy(secret, "secret")}>{copied === "secret" ? "COPIADO" : secretKind === "pairing" ? "COPIAR CÓDIGO" : "COPIAR TOKEN"}</button>
          </div>

          <div className={styles.commandBlock}>
            <div><span>{secretKind === "pairing" ? "Pairing ID" : "Worker ID"}</span><code>{referenceId}</code></div>
            <p>
              Extraia o pacote verificado do Nexus Worker, abra o terminal nessa pasta e execute o instalador abaixo. Ele verifica a integridade, salva somente o endpoint do gateway e pede {secretKind === "pairing" ? "o código temporário" : "o token"} sem incluí-lo no histórico.
            </p>
            <pre>{command}</pre>
            <button type="button" onClick={() => copy(command, "command")}>{copied === "command" ? "INSTALAÇÃO COPIADA" : "COPIAR INSTALAÇÃO"}</button>
          </div>

          <div className={styles.flow}>
            <span>VERIFY</span><b>→</b><span>INSTALL</span><b>→</b>{secretKind === "pairing" && <><span>PAIR</span><b>→</b></>}<span>DOCTOR</span><b>→</b><span>HEARTBEAT</span><b>→</b><span>CLAIM</span><b>→</b><span>RESULT</span><b>→</b><span>AUDIT</span>
          </div>
        </div>
      )}
    </section>
  );
}
