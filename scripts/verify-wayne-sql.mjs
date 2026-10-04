// Run with PGLITE_MODULE_PATH pointing to an installed @electric-sql/pglite module.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { execute, initialState } from "../lib/wayne/engine.ts";
const { PGlite } = await import(
  process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to authenticated,service_role;`);
for (const name of [
  "20260907234000_nexus_core_v1.sql",
  "20260908000600_nexus_core_service_role_fix_v1.sql",
  "20260912035949_nexus_wayne_manager_v1.sql",
])
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
await db.exec(
  "grant usage,select on all sequences in schema public to service_role;",
);
const owner = randomUUID(),
  other = randomUUID();
await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
function context(state = initialState()) {
  return {
    state,
    entries: [],
    history: [],
    now: new Date().toISOString(),
    uuid: randomUUID,
    hash: (text) => createHash("sha256").update(text).digest("hex"),
  };
}
async function commit(c, revision, user = owner) {
  return (
    await db.query(
      "select public.nexus_wayne_commit($1,$2,$3,$4,$5) as result",
      [
        user,
        revision,
        JSON.stringify(c.state),
        JSON.stringify(c.entries),
        JSON.stringify(c.generation),
      ],
    )
  ).rows[0].result;
}
let c = context();
execute(c, { action: "generate", genre: "RNG_Brainrot" });
await db.exec("set role service_role");
const first = await commit(c, 0);
assert.ok(first.projectId);
assert.equal(first.revision, 1);
assert.equal(
  (await db.query("select count(*)::int as count from public.nexus_projects"))
    .rows[0].count,
  1,
);
assert.equal(
  (await db.query("select count(*)::int as count from public.nexus_artifacts"))
    .rows[0].count,
  c.generation.files.length + 1,
);
await assert.rejects(() => commit(c, 0), /wayne_revision_conflict/);
assert.equal(
  (
    await db.query(
      "select count(*)::int as count from public.nexus_wayne_vault",
    )
  ).rows[0].count,
  1,
);
const saved = (
  await db.query(
    "select state from public.nexus_wayne_state where user_id=$1",
    [owner],
  )
).rows[0].state;
c = context(saved);
execute(c, { action: "generate", genre: "RNG_Brainrot" });
const second = await commit(c, 1);
assert.equal(second.projectId, first.projectId);
assert.equal(
  (await db.query("select max(version) as version from public.nexus_artifacts"))
    .rows[0].version,
  2,
);
// Invalid Vault input must roll back even artifacts and tool runs already inserted.
const broken = context(saved);
execute(broken, { action: "generate", genre: "RNG_Brainrot" });
broken.entries[0].tipo = "invalid";
await assert.rejects(() => commit(broken, 2));
assert.equal(
  (await db.query("select max(version) as version from public.nexus_artifacts"))
    .rows[0].version,
  2,
);
const stolen = context();
stolen.state.games[0].nexusProjectId = first.projectId;
execute(stolen, { action: "generate", genre: "RNG_Brainrot" });
await assert.rejects(() => commit(stolen, 0, other), /wayne_project_not_owned/);
await db.exec("reset role; set role authenticated");
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
assert.equal(
  (await db.query("select * from public.nexus_wayne_state")).rows.length,
  0,
);
assert.equal(
  (await db.query("select * from public.nexus_wayne_vault")).rows.length,
  0,
);
await assert.rejects(() => commit(c, 2), /permission denied/);
await assert.rejects(
  () =>
    db.query(
      "insert into public.nexus_wayne_state(user_id,state) values($1,$2)",
      [other, JSON.stringify(initialState())],
    ),
  /permission denied/,
);
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
assert.equal(
  (await db.query("select * from public.nexus_wayne_state")).rows.length,
  1,
);
await db.exec("reset role; set role anon");
await assert.rejects(
  () => db.query("select * from public.nexus_wayne_vault"),
  /permission denied/,
);
await db.close();
console.log(
  "PASS: atomic generation/project/artifacts/Vault, versioning, conflict rejection, rollback, ownership and anon/browser denial",
);
