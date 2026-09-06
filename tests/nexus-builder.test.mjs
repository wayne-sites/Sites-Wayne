import assert from "node:assert/strict";
import test from "node:test";
import { extractBuilderHtml, extractBuilderJson, validateBuilderProject } from "../lib/builder/manifest.ts";

const validProject = {
  name: "Projeto Demo",
  kind: "static-web",
  summary: "Um projeto web estático seguro.",
  stack: ["HTML", "CSS", "JavaScript"],
  features: ["Responsivo"],
  howToRun: "Abra index.html no navegador.",
  files: [
    { path: "index.html", content: "<!doctype html><html><body><h1>Demo</h1></body></html>" },
    { path: "styles.css", content: "body { font-family: sans-serif; }" },
    { path: "README.md", content: "# Projeto Demo\nAbra index.html." },
  ],
};

test("Builder aceita um manifesto estático válido", () => {
  const result = validateBuilderProject(validProject);
  assert.equal(result.kind, "static-web");
  assert.equal(result.files.length, 3);
  assert.equal(result.files[0].path, "index.html");
});

test("Builder extrai JSON mesmo quando o provider usa fence", () => {
  const parsed = extractBuilderJson(`\`\`\`json\n${JSON.stringify(validProject)}\n\`\`\``);
  const result = validateBuilderProject(parsed);
  assert.equal(result.name, "Projeto Demo");
});

test("Builder extrai HTML completo de resposta simples ou fenced", () => {
  const html = "<!doctype html><html><body><h1>Ok</h1></body></html>";
  assert.equal(extractBuilderHtml(html), html);
  assert.equal(extractBuilderHtml(`texto antes\n\`\`\`html\n${html}\n\`\`\`\ntexto depois`), html);
});

test("Builder rejeita fallback HTML incompleto", () => {
  assert.throws(() => extractBuilderHtml("<html><body>sem fechamento"), /builder_html_incomplete/);
  assert.throws(() => extractBuilderHtml("apenas texto"), /builder_html_missing/);
});

test("Builder bloqueia path traversal e arquivos ocultos", () => {
  assert.throws(
    () => validateBuilderProject({ ...validProject, files: [{ path: "../index.html", content: "x" }] }),
    /builder_path_unsafe/,
  );
  assert.throws(
    () => validateBuilderProject({
      ...validProject,
      files: [
        { path: "index.html", content: "<h1>x</h1>" },
        { path: ".env", content: "TOKEN=placeholder" },
      ],
    }),
    /builder_path_(unsafe|forbidden)/,
  );
});

test("Builder rejeita segredos com aparência real", () => {
  assert.throws(
    () => validateBuilderProject({
      ...validProject,
      files: [
        { path: "index.html", content: "<h1>x</h1>" },
        { path: "config.js", content: "const key = 'gsk_abcdefghijklmnopqrstuv';" },
      ],
    }),
    /builder_secret_like_content/,
  );
});

test("Builder exige index.html e limita extensões", () => {
  assert.throws(
    () => validateBuilderProject({
      ...validProject,
      files: [{ path: "README.md", content: "# Sem index" }],
    }),
    /builder_index_missing/,
  );
  assert.throws(
    () => validateBuilderProject({
      ...validProject,
      files: [
        { path: "index.html", content: "<h1>x</h1>" },
        { path: "run.sh", content: "echo x" },
      ],
    }),
    /builder_extension_forbidden/,
  );
});
