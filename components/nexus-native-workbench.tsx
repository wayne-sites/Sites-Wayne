"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import styles from "./nexus-native-workbench.module.css";

const operations = [
  { id: "data.json.format", label: "Formatar JSON" },
  { id: "data.json.validate", label: "Validar JSON" },
  { id: "document.markdown.normalize", label: "Limpar Markdown" },
  { id: "document.markdown.inspect", label: "Analisar Markdown" },
] as const;

type SavedResult = { text: string; filename: string; artifactId: string; valid: boolean | null };

export function NexusNativeWorkbench({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const [projectId, setProjectId] = useState("");
  const [capability, setCapability] = useState<string>(operations[0].id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SavedResult | null>(null);
  const selectedProject = projects.some((p) => p.id === projectId) ? projectId : projects[0]?.id || "";

  function clearResult() { setResult(null); setError(""); }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    clearResult();
    if (file.size > 250_000) { setError("Use um arquivo de até 250 KB."); return; }
    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (content.includes("\0")) throw new Error("binary_file");
      setText(content);
    } catch { setError("Não foi possível ler o arquivo. Use texto UTF-8, JSON ou Markdown."); }
    finally { setBusy(false); }
  }

  async function execute(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedProject || !text) return;
    clearResult();
    const body = JSON.stringify({ project_id: selectedProject, capability, input: { text } });
    if (new TextEncoder().encode(text).length > 250_000 || new TextEncoder().encode(body).length > 300_000) {
      setError("O conteúdo excede o limite desta ferramenta. Reduza o arquivo."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/nexus/executions/native", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Não foi possível concluir a execução.");
        return;
      }
      if (data.artifactPersisted !== true || data.persistenceStatus !== "persisted" ||
          typeof data.execution?.artifactId !== "string" || !data.execution.artifactId ||
          data.result?.capability !== capability || !data.result?.output || typeof data.result.output !== "object") {
        setError("O servidor não confirmou o resultado salvo. Confira o projeto antes de repetir."); return;
      }
      const output = data.result.output;
      const formattedText = typeof output.text === "string" ? output.text : JSON.stringify(output, null, 2);
      const extension = capability === "document.markdown.normalize" ? "md" : "json";
      setResult({ text: formattedText, filename: `nexus-resultado.${extension}`, artifactId: data.execution.artifactId,
        valid: capability === "data.json.validate" && typeof output.valid === "boolean" ? output.valid : null });
    } catch { setError("Não foi possível confirmar a resposta. Confira o projeto antes de repetir a execução."); }
    finally { setBusy(false); }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = result.filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={styles.panel} aria-labelledby="native-workbench-title">
    <header><h2 id="native-workbench-title">Ferramentas de texto e dados</h2>
      <p>Importe ou cole seu conteúdo. O resultado é salvo no projeto e pode ser baixado. Não precisa de worker conectado.</p></header>
    {!projects.length && <p>Crie um projeto acima para salvar seus resultados.</p>}
    <form onSubmit={execute}>
      <fieldset disabled={busy || !projects.length} className={styles.fields}>
        <legend className={styles.legend}>Preparar execução</legend>
        <label>Projeto<select value={selectedProject} onChange={(e) => { setProjectId(e.target.value); clearResult(); }}>
          {!projects.length && <option value="">Nenhum projeto disponível</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Operação<select value={capability} onChange={(e) => { setCapability(e.target.value); clearResult(); }}>
          {operations.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
        </select></label>
        <label className={styles.full}>Importar arquivo (até 250 KB)
          <input type="file" accept=".json,.md,.markdown,.txt,text/plain,application/json,text/markdown" onChange={importFile} />
        </label>
        <label className={styles.full}>Conteúdo<textarea value={text} maxLength={250000} spellCheck={false}
          onChange={(e) => { setText(e.target.value); clearResult(); }} placeholder="Cole JSON ou Markdown aqui" /></label>
        <p className={styles.full}>Ao executar, o conteúdo será enviado ao Nexus e registrado no projeto selecionado.</p>
        <button type="submit" disabled={!text || !selectedProject}>{busy ? "Processando…" : "Executar e salvar"}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div aria-live="polite">
      {result && <div className={styles.result}>
        <h3>{result.valid === false ? "JSON inválido — diagnóstico salvo" : "Resultado salvo"}</h3>
        {result.valid === true && <p>JSON válido.</p>}
        <p>Artefato: <code>{result.artifactId}</code></p>
        <pre tabIndex={0}>{result.text}</pre>
        <button type="button" onClick={download}>Baixar resultado</button>
      </div>}
    </div>
  </section>;
}
