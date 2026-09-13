import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WORKER_CAPABILITIES, WORKER_TOOLS } from "./runtime.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(root, "worker-manifest.json");
const checksumsPath = path.join(root, "SHA256SUMS");

function fail(code) {
  throw new Error(code);
}

function isSafeFileName(value) {
  return typeof value === "string"
    && value.length > 0
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== "..";
}

async function sha256(fileName) {
  const data = await readFile(path.join(root, fileName));
  return createHash("sha256").update(data).digest("hex");
}

async function readManifest() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("worker_manifest_invalid_json");
  }

  if (parsed?.name !== "nexus-worker" || parsed?.protocolVersion !== "1") fail("worker_manifest_identity_invalid");
  if (!Array.isArray(parsed.files) || parsed.files.length < 5) fail("worker_manifest_files_invalid");
  if (new Set(parsed.files).size !== parsed.files.length) fail("worker_manifest_duplicate_file");
  if (!parsed.files.every(isSafeFileName)) fail("worker_manifest_unsafe_file");
  if (JSON.stringify(parsed.tools) !== JSON.stringify(WORKER_TOOLS)) fail("worker_manifest_tools_mismatch");
  if (JSON.stringify(parsed.capabilities) !== JSON.stringify(WORKER_CAPABILITIES)) fail("worker_manifest_capabilities_mismatch");
  if (parsed.security?.shellExec !== false || parsed.security?.childProcess !== false || parsed.security?.eval !== false) {
    fail("worker_manifest_security_invalid");
  }

  return parsed;
}

async function buildLines(files) {
  const lines = [];
  for (const file of files) {
    await access(path.join(root, file));
    lines.push(`${await sha256(file)}  ${file}`);
  }
  return lines;
}

async function verifyExisting(expectedLines) {
  let current;
  try {
    current = (await readFile(checksumsPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  } catch {
    fail("worker_checksums_missing");
  }

  if (current.length !== expectedLines.length) fail("worker_checksums_count_mismatch");
  for (let i = 0; i < expectedLines.length; i += 1) {
    if (current[i] !== expectedLines[i]) fail(`worker_checksum_mismatch_${i + 1}`);
  }
}

async function main() {
  const manifest = await readManifest();
  const lines = await buildLines(manifest.files);

  if (process.argv.includes("--write-checksums")) {
    await writeFile(checksumsPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "w" });
    console.log(`[NEXUS VERIFY] SHA256SUMS gerado para ${lines.length} arquivos.`);
    return;
  }

  await verifyExisting(lines);
  console.log(`[NEXUS VERIFY] OK • ${lines.length} arquivos íntegros • protocol ${manifest.protocolVersion}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "worker_verify_failed";
  console.error(`[NEXUS VERIFY] FALHA: ${message}`);
  process.exitCode = 1;
});
