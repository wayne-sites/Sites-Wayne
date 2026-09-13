const MAX_TEXT_BYTES = 250_000;

export const WORKER_TOOLS = ["nexus-json", "nexus-markdown"];
export const WORKER_CAPABILITIES = [
  "data.json.validate",
  "data.json.format",
  "document.markdown.normalize",
  "document.markdown.inspect",
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value) {
  if (typeof value !== "string") throw new Error("worker_input_text_invalid");
  if (Buffer.byteLength(value, "utf8") > MAX_TEXT_BYTES) throw new Error("worker_input_text_too_large");
  return value;
}

function normalizeMarkdown(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trimEnd();
}

function inspectMarkdown(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const headings = [];
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
    const matches = line.match(/\[[^\]]{1,300}\]\([^\s)]+\)/g);
    if (matches) links += matches.length;
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

export function executeWorkerCapability(capability, input) {
  if (!WORKER_CAPABILITIES.includes(capability)) throw new Error("worker_capability_unsupported");
  if (!isPlainObject(input)) throw new Error("worker_input_invalid");

  if (capability === "data.json.validate") {
    const text = boundedText(input.text);
    try {
      const parsed = JSON.parse(text);
      return {
        valid: true,
        rootType: parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message.slice(0, 300) : "invalid_json",
      };
    }
  }

  if (capability === "data.json.format") {
    const text = boundedText(input.text);
    const spaces = input.spaces === 4 ? 4 : 2;
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error("worker_json_invalid"); }
    const formatted = JSON.stringify(parsed, null, spaces);
    if (Buffer.byteLength(formatted, "utf8") > MAX_TEXT_BYTES) throw new Error("worker_output_too_large");
    return { text: formatted, spaces };
  }

  if (capability === "document.markdown.normalize") {
    return { text: normalizeMarkdown(boundedText(input.text)) };
  }

  if (capability === "document.markdown.inspect") {
    return inspectMarkdown(boundedText(input.text));
  }

  throw new Error("worker_capability_unsupported");
}
