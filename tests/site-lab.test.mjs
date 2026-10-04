import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { reviewSite, sitePreview } from "../lib/site-lab.ts";
const project = (html = '<!doctype html><html><head></head><body><main><h1>Loja</h1><a target="_blank" href="https://example.com">Abrir</a></main></body></html>') => ({
  kind: "static-web", name: 'Loja <teste>', summary: 'Produtos "originais"', stack: ["HTML"], features: ["Catálogo"], howToRun: "Abra index.html", files: [{ path: "index.html", content: html }],
});
test("review preserves the exact source and improves only missing structure", () => {
  const source = project(), snapshot = structuredClone(source);
  const r = reviewSite(source);
  assert.deepEqual(source, snapshot);
  assert.deepEqual(r.original, snapshot);
  assert.match(r.revised.files[0].content, /<title>Loja &lt;teste&gt;<\/title>/);
  assert.match(r.revised.files[0].content, /name="viewport"/);
  assert.match(r.revised.files[0].content, /rel="noopener noreferrer"/);
  assert.ok(r.after.filter(c => c.passed).length > r.before.filter(c => c.passed).length);
  assert.deepEqual(reviewSite(r.revised).changes, []);
});
test("existing titles and metadata stay intact; strings inside scripts are not tags", () => {
  const html = '<!doctype html><html lang="en"><head><title>Original</title><meta name="description" content="Existing"><meta name="viewport" content="width=device-width"></head><body><script>const s="<title>Fake</title>";</script></body></html>';
  const r = reviewSite(project(html));
  assert.equal(r.revised.files[0].content, html);
  assert.deepEqual(r.changes, []);
});
test("unsupported structure is preserved; no fake descriptions for unlabeled images", () => {
  const r = reviewSite(project('<main><img src="photo.png"><h1>Oi</h1></main>'));
  assert.equal(r.revised.files[0].content, r.original.files[0].content);
  assert.equal(r.after.find(c => c.name.includes("alt")).passed, false);
  assert.throws(() => reviewSite({ ...project(), files: [{path: "../index.html", content: "bad"}] }), /unsafe/);
});
test("preview blocks code, forms, external resources and CSS HTML breakouts", () => {
  const source = project('<html><head><meta http-equiv="refresh" content="0;url=https://example.com"><base href="https://example.com"><script>alert(1)</script></head><body onload="alert(1)"><a href="https://example.com">External</a><iframe src="https://example.com"></iframe><form action="https://example.com"><button formaction="https://example.com">Send</button></form></body></html>');
  source.files.push({path:"style.css",content:'body{color:red} /* </style><script>alert(2)</script> */'});
  const preview = sitePreview(source);
  assert.match(preview, /Content-Security-Policy/);
  assert.match(preview, /default-src 'none'/);
  assert.doesNotMatch(preview, /<script|<iframe|<base|http-equiv="refresh"|onload=|formaction=|action="https:|href=/i);
});
test("private API, Vault and page gate access before exposing owner data", async () => {
  for (const file of ['app/api/nexus/wayne/route.ts','app/api/nexus/wayne/vault/route.ts','app/api/nexus/wayne/site-lab/route.ts','app/studio/wayne/layout.tsx']) {
    const text = await readFile(new URL('../'+file, import.meta.url), 'utf8');
    assert.match(text, /isWayneOwner\(user.id\)/, file);
  }
  const client = await readFile(new URL('../components/wayne/manager.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(client, /import.*bundles\.json/);
});
