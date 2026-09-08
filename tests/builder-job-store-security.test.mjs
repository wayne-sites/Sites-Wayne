import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storePath = new URL("../lib/builder/job-store.ts", import.meta.url);
const migrationPath = new URL("../supabase/migrations/20260908204000_builder_agent_rpc_hardening_v1.sql", import.meta.url);

test("builder job RPCs stay server-only and use service_role", async () => {
  const source = await readFile(storePath, "utf8");
  assert.match(source, /import\s+"server-only"/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("builder RPC hardening revokes public execution and preserves service_role", async () => {
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /from anon, authenticated/i);
  assert.match(source, /to service_role/i);
  assert.match(source, /enqueue_builder_agent_job/);
  assert.match(source, /get_builder_agent_job_status/);
});
