export type BuilderFile = {
  path: string;
  content: string;
};

export type BuilderProject = {
  name: string;
  kind: "static-web";
  summary: string;
  stack: string[];
  features: string[];
  howToRun: string;
  files: BuilderFile[];
};

const MAX_FILES = 12;
const MAX_FILE_BYTES = 20_000;
const MAX_TOTAL_BYTES = 90_000;
const MAX_PATH_LENGTH = 120;

const allowedExtensions = new Set([
  "html",
  "css",
  "js",
  "mjs",
  "json",
  "md",
  "txt",
]);

const forbiddenSegments = new Set([
  ".git",
  ".github",
  ".next",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const forbiddenBasenames = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  "credentials.json",
  "secrets.json",
  "id_rsa",
  "id_ed25519",
]);

const secretLikePattern = /(?:gsk_[A-Za-z0-9_-]{12,}|sk-proj-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;

function readString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`builder_${field}_invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`builder_${field}_invalid`);
  return normalized;
}

function readStringArray(value: unknown, field: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`builder_${field}_invalid`);
  return value.map((item) => readString(item, field, maxLength));
}

function validatePath(rawPath: unknown) {
  const path = readString(rawPath, "path", MAX_PATH_LENGTH).replaceAll("\\", "/");
  if (path.startsWith("/") || path.includes("..") || path.includes("//")) {
    throw new Error("builder_path_unsafe");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(path)) throw new Error("builder_path_unsafe");

  const segments = path.split("/");
  if (segments.some((segment) => forbiddenSegments.has(segment) || segment.startsWith("."))) {
    throw new Error("builder_path_forbidden");
  }

  const basename = segments.at(-1)?.toLowerCase() || "";
  if (forbiddenBasenames.has(basename)) throw new Error("builder_path_forbidden");
  const extension = basename.includes(".") ? basename.split(".").at(-1) || "" : "";
  if (!allowedExtensions.has(extension)) throw new Error("builder_extension_forbidden");
  return path;
}

function validateContent(rawContent: unknown) {
  if (typeof rawContent !== "string") throw new Error("builder_content_invalid");
  if (!rawContent.trim() || rawContent.length > MAX_FILE_BYTES || rawContent.includes("\u0000")) {
    throw new Error("builder_content_invalid");
  }
  if (secretLikePattern.test(rawContent)) throw new Error("builder_secret_like_content");
  return rawContent;
}

export function extractBuilderJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("builder_empty_response");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("builder_json_missing");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function validateBuilderProject(value: unknown): BuilderProject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("builder_project_invalid");
  const input = value as Record<string, unknown>;

  if (input.kind !== "static-web") throw new Error("builder_kind_invalid");
  const name = readString(input.name, "name", 80);
  const summary = readString(input.summary, "summary", 500);
  const stack = readStringArray(input.stack, "stack", 8, 50);
  const features = readStringArray(input.features, "features", 10, 120);
  const howToRun = readString(input.howToRun, "how_to_run", 500);

  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > MAX_FILES) {
    throw new Error("builder_files_invalid");
  }

  const seen = new Set<string>();
  let totalBytes = 0;
  const files = input.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error("builder_file_invalid");
    const record = file as Record<string, unknown>;
    const path = validatePath(record.path);
    if (seen.has(path)) throw new Error("builder_duplicate_path");
    seen.add(path);
    const content = validateContent(record.content);
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("builder_project_too_large");
    return { path, content };
  });

  if (!files.some((file) => file.path.toLowerCase() === "index.html")) {
    throw new Error("builder_index_missing");
  }

  return {
    name,
    kind: "static-web",
    summary,
    stack,
    features,
    howToRun,
    files,
  };
}
