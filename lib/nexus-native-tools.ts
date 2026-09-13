export type NexusNativeExecutionResult = {
  ok: boolean;
  toolId: "nexus-json" | "nexus-markdown";
  capability: string;
  output: Record<string, unknown>;
};

const MAX_TEXT_BYTES = 250_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoundedText(value: unknown) {
  if (typeof value !== "string") return null;
  if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES) return null;
  return value;
}

function normalizeMarkdown(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd();
}

function inspectMarkdown(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headings: Array<{ level: number; text: string }> = [];
  let fencedCodeBlocks = 0;
  let inFence = false;
  let links = 0;

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) headings.push({ level: heading[1].length, text: heading[2].slice(0, 300) });
    if (/^\s*```/.test(line)) {
      if (!inFence) fencedCodeBlocks += 1;
      inFence = !inFence;
    }
    const linkMatches = line.match(/\[[^\]]{1,300}\]\([^\s)]+\)/g);
    if (linkMatches) links += linkMatches.length;
  }

  return {
    bytes: Buffer.byteLength(text, "utf8"),
    lines: lines.length,
    headings: headings.slice(0, 200),
    headingCount: headings.length,
    fencedCodeBlocks,
    links,
  };
}

export function executeNexusNativeCapability(capability: string, input: unknown): NexusNativeExecutionResult {
  if (!isPlainObject(input)) throw new Error("native_input_invalid");

  if (capability === "data.json.validate") {
    const text = readBoundedText(input.text);
    if (text === null) throw new Error("native_text_invalid");
    try {
      const parsed = JSON.parse(text) as unknown;
      return {
        ok: true,
        toolId: "nexus-json",
        capability,
        output: {
          valid: true,
          rootType: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
        },
      };
    } catch (error) {
      return {
        ok: true,
        toolId: "nexus-json",
        capability,
        output: {
          valid: false,
          error: error instanceof Error ? error.message.slice(0, 300) : "invalid_json",
        },
      };
    }
  }

  if (capability === "data.json.format") {
    const text = readBoundedText(input.text);
    if (text === null) throw new Error("native_text_invalid");
    const spaces = input.spaces === 4 ? 4 : 2;
    let parsed: unknown;
    try { parsed = JSON.parse(text) as unknown; }
    catch { throw new Error("native_json_invalid"); }
    const formatted = JSON.stringify(parsed, null, spaces);
    if (Buffer.byteLength(formatted, "utf8") > MAX_TEXT_BYTES) throw new Error("native_output_too_large");
    return { ok: true, toolId: "nexus-json", capability, output: { text: formatted, spaces } };
  }

  if (capability === "document.markdown.normalize") {
    const text = readBoundedText(input.text);
    if (text === null) throw new Error("native_text_invalid");
    return { ok: true, toolId: "nexus-markdown", capability, output: { text: normalizeMarkdown(text) } };
  }

  if (capability === "document.markdown.inspect") {
    const text = readBoundedText(input.text);
    if (text === null) throw new Error("native_text_invalid");
    return { ok: true, toolId: "nexus-markdown", capability, output: inspectMarkdown(text) };
  }

  throw new Error("native_capability_unsupported");
}
