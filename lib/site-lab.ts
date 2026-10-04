import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import { validateBuilderProject, type BuilderProject } from "./builder/manifest.ts";

export const SITE_LAB_VERSION = "1.0.0";
export const SITE_LAB_CONSENT = "internal-review-v1";
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
export type LabCheck = { name: string; passed: boolean };
export type SiteReview = { original: BuilderProject; revised: BuilderProject; changes: string[]; before: LabCheck[]; after: LabCheck[] };
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
function elements(node: Node): Element[] {
  const result: Element[] = [];
  if ("tagName" in node) result.push(node);
  if ("childNodes" in node) for (const child of node.childNodes) result.push(...elements(child));
  return result;
}
const attr = (el: Element, name: string) => el.attrs.find(a => a.name === name)?.value;
function inspect(html: string): LabCheck[] {
  const nodes = elements(parse(html));
  return [
    { name: "Idioma declarado", passed: nodes.some(n => n.tagName === "html" && Boolean(attr(n, "lang"))) },
    { name: "Título", passed: nodes.some(n => n.tagName === "title" && n.childNodes.some(c => "value" in c && c.value.trim())) },
    { name: "Viewport", passed: nodes.some(n => n.tagName === "meta" && attr(n, "name")?.toLowerCase() === "viewport") },
    { name: "Descrição", passed: nodes.some(n => n.tagName === "meta" && attr(n, "name")?.toLowerCase() === "description" && Boolean(attr(n, "content"))) },
    { name: "Conteúdo principal", passed: nodes.some(n => n.tagName === "main") },
    { name: "Imagens com atributo alt", passed: nodes.filter(n => n.tagName === "img").every(n => attr(n, "alt") !== undefined) },
    { name: "Links externos isolados", passed: nodes.filter(n => attr(n, "target")?.toLowerCase() === "_blank").every(n => /\bnoopener\b/i.test(attr(n, "rel") || "")) },
  ];
}

export function reviewSite(input: unknown): SiteReview {
  const original = validateBuilderProject(input);
  const revised = structuredClone(original);
  const file = revised.files.find(f => f.path.toLowerCase() === "index.html")!;
  const nodes = elements(parse(file.content, { sourceCodeLocationInfo: true }));
  const changes: string[] = [];
  const edits: { at: number; text: string }[] = [];
  const head = nodes.find(n => n.tagName === "head");
  const root = nodes.find(n => n.tagName === "html");
  if (root?.sourceCodeLocation?.startTag && !attr(root, "lang")) {
    // Empty existing language attributes need human review; never add duplicates.
    if (attr(root, "lang") === undefined) {
      edits.push({ at: root.sourceCodeLocation.startTag.endOffset - 1, text: ' lang="pt-BR"' });
      changes.push("Idioma padrão PT-BR declarado; confirme se corresponde ao conteúdo.");
    }
  }
  if (head?.sourceCodeLocation?.startTag) {
    let addition = "";
    if (!nodes.some(n => n.tagName === "title")) {
      addition += `<title>${escape(original.name)}</title>\n`;
      changes.push("Título preenchido com o nome do projeto.");
    }
    if (!nodes.some(n => n.tagName === "meta" && attr(n, "name")?.toLowerCase() === "viewport")) {
      addition += '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
      changes.push("Viewport responsivo adicionado.");
    }
    if (!nodes.some(n => n.tagName === "meta" && attr(n, "name")?.toLowerCase() === "description")) {
      addition += `<meta name="description" content="${escape(original.summary)}">\n`;
      changes.push("Descrição preenchida com o resumo existente.");
    }
    if (addition) edits.push({ at: head.sourceCodeLocation.startTag.endOffset, text: "\n" + addition });
  }
  for (const n of nodes) {
    if (n.tagName === "a" && attr(n, "target")?.toLowerCase() === "_blank" && attr(n, "rel") === undefined && n.sourceCodeLocation?.startTag) {
      edits.push({ at: n.sourceCodeLocation.startTag.endOffset - 1, text: ' rel="noopener noreferrer"' });
      changes.push("Link em nova aba recebeu noopener e noreferrer.");
    }
  }
  const before = inspect(file.content);
  for (const edit of edits.sort((a, b) => b.at - a.at)) file.content = file.content.slice(0, edit.at) + edit.text + file.content.slice(edit.at);
  // Stay within the existing Builder export contract; never ship an invalid revision.
  try { validateBuilderProject(revised); }
  catch { file.content = original.files.find(f => f.path.toLowerCase() === "index.html")!.content; changes.length = 0; }
  return { original, revised, changes: [...new Set(changes)], before, after: inspect(file.content) };
}

export function sitePreview(project: BuilderProject): string {
  const html = project.files.find(f => f.path.toLowerCase() === "index.html")!.content;
  const doc = parse(html);
  const nodes = elements(doc);
  const head = nodes.find(n => n.tagName === "head")!;
  for (const n of nodes) {
    if (["script", "iframe", "object", "embed", "base", "link", "meta"].includes(n.tagName) && n.parentNode) {
      n.parentNode.childNodes = n.parentNode.childNodes.filter(c => c !== n);
    }
    n.attrs = n.attrs.filter(a => !a.name.startsWith("on") && !["srcdoc", "action", "formaction", "href", "xlink:href"].includes(a.name));
  }
  const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; form-action 'none'; base-uri 'none'";
  const fragment = parseFragment(`<meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><meta name="viewport" content="width=device-width, initial-scale=1">`);
  head.childNodes.unshift(...fragment.childNodes);
  for (const child of fragment.childNodes) child.parentNode = head;
  const styles = project.files.filter(f => f.path.endsWith(".css")).map(f => f.content).join("\n");
  if (styles) {
    const style = parseFragment("<style></style>").childNodes[0] as Element;
    style.childNodes = [{ nodeName: "#text", value: styles.replaceAll("<", "\\3C "), parentNode: style }];
    style.parentNode = head;
    head.childNodes.push(style);
  }
  return serialize(doc);
}
