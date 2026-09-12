import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { initialState, execute } from "../lib/wayne/engine.ts";
import { readWayneJson, wayneOriginAllowed } from "../lib/wayne/http.ts";
function context() {
  return {
    state: initialState(),
    entries: [],
    history: [],
    now: "2026-09-12T00:00:00Z",
    uuid: randomUUID,
    hash: (text) => createHash("sha256").update(text).digest("hex"),
  };
}
test("RNG generation uses saved configuration and records one complete Vault entry", () => {
  const c = context();
  c.state.games[0].config.RollCost = 27;
  const r = execute(c, { action: "generate", genre: "RNG_Brainrot" });
  assert.equal(r.genre, "RNG_Brainrot");
  assert.ok(r.files.length > 8);
  assert.match(
    r.files.find((f) => f.arquivo.endsWith("/Config.lua")).codigoLuau,
    /\["RollCost"\]=27/,
  );
  assert.ok(r.files.every((f) => f.codigoLuau.startsWith("--!strict")));
  assert.equal(c.entries[0].id, r.vaultId);
  assert.ok(c.entries[0].conteudo.includes("StealService.lua"));
  assert.equal(c.generation.genre, "RNG_Brainrot");
  assert.equal(c.state.games[1].config.ClickReward, 1);
});
test("all seven genres generate and command/marketing/metrics/plan/inbox share Vault", () => {
  for (const g of initialState().games) {
    const c = context();
    const r = execute(c, { action: "generate", genre: g.genre });
    assert.ok(r.files.length > 7);
  }
  for (const command of [
    "gerar simulator",
    "métricas",
    "plano hoje",
    "ideia nova de pets",
  ]) {
    const c = context();
    execute(c, { action: "command", command });
    assert.equal(c.entries.length, 2);
    assert.equal(c.entries[0].tipo, "pedido");
  }
  for (let index = 0; index < 6; index++) {
    const c = context();
    const r = execute(c, { action: "marketing", index, brief: "RNG Brainrot" });
    assert.ok(r.conteudo.length > 30);
    assert.equal(c.entries[0].tipo, "salida");
  }
  const c = context();
  const metrics = execute(c, { action: "command", command: "métricas" });
  assert.equal(metrics.totalRobux, null);
});
test("reject cross-game edits, ownership injection, malformed metrics and unsafe configs", () => {
  for (const input of [
    { action: "generate", genre: "__proto__" },
    { action: "game", id: "someone-else", patch: { status: "Publicado" } },
    {
      action: "game",
      id: "RNG_Brainrot",
      patch: { nexusProjectId: randomUUID() },
    },
    {
      action: "game",
      id: "RNG_Brainrot",
      patch: { metric: { date: "2026-02-31", visitas: 2, robux: 2 } },
    },
    {
      action: "game",
      id: "RNG_Brainrot",
      patch: { metric: { date: "2026-09-12", visitas: -2, robux: 2 } },
    },
    { action: "key", key: "never-store-secrets" },
  ])
    assert.throws(() => execute(context(), input));
  const c = context();
  const config = structuredClone(c.state.games[0].config);
  config.Brainrots[0].weight = 10000;
  assert.throws(() =>
    execute(c, { action: "game", id: "RNG_Brainrot", patch: { config } }),
  );
});
test("metric replacement does not double count", () => {
  const c = context();
  for (let i = 0; i < 2; i++)
    execute(c, {
      action: "game",
      id: "RNG_Brainrot",
      patch: { metric: { date: "2026-09-12", visitas: 12, robux: 4 } },
    });
  assert.equal(c.state.games[0].robuxTotal, 4);
});
test("origin check rejects absent and cross-origin requests; byte cap applies without Content-Length", async () => {
  assert.equal(
    wayneOriginAllowed(
      new Request("https://nexus.test/api", {
        headers: { origin: "https://evil.test" },
      }),
    ),
    false,
  );
  assert.equal(
    wayneOriginAllowed(new Request("https://nexus.test/api")),
    false,
  );
  assert.equal(
    wayneOriginAllowed(
      new Request("https://nexus.test/api", {
        headers: { origin: "https://nexus.test" },
      }),
    ),
    true,
  );
  await assert.rejects(() =>
    readWayneJson(
      new Request("https://nexus.test", {
        method: "POST",
        body: "x".repeat(1024),
      }),
      100,
    ),
  );
  assert.deepEqual(
    await readWayneJson(
      new Request("https://nexus.test", {
        method: "POST",
        body: '{"action":"generate"}',
      }),
    ),
    { action: "generate" },
  );
});

test("origin checks honor the actual Host behind a reverse proxy", () => {
  assert.equal(wayneOriginAllowed(new Request("https://internal.test/api", {headers:{host:"nexus.test",origin:"https://nexus.test"}})),true);
  assert.equal(wayneOriginAllowed(new Request("https://internal.test/api", {headers:{host:"nexus.test",origin:"https://evil.test"}})),false);
});
