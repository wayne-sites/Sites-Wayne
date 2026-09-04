import assert from "node:assert/strict";
import test from "node:test";
import { matchesRequestOrigin } from "../lib/origin-security.ts";

test("origem aceita o Host efetivo e rejeita domínio externo", () => {
  assert.equal(matchesRequestOrigin("http://127.0.0.1:4100", "localhost:3000", "127.0.0.1:4100"), true);
  assert.equal(matchesRequestOrigin("https://sites-wayne.vercel.app", "sites-wayne.vercel.app", "sites-wayne.vercel.app"), true);
  assert.equal(matchesRequestOrigin("https://dominio-malicioso.com", "sites-wayne.vercel.app", "sites-wayne.vercel.app"), false);
  assert.equal(matchesRequestOrigin("não-é-url", "sites-wayne.vercel.app", "sites-wayne.vercel.app"), false);
});
