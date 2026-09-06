import assert from "node:assert/strict";
import test from "node:test";
import { extractBuilderJson, validateBuilderProject } from "../lib/builder/manifest.ts";

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
    /builder_path_forbidden/,
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
