import test from "node:test";
import assert from "node:assert/strict";
import { loadManager, action, WayneRequestError } from "../lib/wayne/client.ts";

test("an HTML gateway error is readable instead of a JSON parsing exception", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<h1>Bad Gateway</h1>", { status: 502 }));
  await assert.rejects(loadManager, (error) => error instanceof WayneRequestError
    && error.status === 502 && error.message.includes("Tente novamente"));
});

test("expired sessions stay distinguishable even when the response is not JSON", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("Unauthorized", { status: 401 }));
  await assert.rejects(loadManager, (error) => error.status === 401 && error.message.includes("Entre novamente"));
});

test("server validation messages are preserved", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Muitas operações. Aguarde." }, { status: 429 }));
  await assert.rejects(() => action({ action: "generate", genre: "RNG_Brainrot" }), /Muitas operações\. Aguarde\./);
});

test("an interrupted write is never retried automatically", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(() => action({ action: "generate", genre: "RNG_Brainrot" }),
    (error) => error.status === 0 && error.message.includes("conexão"));
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("invalid success responses cannot become empty dashboards or confirmed writes", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  await assert.rejects(loadManager, /carregar os dados/);
  await assert.rejects(() => action({ action: "generate" }), /Confira o Vault/);
  fetchMock.mock.mockImplementation(async () => Response.json(null));
  await assert.rejects(loadManager, /resposta inválida/);
});

test("reloading recovers from a failed request and returns the real data", async (t) => {
  const state = { games: [], players: [], logs: [], expenses: [] };
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(loadManager);
  fetchMock.mock.mockImplementation(async () => Response.json({ state, vault: [] }));
  assert.deepEqual(await loadManager(), { state, vault: [] });
  const result = { genre: "RNG_Brainrot", files: [], vaultId: "saved-entry" };
  fetchMock.mock.mockImplementation(async () => Response.json({ result }));
  assert.deepEqual(await action({ action: "generate", genre: "RNG_Brainrot" }), result);
  const [, init] = fetchMock.mock.calls.at(-1).arguments;
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(JSON.parse(init.body).genre, "RNG_Brainrot");
});
