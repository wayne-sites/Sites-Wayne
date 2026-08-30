import assert from "node:assert/strict";
import process from "node:process";

const baseUrl = process.env.AUTH_STAGING_BASE_URL?.replace(/\/$/, "");

if (!baseUrl) throw new Error("Defina AUTH_STAGING_BASE_URL fora do repositório.");
if (new URL(baseUrl).protocol !== "https:") throw new Error("O smoke test real exige uma URL HTTPS de staging.");

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: baseUrl, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const publicPage = await fetch(baseUrl, { redirect: "manual" });
assert.equal(publicPage.status, 200);
assert.doesNotMatch(publicPage.headers.get("cache-control") || "", /private|no-store/i);
assert.match(publicPage.headers.get("content-security-policy") || "", /script-src[^;]+https:\/\/challenges\.cloudflare\.com/);
assert.match(publicPage.headers.get("content-security-policy") || "", /frame-src[^;]+https:\/\/challenges\.cloudflare\.com/);

const anonymousAccount = await fetch(`${baseUrl}/conta`, { redirect: "manual" });
assert.match(String(anonymousAccount.status), /^30[1278]$/);
assert.equal(new URL(anonymousAccount.headers.get("location"), baseUrl).pathname, "/entrar");

const loginPage = await fetch(`${baseUrl}/entrar`, { redirect: "manual" });
assert.equal(loginPage.status, 200);
assert.match(await loginPage.text(), /Verificação anti-bot necessária/);

for (const [path, body] of [
  ["/api/auth/login", { email: "security-smoke@example.invalid", password: "senha-invalida-segura" }],
  ["/api/auth/signup", { email: "security-smoke@example.invalid", password: "senha-invalida-segura", displayName: "Security Smoke", acceptedTerms: "true" }],
  ["/api/auth/recover", { email: "security-smoke@example.invalid" }],
]) {
  const response = await post(path, body);
  assert.equal(response.status, 400, `${path} aceitou uma solicitação sem CAPTCHA.`);
  assert.equal((await response.json()).code, "captcha_required");
}

console.log("Auth staging smoke: feature gate, CAPTCHA obrigatório, CSP, rota protegida e cache passaram.");
