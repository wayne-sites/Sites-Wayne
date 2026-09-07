import { validateBuilderProject, type BuilderProject } from "@/lib/builder/manifest";

export type BuilderAgentJobStatus =
  | "queued"
  | "running"
  | "ci_passed"
  | "preview_ready"
  | "failed";

const forbiddenPublicationPatterns: Array<[RegExp, string]> = [
  [/<script\b[^>]*\bsrc\s*=\s*["'](?:https?:)?\/\//i, "remote_script"],
  [/<iframe\b/i, "iframe"],
  [/<(?:object|embed)\b/i, "embedded_object"],
  [/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, "meta_refresh"],
  [/<form\b[^>]*\baction\s*=/i, "external_form_action"],
  [/\bjavascript\s*:/i, "javascript_url"],
  [/\beval\s*\(/i, "eval"],
  [/\bnew\s+Function\s*\(/i, "dynamic_function"],
  [/\bfetch\s*\(/i, "network_fetch"],
  [/\bXMLHttpRequest\b/i, "xhr"],
  [/\bWebSocket\s*\(/i, "websocket"],
  [/\bEventSource\s*\(/i, "event_source"],
  [/\bnavigator\.sendBeacon\s*\(/i, "send_beacon"],
  [/\bserviceWorker\.register\s*\(/i, "service_worker"],
];

export function safePublicationSlug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "nexus-site";
}

export function validatePublicationProject(value: unknown): BuilderProject {
  const project = validateBuilderProject(value);
  const executableText = project.files
    .filter((file) => /\.(?:html?|js|mjs)$/i.test(file.path))
    .map((file) => file.content)
    .join("\n");

  for (const [pattern, code] of forbiddenPublicationPatterns) {
    if (pattern.test(executableText)) throw new Error(`builder_publish_${code}_forbidden`);
  }

  return project;
}

export function publicPreviewPath(slug: string) {
  return `/generated/${slug}/index.html`;
}
