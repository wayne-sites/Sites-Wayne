import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8');
const runtime = stripTypeScriptTypes(source)
  .replace('import "server-only";', '')
  .replace('import { fetchWithTimeout } from "@/lib/server/http";', 'const fetchWithTimeout = (...args) => globalThis.__builderFetch(...args);');
const subject = await import(`data:text/javascript;base64,${Buffer.from(runtime).toString('base64')}`);

test('server credential required; public key cannot be fallback', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-fixture';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  globalThis.__builderFetch = () => { throw new Error('unexpected network'); };
  await assert.rejects(subject.getBuilderAgentJobStatus('fixture', 'hash'), /not_configured/);
});

test('RPC uses server credential and never caches; status contract preserved', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-fixture';
  globalThis.__builderFetch = async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer server-fixture');
    assert.equal(init.headers.apikey, 'server-fixture');
    assert.equal(init.cache, 'no-store');
    assert.equal(JSON.parse(init.body).p_status_token_hash, 'hash');
    return { ok: true, json: async () => [{ id: 'fixture', status: 'queued' }] };
  };
  assert.equal((await subject.getBuilderAgentJobStatus('fixture', 'hash')).status, 'queued');
});

test('upstream error payload is not copied into exception/logs', async () => {
  globalThis.__builderFetch = async () => ({ ok: false, status: 403, text: async () => 'sensitive-fixture' });
  await assert.rejects(subject.getBuilderAgentJobStatus('fixture', 'hash'), error => error.message === 'builder_job_store_403');
});

test('job token remains random and only its hash is used for lookup', () => {
  const a = subject.createBuilderJobToken();
  const b = subject.createBuilderJobToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.hash, /^[a-f0-9]{64}$/);
  assert.equal(subject.hashBuilderJobToken(a.token), a.hash);
});

