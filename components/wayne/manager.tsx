"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import bundles from "@/lib/wayne/bundles.json";
import tools from "@/lib/wayne/arsenal.json";
import {
  genres,
  type Genre,
  type State,
  type Game,
  type SourceFile,
  type VaultEntry,
} from "@/lib/wayne/types";
import { configLua } from "@/lib/wayne/configs";
import { loadManager, action, runtimeMode } from "@/lib/wayne/client";
import { prompts } from "@/lib/wayne/marketing";
import { listenLocal, speakLocal } from "@/lib/wayne/voice";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
const nav = [
  ["/studio/wayne", "Dashboard"],
  ["/studio/wayne/CodeGenerator", "Gerador Roblox"],
  ["/studio/wayne/JarvisOS", "Jarvis OS"],
  ["/studio/wayne/WayneMarketing", "Marketing"],
  ["/studio/wayne/AIArsenal", "AI Arsenal"],
  ["/studio/wayne/AR-Future", "AR Future"],
];
const names: Record<Genre, string> = {
  RNG_Brainrot: "RNG Brainrot",
  Simulator: "Simulator",
  Tycoon: "Tycoon",
  Horror_Doors: "Horror",
  Obby: "Obby",
  Shooter_BedWars: "Shooter",
  Roleplay_Brookhaven: "Roleplay",
};
const badges: Partial<Record<Genre, string>> = {
  RNG_Brainrot: "0,5% GOD",
  Simulator: "Pets e ovos",
};
function useData() {
  const [data, setData] = useState<{
    state: State;
    vault: VaultEntry[];
  } | null>(null);
  const [error, setError] = useState("");
  const refresh = () =>
    loadManager()
      .then((value) => {
        setData(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    void refresh();
  }, []);
  return { data, error, refresh };
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}
export function Shell({
  active,
  children,
}: {
  active: string;
  children: ReactNode;
}) {
  return (
    <div className="wayne-manager shell">
      <aside className="sidebar">
        <a className="wordmark" href="/studio">
          W
          <span>
            WAYNE
            <br />
            <small>CORPORATION</small>
          </span>
        </a>
        <p className="nav-title">Área de trabalho</p>
        <nav aria-label="Navegação WAYNE">
          {nav.map(([href, name]) => (
            <a
              key={href}
              href={href}
              aria-current={active === href ? "page" : undefined}
            >
              {name}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            <a href="/studio">← Voltar ao Studio</a>
          </p>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <span>
            WAYNE GOD MANAGER <b>2.0</b>
          </span>
          <span className="badge">
            {runtimeMode === "LOCAL" ? "MODO LOCAL" : "NEXUS STUDIO"}
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}
function Heading({
  tag,
  title,
  description,
}: {
  tag: string;
  title: string;
  description: string;
}) {
  return (
    <div className="heading">
      <p className="eyebrow">{tag}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Message({ text }: { text: string }) {
  return text ? (
    <p role="status" className="message">
      {text}
    </p>
  ) : null;
}
function Tree({
  files,
  onSelect,
  selected,
}: {
  files: SourceFile[];
  onSelect: (file: SourceFile) => void;
  selected: string;
}) {
  const branch = (prefix: string): ReactNode => {
    const entries = Array.from(
      new Set(
        files
          .filter((f) => f.arquivo.startsWith(prefix))
          .map((f) => f.arquivo.slice(prefix.length).split("/")[0]),
      ),
    );
    return entries.map((name) => {
      const key = prefix + name;
      const file = files.find((f) => f.arquivo === key);
      return file ? (
        <button
          className={"tree-file " + (selected === key ? "selected" : "")}
          onClick={() => onSelect(file)}
          key={key}
        >
          <span>◇</span>
          {name}
        </button>
      ) : (
        <details open key={key}>
          <summary>▾ {name}</summary>
          <div>{branch(key + "/")}</div>
        </details>
      );
    });
  };
  return (
    <div className="tree" aria-label="Wayne Tree">
      {branch("")}
    </div>
  );
}
function CodePanel({ files }: { files: SourceFile[] }) {
  const [selectedPath, setSelectedPath] = useState(
    files.find((f) => f.arquivo.endsWith("/Config.lua"))?.arquivo ||
      files[0]?.arquivo,
  );
  const selected = files.find((f) => f.arquivo === selectedPath) || files[0];
  const [msg, setMsg] = useState("");
  return (
    <div className="code-layout">
      <Tree
        files={files}
        selected={selected?.arquivo || ""}
        onSelect={(file) => setSelectedPath(file.arquivo)}
      />
      <div className="editor">
        <div className="editor-bar">
          <span>{selected?.arquivo.split("/").pop()}</span>
          <Button
            variant="outline"
            onClick={() =>
              copy(selected?.codigoLuau || "")
                .then(() => setMsg("Código copiado"))
                .catch(() =>
                  setMsg("Não foi possível copiar. Selecione o código."),
                )
            }
          >
            Copiar arquivo
          </Button>
        </div>
        <pre tabIndex={0}>
          <code>{selected?.codigoLuau}</code>
        </pre>
        <Message text={msg} />
      </div>
    </div>
  );
}
export function CodeGenerator() {
  const [genre, setGenre] = useState<Genre>("RNG_Brainrot");
  const [files, setFiles] = useState<SourceFile[]>(bundles.RNG_Brainrot);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function generate(g: Genre) {
    setGenre(g);
    setFiles(bundles[g]);
    setBusy(true);
    setMsg("");
    try {
      const r = await action({ action: "generate", genre: g });
      if (!r.files) throw Error("Resposta de geração inválida");
      setFiles(r.files);
      setMsg("Wayne Tree gerada e registrada no Vault.");
    } catch (e) {
      setMsg(
        (e as Error).message +
          " Não foi possível confirmar o registro no Vault. O código padrão está disponível para consulta.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell active="/studio/wayne/CodeGenerator">
      <Heading
        tag="ROBLOX"
        title="Gerador Roblox"
        description="Escolha um gênero para gerar os arquivos do jogo e salvar no Vault."
      />
      <div className="generator">
        <div className="genre-list">
          {genres.map((g) => (
            <button
              key={g}
              disabled={busy}
              aria-pressed={genre === g}
              onClick={() => void generate(g)}
              className={"genre " + (genre === g ? "selected" : "")}
            >
              <div>
                <strong>{names[g]}</strong>
                {badges[g] && <small>{badges[g]}</small>}
              </div>
            </button>
          ))}

        </div>
        <section className="panel generator-output">
          <div className="panel-title">
            <div>
              <span className="eyebrow">WAYNE TREE</span>
              <h2>{names[genre]}</h2>
            </div>
            <span className="badge">{files.length} ARQUIVOS</span>
          </div>
          <div className="toolbar">
            <Button disabled={busy} onClick={() => void generate(genre)}>
              {busy ? "Registrando…" : "Gerar e salvar no Vault"}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                copy(
                  files
                    .map((f) => `-- FILE: ${f.arquivo}\n${f.codigoLuau}`)
                    .join("\n\n"),
                )
                  .then(() =>
                    setMsg(
                      "Todos os arquivos copiados. Cole cada trecho no caminho indicado.",
                    ),
                  )
                  .catch(() => setMsg("Cópia indisponível"))
              }
            >
              Copiar tudo
            </Button>
          </div>
          <CodePanel key={genre + files[0]?.codigoLuau.length} files={files} />
          <Message text={msg} />
        </section>
      </div>
      <details className="context-note">
        <summary>Validação e uso no Roblox Studio</summary>
        <p>Economia no servidor, três remotes por jogo e cooldown de 0,5s. Teste o código no Roblox Studio antes de publicar. Lucro e viralidade não são garantidos.</p>
      </details>
    </Shell>
  );
}
export function Dashboard() {
  const { data, error } = useData();
  const s = data?.state;
  const measured = s?.games.filter((g) => g.robuxTotal !== null) || [];
  const sum = (key: "visitas" | "robuxTotal") =>
    s?.games.some((g) => g[key] !== null)
      ? s.games.reduce((n, g) => n + (g[key] ?? 0), 0).toLocaleString("pt-BR")
      : "—";
  const top = [...measured].sort(
    (a, b) => (b.robuxTotal ?? 0) - (a.robuxTotal ?? 0),
  )[0];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const date = d.toLocaleDateString("sv-SE");
    const values =
      s?.games.flatMap((g) => g.daily_metrics.filter((m) => m.date === date)) ||
      [];
    return {
      date,
      value: values.length ? values.reduce((n, m) => n + m.visitas, 0) : null,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.value ?? 0));
  return (
    <Shell active="/studio/wayne">
      <Heading
        tag="SEUS JOGOS"
        title="Visão geral"
        description="Acompanhe seus jogos e as métricas registradas."
      />
      <div className="kpis">
        {[
          ["TOTAL VISITAS", sum("visitas")],
          ["TOTAL ROBUX", sum("robuxTotal")],
          [
            "JOGOS PUBLICADOS",
            String(
              s?.games.filter((g) => ["Publicado", "Viral"].includes(g.status))
                .length ?? 0,
            ),
          ],
          ["MAIOR RECEITA", top ? names[top.genre] : "Sem dados"],
        ].map(([label, value]) => (
          <article className="panel" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="panel chart">
        <div className="panel-title">
          <h2>Visitas / últimos 7 dias</h2>
          <span className="muted">Dados informados pelo proprietário</span>
        </div>
        {days.some((d) => d.value !== null) ? (
          <svg
            viewBox="0 0 700 200"
            role="img"
            aria-label="Visitas nos últimos sete dias"
          >
            {days.map((d, i) => (
              <g key={d.date}>
                {d.value !== null && (
                  <>
                    <circle
                      cx={35 + i * 105}
                      cy={160 - (d.value / max) * 130}
                      r="5"
                      fill="#ff0000"
                    />
                    <text
                      x={35 + i * 105}
                      y={145 - (d.value / max) * 130}
                      fill="white"
                      textAnchor="middle"
                    >
                      {d.value}
                    </text>
                  </>
                )}
                {i > 0 && d.value !== null && days[i - 1].value !== null && (
                  <line
                    x1={35 + (i - 1) * 105}
                    x2={35 + i * 105}
                    y1={160 - ((days[i - 1].value ?? 0) / max) * 130}
                    y2={160 - (d.value / max) * 130}
                    stroke="#ff0000"
                    strokeWidth="3"
                  />
                )}
                <text
                  x={35 + i * 105}
                  y="190"
                  fill="#a0a0ab"
                  textAnchor="middle"
                >
                  {d.date.slice(5)}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="empty">
            Ainda não há métricas. Abra um jogo para registrar visitas e Robux.
          </div>
        )}
        <p className="muted">
          Os valores mostram a receita em Robux. Para calcular o lucro,
          considere também os custos de cada jogo.
        </p>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Jogo</th>
              <th>Estado</th>
              <th>Visitas</th>
              <th>Robux</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s?.games.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>
                  <span className="badge">{g.status}</span>
                </td>
                <td>{g.visitas ?? "—"}</td>
                <td>{g.robuxTotal ?? "—"}</td>
                <td>
                  <a
                    href={
                      "/studio/wayne/GameDetail?id=" + encodeURIComponent(g.id)
                    }
                  >
                    Abrir árvore ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Message text={error} />
    </Shell>
  );
}
function JsonEditor({
  label,
  value,
  onSave,
}: {
  label: string;
  value: unknown;
  onSave: (value: unknown) => Promise<unknown>;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <label>
        {label}
        <textarea
          className="json-editor"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave(JSON.parse(text));
            setMsg("Salvo.");
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar JSON
      </Button>
      <Message text={msg} />
    </div>
  );
}
function GameWorkspace({
  game,
  state,
  refresh,
}: {
  game: Game;
  state: State;
  refresh: () => Promise<unknown>;
}) {
  const [msg, setMsg] = useState("");
  async function patch(patch: Record<string, unknown>) {
    await action({ action: "game", id: game.id, patch });
    await refresh();
  }
  return (
    <>
      <Heading
        tag="PROJETO / WAYNE TREE"
        title={game.name}
        description="Edite a configuração e consulte os dados registrados do jogo."
      />
      <Tabs defaultValue="tree">
        <TabsList>
          {[
            ["tree", "Wayne Tree"],
            ["config", "Configuração"],
            ["money", "Monetização"],
            ["players", "Jogadores"],
            ["logs", "Logs de segurança"],
          ].map(([v, t]) => (
            <TabsTrigger key={v} value={v}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tree">
          <CodePanel
            key={JSON.stringify(game.config)}
            files={bundles[game.genre].map((f) =>
              f.arquivo.endsWith("/Config.lua")
                ? { ...f, codigoLuau: configLua(game.genre, game.config) }
                : f,
            )}
          />
          <a href="/studio/wayne/CodeGenerator">
            Gerar versão com a configuração salva ↗
          </a>
        </TabsContent>
        <TabsContent value="config">
          <div className="two-col">
            <section className="panel">
              <JsonEditor
                label="Config.json (validado antes de gerar Luau)"
                value={game.config}
                onSave={(c) => patch({ config: c })}
              />
            </section>
            <section className="panel">
              <h2>Dados do jogo</h2>
              <label>
                Estado
                <select
                  value={game.status}
                  onChange={(e) =>
                    patch({ status: e.target.value }).catch((e) =>
                      setMsg(e.message),
                    )
                  }
                >
                  {["Ideia", "Em Dev", "Publicado", "Viral"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  try {
                    await patch({
                      placeId: String(form.get("placeId") || ""),
                      metric: {
                        date: form.get("date"),
                        visitas: Number(form.get("visitas")),
                        robux: Number(form.get("robux")),
                      },
                    });
                    setMsg("Métricas registradas.");
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                <label>
                  Place ID
                  <input
                    name="placeId"
                    defaultValue={game.placeId}
                    pattern="[0-9]*"
                  />
                </label>
                <label>
                  Data
                  <input
                    required
                    type="date"
                    name="date"
                    defaultValue={new Date().toLocaleDateString("sv-SE")}
                  />
                </label>
                <label>
                  Visitas do dia
                  <input required type="number" min="0" name="visitas" />
                </label>
                <label>
                  Robux do dia
                  <input required type="number" min="0" name="robux" />
                </label>
                <Button>Registrar medição</Button>
              </form>
              <Message text={msg} />
            </section>
          </div>
        </TabsContent>
        <TabsContent value="money">
          <section className="panel">
            <h2>Gamepasses</h2>
            <p>
              Cadastre IDs reais e preços para planejamento. A compra e o
              benefício exigem validação pelo MarketplaceService no servidor.
            </p>
            <JsonEditor
              label='Formato: [{"id":"123","name":"VIP","price":99}]'
              value={game.gamepasses}
              onSave={(v) => patch({ gamepasses: v })}
            />
          </section>
        </TabsContent>
        <TabsContent value="players">
          <div className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Jogador</th>
                  <th>Moedas</th>
                  <th>Nível</th>
                  <th>Inventário</th>
                </tr>
              </thead>
              <tbody>
                {state.players
                  .filter((p) => p.gameId === game.id)
                  .map((p) => (
                    <tr key={p.userId}>
                      <td>{p.username}</td>
                      <td>{p.moedas}</td>
                      <td>{p.level}</td>
                      <td>{JSON.stringify(p.inventario)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!state.players.some((p) => p.gameId === game.id) && (
              <p className="empty">Ainda não há dados de jogadores registrados.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="logs">
          <div className="panel">
            {state.logs
              .filter((l) => l.gameId === game.id)
              .map((l) => (
                <div className="log" key={l.id}>
                  <time>{l.data}</time>
                  <strong>{l.userId}</strong>
                  <span>{l.motivo}</span>
                </div>
              ))}
            {!state.logs.some((l) => l.gameId === game.id) && (
              <p className="empty">
                Nenhum log registrado. Sem esses dados, não é possível avaliar
                a ocorrência de ataques.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
export function GameDetail() {
  const { data, error, refresh } = useData();
  const id = useSearchParams()?.get("id") || "";
  const game = data?.state.games.find((g) => g.id === id);
  return (
    <Shell active="/studio/wayne">
      <Message text={error} />
      {game && data ? (
        <GameWorkspace
          key={game.id}
          game={game}
          state={data.state}
          refresh={refresh}
        />
      ) : (
        <div className="empty">
          {data
            ? "Jogo não encontrado. Abra um jogo pelo Dashboard."
            : "Carregando projeto…"}
        </div>
      )}
    </Shell>
  );
}
export function JarvisOS() {
  const { data, error, refresh } = useData();
  const [command, setCommand] = useState("gerar RNG Brainrot");
  const [result, setResult] = useState("JARVIS pronto. Aguardando comando.");
  const [busy, setBusy] = useState(false);
  async function run(text: string) {
    setBusy(true);
    try {
      const r = await action({ action: "command", command: text });
      await refresh();
      setResult(
        r.files
          ? `${r.genre}: ${r.files.length} arquivos gerados. Vault ${r.vaultId}`
          : JSON.stringify(r, null, 2),
      );
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell active="/studio/wayne/JarvisOS">
      <div className="jarvis-screen">
        <Message text={error} />
        <Heading
          tag="ASSISTENTE"
          title="Wayne Jarvis OS"
          description={
            runtimeMode === "LOCAL"
              ? "Execute comandos e consulte seus registros em modo local, sem chamadas de IA pagas."
              : "Comandos e registros privados na sua conta Nexus."
          }
        />
        <div className="four-cards">
          {[
            [
              "01",
              "Claude Code",
              "IA na nuvem, com uso opcional.",
            ],
            [
              "02",
              "Obsidian Vault",
              "Exporte seus registros em Markdown.",
            ],
            [
              "03",
              "Voz local",
              "Voz em PT-BR, quando disponível no navegador em modo local.",
            ],
            ["04", "HUD", "Comandos, agenda e resultados na mesma tela."],
          ].map(([n, t, d]) => (
            <div className="panel" key={n}>
              <span className="eyebrow">{n}</span>
              <h2>{t}</h2>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <div className="terminal">
          <div className="terminal-top">
            <span>WAYNE@NEXUS ~ /skills</span>
            <span>{busy ? "EXECUTANDO" : "PRONTO"}</span>
          </div>
          <pre role="log">{result}</pre>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(command);
            }}
          >
            <label className="sr-only" htmlFor="command">
              Comando
            </label>
            <span>❯</span>
            <input
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
            <Button disabled={busy}>Executar</Button>
          </form>
          <div className="toolbar">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                try {
                  const text = await listenLocal();
                  setCommand(text);
                  await run(text);
                } catch (e) {
                  setResult((e as Error).message);
                }
              }}
            >
              Apretá y hablá
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const today = new Date().toLocaleDateString("sv-SE");
                const values = data?.state.games.flatMap((g) =>
                  g.daily_metrics.filter((m) => m.date === today),
                );
                try {
                  speakLocal(
                    values?.length
                      ? `Você faturou ${values.reduce((n, m) => n + m.robux, 0)} Robux hoje`
                      : "Sem dados de Robux registrados hoje.",
                  );
                } catch (e) {
                  setResult((e as Error).message);
                }
              }}
            >
              Ouvir métricas
            </Button>
          </div>
        </div>
        <div className="schedule">
          {[
            ["07:00", "Resumen"],
            ["09:00", "Plan de hoy"],
            ["14:00", "Métricas"],
            ["19:00", "Cierra el día"],
          ].map(([t, n]) => (
            <div key={t}>
              <strong>{t}</strong>
              <span>{n}</span>
            </div>
          ))}
        </div>
        <p className="muted">
          Estes horários são sugestões. As rotinas ainda não estão agendadas
          no Nexus.
        </p>
        <VaultView entries={data?.vault || []} />
      </div>
    </Shell>
  );
}
export function WayneMarketing() {
  const [brief, setBrief] = useState(
    "Protótipo RNG Brainrot com economia no servidor e chance GOD de 0,5%.",
  );
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Shell active="/studio/wayne/WayneMarketing">
      <Heading
        tag="CRIAÇÃO"
        title="Marketing"
        description="Crie rascunhos para seu negócio e salve no Vault."
      />
      <label>
        Contexto do negócio
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} />
      </label>
      <div className="marketing-grid">
        {prompts.map(([name], i) => (
          <button
            className="panel marketing-card"
            disabled={busy}
            key={name}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await action({
                  action: "marketing",
                  index: i,
                  brief,
                });
                setOutput(r.conteudo || "");
              } catch (e) {
                setOutput((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span>0{i + 1}</span>
            <h2>{name}</h2>
            <small>Gerar e salvar</small>
          </button>
        ))}
      </div>
      <section className="panel">
        <h2>Rascunho</h2>
        <pre className="marketing-output">
          {output || "Descreva seu negócio e escolha o conteúdo que deseja criar."}
        </pre>
        <Button
          variant="outline"
          disabled={!output}
          onClick={() =>
            copy(output).catch(() =>
              setOutput(output + "\nCópia indisponível."),
            )
          }
        >
          Copiar
        </Button>
      </section>
    </Shell>
  );
}
export function AIArsenal() {
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [msg, setMsg] = useState("");
  const visible = tools.filter(
    (t) =>
      (filter === "ALL" ||
        (filter === "STACK" && t.stack) ||
        t.category === filter) &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Shell active="/studio/wayne/AIArsenal">
      <Heading
        tag="AI ARSENAL"
        title="Ferramentas de IA"
        description="120 referências para criação, produtividade e automação."
      />
      <div className="arsenal-intro">
        <div className="wheel" aria-label="Seis categorias do arsenal">
          <div>
            <strong>120</strong>
            <span>FERRAMENTAS</span>
          </div>
        </div>
        <div>
          <h2>WAYNE STACK</h2>
          <p>
            Claude · ElevenLabs · Notion AI · Canva + Figma · Runway + Pika ·
            Make + Zapier · Leonardo + Midjourney · Fireflies
          </p>
          <details className="context-note">
            <summary>Sobre o catálogo</summary>
            <p>Este catálogo reúne ferramentas para consultar e integrar separadamente. Nenhuma está conectada. O selo Wayne Approved marca sua seleção; Claude Max identifica um plano de assinatura. Confira preços, acesso à API e disponibilidade com cada provedor.</p>
          </details>
        </div>
      </div>
      <div className="toolbar">
        <input
          aria-label="Buscar ferramenta"
          placeholder="Buscar ferramenta"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filtrar ferramentas"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "ALL",
            "STACK",
            "VIDEO",
            "CHATBOT",
            "PRODUCTIVITY",
            "DESIGN",
            "WRITING",
            "MARKETING",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      <div className="tools-grid">
        {visible.map((t) => (
          <article
            className={"panel tool " + (t.stack ? "stack" : "")}
            key={t.id}
          >
            <small>{t.category}</small>
            <h3>{t.name}</h3>
            {t.approved && (
              <span className="badge red">
                WAYNE APPROVED{t.name === "Claude" ? " • MAX" : ""}
              </span>
            )}
            <p>{t.usage}</p>
            <small>{t.mode}</small>
            <p className="muted tool-status">Não conectada</p>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(t.id);
                setMsg(
                  "A integração precisa ser configurada no servidor do Nexus. Esta página não recebe chaves de API nem verifica a conexão com o provedor.",
                );
              }}
            >
              Como integrar
            </Button>
            {selected === t.id && <Message text={msg} />}
          </article>
        ))}
      </div>
    </Shell>
  );
}
export function ARFuture() {
  return (
    <Shell active="/studio/wayne/AR-Future">
      <Heading
        tag="PESQUISA"
        title="AR Future"
        description="Estrutura de câmera pronta para protótipos. Integração Orion ainda não implementada."
      />
      <div className="panel ar-panel">
        <span className="eyebrow">PROTÓTIPO / ORION</span>
        <h2>Câmera em primeira pessoa</h2>
        <p>
          O módulo FirstPersonController permite alternar a câmera no Roblox.
          Nenhum SDK de óculos, acesso a câmera real ou transmissão é ativado.
        </p>
        <pre>
          <code>
            {
              bundles.RNG_Brainrot.find((f) =>
                f.arquivo.endsWith("FirstPersonController.lua"),
              )?.codigoLuau
            }
          </code>
        </pre>
        <a href="/studio/wayne/CodeGenerator">Abrir a Wayne Tree ↗</a>
      </div>
    </Shell>
  );
}

function VaultView({ entries }: { entries: VaultEntry[] }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Vault Nexus</h2>
        <a className="button outline" href="/api/nexus/wayne/vault">
          Exportar Markdown
        </a>
      </div>
      <p className="muted">
        Consulte e exporte até 50 registros recentes.
      </p>
      {entries.length ? (
        entries.map((entry) => (
          <details key={entry.id}>
            <summary>
              {entry.titulo} · {new Date(entry.data).toLocaleString("pt-BR")}
            </summary>
            <pre>{entry.conteudo}</pre>
          </details>
        ))
      ) : (
        <p>Nenhum registro carregado.</p>
      )}
    </section>
  );
}
