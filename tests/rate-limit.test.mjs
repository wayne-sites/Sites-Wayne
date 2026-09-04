import assert from "node:assert/strict";
import test from "node:test";
import { rateLimit } from "../lib/server/rate-limit.ts";

test("rate limit bloqueia depois do limite e informa nova tentativa", () => {
  const key = `test-rate-${crypto.randomUUID()}`;
  assert.equal(rateLimit(key, 2, 60_000).allowed, true);
  assert.equal(rateLimit(key, 2, 60_000).allowed, true);
  const blocked = rateLimit(key, 2, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("rate limit limita o tamanho da chave antes de armazenar", () => {
  const prefix = `test-long-${crypto.randomUUID()}`.padEnd(256, "x");
  assert.equal(rateLimit(`${prefix}a`, 1, 60_000).allowed, true);
  assert.equal(rateLimit(`${prefix}b`, 1, 60_000).allowed, false);
});
