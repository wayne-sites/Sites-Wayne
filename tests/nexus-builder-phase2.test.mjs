import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { publicPreviewPath, safePublicationSlug, validatePublicationProject } from "../lib/builder/publication.ts";

const project = {
  name: "Wayne Fitness São Paulo",
  kind: "static-web",
  summary: "Landing page estática para Preview.",
  stack: ["HTML", "CSS", "JavaScript"],
  features: ["Responsivo"],
  howToRun: "Abra index.html.",
  files: [
    { path: "index.html", content: '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width"><title>Wayne Fitness</title><meta name="description" content="Demo"></head><body><main><h1>Wayne Fitness</h1></main><script src="script.js"></script></body></html>' },
    { path: "script.js", content: "document.documentElement.dataset.ready = 'true';" },
    { path: "README.md", content: "# Wayne Fitness\nPreview estático." },
  ],
};

test("Phase 2 aceita pacote estático local seguro", () => {
  const result = validatePublicationProject(project);
  assert.equal(result.name, project.name);
  assert.equal(result.files.length, 3);
});

test("Phase 2 bloqueia execução de rede e embeds antes do GitHub", () => {
  for (const unsafe of [
    "fetch('/api/private')",
    'new WebSocket("wss://example.com")',
    '<iframe src="https://example.com"></iframe>',
    '<script src="https://example.com/x.js"></script>',
    '<form action="/api/submit"></form>',
    '<a href="javascript:alert(1)">x</a>',
  ]) {
    assert.throws(() => validatePublicationProject({
      ...project,
      files: [
        ...project.files.filter((file) => file.path !== "script.js"),
        { path: "script.js", content: unsafe },
      ],
    }), /builder_publish_/);
  }
});

test("Phase 2 gera slug e caminho de Preview determinísticos", () => {
  assert.equal(safePublicationSlug("Wayne Fitness São Paulo"), "wayne-fitness-sao-paulo");
  assert.equal(publicPreviewPath("wayne-fitness-demo"), "/generated/wayne-fitness-demo/index.html");
});

test("Worker usa OIDC, gates completos e não possui merge/produção", () => {
  const workflow = fs.readFileSync(".github/workflows/nexus-builder-agent-worker.yml", "utf8");
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm audit --omit=dev --audit-level=critical/);
  assert.match(workflow, /gh pr create/);
  assert.match(workflow, /Wait for Vercel Preview/);
  assert.doesNotMatch(workflow, /gh pr merge/);
  assert.doesNotMatch(workflow, /vercel\s+--prod/);
});

test("Fila Phase 2 tem RLS e claim atômico com SKIP LOCKED", () => {
  const migration = fs.readFileSync("supabase/migrations/202609070001_builder_agent_phase2.sql", "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /revoke all on table public\.builder_agent_jobs from anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.claim_builder_agent_job\(text\) to service_role/i);
});
