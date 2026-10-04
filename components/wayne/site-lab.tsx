"use client";
import { useState } from "react";
import { Shell } from "./manager";
import { Button } from "./ui/button";
import type { SiteReview } from "@/lib/site-lab";
type Summary = { id: string; name: string; created_at: string; source_hash: string; engine_version: string };
type Detail = Summary & { review: SiteReview; previews: { original: string; revised: string } };
export function SiteLab({ initialRows, initialError }: { initialRows: Summary[]; initialError: string }) {
  const [rows, setRows] = useState<Summary[]>(initialRows);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [version, setVersion] = useState<"original" | "revised">("revised");
  const [file, setFile] = useState("index.html");
  const [message, setMessage] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function load(id?: string) {
    setBusy(true); setMessage("");
    if (id) setDetail(null);
    try {
      const response = await fetch("/api/nexus/wayne/site-lab" + (id ? "?id=" + encodeURIComponent(id) : ""), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Não foi possível carregar.");
      if (id) { setDetail(data.review); setFile("index.html"); }
      else setRows(data.reviews);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha na conexão."); }
    finally { setBusy(false); }
  }
  const project = detail?.review[version];
  const selected = project?.files.find(f => f.path === file) || project?.files[0];
  return <Shell active="/studio/wayne/SiteLab">
    <div className="heading"><p className="eyebrow">EXCLUSIVO DO PROPRIETÁRIO</p><h1>Laboratório de sites</h1><p>Cópias autorizadas e versões revisadas. Compare as mudanças antes de usar.</p></div>
    <div className="toolbar"><Button variant="outline" disabled={busy} onClick={() => void load()}>Atualizar</Button><a className="button outline" href="/builder">Abrir Builder</a></div>
    {message && <p role="status" className="message">{message}</p>}
    <div className="two-col">
      <section className="panel"><h2>Versões recebidas</h2>
        {!rows.length && <p>{busy ? "Carregando…" : "Nenhum site recebido. As próximas gerações autorizadas do Builder aparecerão aqui."}</p>}
        {rows.map(row => <button className="genre" disabled={busy} key={row.id} onClick={() => void load(row.id)}><div><strong>{row.name}</strong><small>{new Date(row.created_at).toLocaleString("pt-BR")} · revisão {row.engine_version}</small></div></button>)}
      </section>
      <section className="panel"><h2>Resultado da revisão</h2>
        {!detail ? <p>Selecione uma versão.</p> : <>
          <h3>{detail.name}</h3>
          <p>{detail.review.changes.length ? `${detail.review.changes.length} tipos de ajuste aplicados.` : "Nenhum ajuste automático seguro identificado. O original foi preservado."}</p>
          <ul>{detail.review.changes.map(change => <li key={change}>{change}</li>)}</ul>
          <table><thead><tr><th>Verificação</th><th>Original</th><th>Revisão</th></tr></thead><tbody>{detail.review.before.map((check, i) => <tr key={check.name}><td>{check.name}</td><td>{check.passed ? "OK" : "Revisar"}</td><td>{detail.review.after[i].passed ? "OK" : "Revisar"}</td></tr>)}</tbody></table>
          <p className="muted">Checagens de estrutura, sem medição de velocidade, conversão ou validação visual. A revisão usa regras locais e não chama outra IA.</p>
        </>}
      </section>
    </div>
    {detail && project && <section className="panel" style={{ marginTop: 24 }}>
      <div className="toolbar"><Button variant={version === "original" ? "default" : "outline"} onClick={() => setVersion("original")}>Original</Button><Button variant={version === "revised" ? "default" : "outline"} onClick={() => setVersion("revised")}>Versão revisada</Button></div>
      <p className="muted">Prévia isolada: scripts, formulários e recursos externos ficam desativados.</p>
      <iframe title="Prévia isolada do site" sandbox="" referrerPolicy="no-referrer" srcDoc={detail.previews[version]} style={{ width: "100%", height: 440, border: "1px solid #333", background: "white" }} />
      <label>Arquivo<select value={selected?.path || ""} onChange={e => setFile(e.target.value)}>{project.files.map(f => <option key={f.path}>{f.path}</option>)}</select></label>
      <div className="toolbar"><Button variant="outline" onClick={() => navigator.clipboard.writeText(selected?.content || "").then(() => setMessage("Arquivo copiado.")).catch(() => setMessage("Selecione o código para copiar."))}>Copiar arquivo</Button>
        <Button variant="outline" onClick={() => { const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `nexus-${version}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Exportar versão JSON</Button></div>
      <pre tabIndex={0} style={{ maxHeight: 400, overflow: "auto" }}><code>{selected?.content}</code></pre>
    </section>}
  </Shell>;
}
