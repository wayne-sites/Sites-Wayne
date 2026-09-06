import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import process from "node:process";

const initialPassword = "senha-inicial-segura";
const nextPassword = "senha-alterada-segura";
const captchaToken = "captcha-e2e-valido";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "auth-e2e@example.test",
  user_metadata: { display_name: "Teste E2E", terms_version: "2026-08-17" },
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function startFakeSupabase() {
  const state = {
    password: initialPassword,
    signupRedirect: "",
    recoveryRedirect: "",
    logoutCalls: 0,
  };

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const authorization = request.headers.authorization || "";

      if (request.method === "POST" && url.pathname === "/auth/v1/signup") {
        const body = await requestBody(request);
        state.signupRedirect = url.searchParams.get("redirect_to") || "";
        if (body.gotrue_meta_security?.captcha_token !== captchaToken) return json(response, 400, { message: "captcha verification failed" });
        if (body.password !== state.password && body.password !== initialPassword) return json(response, 400, { message: "weak password" });
        return json(response, 200, { user });
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
        const body = await requestBody(request);
        if (body.gotrue_meta_security?.captcha_token !== captchaToken) return json(response, 400, { message: "captcha verification failed" });
        if (body.email === "limited@example.test") return json(response, 429, { message: "rate limit exceeded" });
        if (body.email === "outage@example.test") return json(response, 503, { message: "provider unavailable" });
        if (body.email !== user.email || body.password !== state.password) return json(response, 400, { message: "invalid credentials" });
        return json(response, 200, { access_token: "access-good", refresh_token: "refresh-good", expires_in: 3_600, user });
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const body = await requestBody(request);
        if (body.refresh_token !== "refresh-good") return json(response, 401, { message: "invalid refresh" });
        return json(response, 200, { access_token: "access-refreshed", refresh_token: "refresh-good", expires_in: 3_600, user });
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/recover") {
        const body = await requestBody(request);
        if (body.gotrue_meta_security?.captcha_token !== captchaToken) return json(response, 400, { message: "captcha verification failed" });
        state.recoveryRedirect = url.searchParams.get("redirect_to") || "";
        return json(response, 200, {});
      }

      if (request.method === "POST" && url.pathname === "/auth/v1/logout") {
        state.logoutCalls += 1;
        return json(response, 200, {});
      }

      if (request.method === "GET" && url.pathname === "/auth/v1/user") {
        const token = authorization.replace(/^Bearer\s+/i, "");
        if (token === "access-outage") return json(response, 503, { message: "provider unavailable" });
        if (["access-good", "access-refreshed", "reset-token"].includes(token)) return json(response, 200, user);
        if (token === "access-needs-terms") return json(response, 200, { ...user, user_metadata: { display_name: "OAuth E2E" } });
        return json(response, 401, { message: "expired token" });
      }

      if (request.method === "PUT" && url.pathname === "/auth/v1/user") {
        const token = authorization.replace(/^Bearer\s+/i, "");
        const body = await requestBody(request);
        if (token === "reset-token" && typeof body.password === "string") {
          state.password = body.password;
          return json(response, 200, { user });
        }
        if (token === "access-needs-terms" && body.data?.terms_version === "2026-08-17") return json(response, 200, { user });
        return json(response, 401, { message: "invalid token" });
      }

      return json(response, 404, { message: "not found" });
    } catch {
      return json(response, 500, { message: "fake provider failure" });
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  return { server, state, url: `http://127.0.0.1:${address.port}` };
}

async function reservePort() {
  const server = createNetServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
    child.stderr.on("data", (chunk) => { output = `${output}${chunk}`.slice(-12_000); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(" ")} falhou (${code}).\n${output}`)));
  });
}

function cookieList(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const value = response.headers.get("set-cookie");
  return value ? [value] : [];
}

function cookieHeader(response) {
  return cookieList(response).map((value) => value.split(";", 1)[0]).join("; ");
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next encerrou antes de ficar pronto (${child.exitCode}).`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // Aguarda a próxima tentativa.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next não ficou pronto dentro do limite.");
}

async function postJson(baseUrl, path, body, cookie = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const fake = await startFakeSupabase();
const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  AUTH_ENABLED: "true",
  AUTH_CAPTCHA_REQUIRED: "true",
  AUTH_ALLOW_INSECURE_LOCAL: "true",
  NEXT_PUBLIC_APP_URL: baseUrl,
  NEXT_PUBLIC_SUPABASE_URL: fake.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

let nextServer;
try {
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"], env);
  nextServer = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    env: { ...env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverOutput = "";
  nextServer.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-12_000); });
  nextServer.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-12_000); });
  await waitForServer(baseUrl, nextServer).catch((error) => { throw new Error(`${error.message}\n${serverOutput}`); });

  const publicPage = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(publicPage.status, 200);
  assert.doesNotMatch(publicPage.headers.get("cache-control") || "", /private|no-store/i);
  assert.match(publicPage.headers.get("content-security-policy") || "", /script-src[^;]+https:\/\/challenges\.cloudflare\.com/);
  assert.match(publicPage.headers.get("content-security-policy") || "", /frame-src[^;]+https:\/\/challenges\.cloudflare\.com/);

  const protectedPage = await fetch(`${baseUrl}/conta`, { redirect: "manual" });
  assert.match(String(protectedPage.status), /^30[1278]$/);
  assert.equal(new URL(protectedPage.headers.get("location"), baseUrl).pathname, "/entrar");
  assert.equal(new URL(protectedPage.headers.get("location"), baseUrl).searchParams.get("next"), "/conta");
  assert.match(protectedPage.headers.get("cache-control") || "", /private/);
  assert.match(protectedPage.headers.get("cache-control") || "", /no-store/);

  const captchaMissing = await postJson(baseUrl, "/api/auth/login", { email: user.email, password: initialPassword });
  assert.equal(captchaMissing.status, 400);
  assert.equal((await captchaMissing.json()).code, "captcha_required");

  const weakSignup = await postJson(baseUrl, "/api/auth/signup", { email: user.email, password: "12345678901", displayName: "Teste E2E", acceptedTerms: "true", captchaToken });
  assert.equal(weakSignup.status, 400);

  const signup = await postJson(baseUrl, "/api/auth/signup", { email: user.email, password: initialPassword, displayName: "Teste E2E", acceptedTerms: "true", captchaToken });
  assert.equal(signup.status, 201);
  assert.equal(fake.state.signupRedirect, `${baseUrl}/auth/callback`);

  const recovery = await postJson(baseUrl, "/api/auth/recover", { email: user.email, captchaToken });
  assert.equal(recovery.status, 200);
  assert.equal(fake.state.recoveryRedirect, `${baseUrl}/redefinir-senha`);

  const loginLimited = await postJson(baseUrl, "/api/auth/login", { email: "limited@example.test", password: initialPassword, captchaToken });
  assert.equal(loginLimited.status, 429);
  assert.equal((await loginLimited.json()).code, "rate_limited");

  const loginOutage = await postJson(baseUrl, "/api/auth/login", { email: "outage@example.test", password: initialPassword, captchaToken });
  assert.equal(loginOutage.status, 503);
  const sessionOutage = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: "nexus_access_token=access-outage" } });
  assert.equal(sessionOutage.status, 503);

  const login = await postJson(baseUrl, "/api/auth/login", { email: user.email, password: initialPassword, captchaToken });
  assert.equal(login.status, 200);
  const cookies = cookieList(login);
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i);
  }
  const sessionCookie = cookieHeader(login);

  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: sessionCookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).authenticated, true);

  for (const unsafe of ["//dominio-malicioso.com", "/\\dominio-malicioso.com", "/%5Cdominio-malicioso.com", "https://dominio-malicioso.com"]) {
    const response = await fetch(`${baseUrl}/entrar?next=${encodeURIComponent(unsafe)}`, { redirect: "manual", headers: { cookie: sessionCookie } });
    assert.match(String(response.status), /^30[1278]$/);
    assert.equal(new URL(response.headers.get("location"), baseUrl).href, `${baseUrl}/conta`);
  }
  const allowed = await fetch(`${baseUrl}/entrar?next=${encodeURIComponent("/conta?aba=seguranca")}`, { redirect: "manual", headers: { cookie: sessionCookie } });
  assert.equal(new URL(allowed.headers.get("location"), baseUrl).href, `${baseUrl}/conta?aba=seguranca`);

  const termsRejected = await postJson(baseUrl, "/api/auth/session", { accessToken: "access-needs-terms", refreshToken: "refresh-good", expiresIn: 3_600, acceptedTerms: false });
  assert.equal(termsRejected.status, 400);
  const termsAccepted = await postJson(baseUrl, "/api/auth/session", { accessToken: "access-needs-terms", refreshToken: "refresh-good", expiresIn: 3_600, acceptedTerms: true });
  assert.equal(termsAccepted.status, 200);

  const refreshed = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: "nexus_access_token=access-expired; nexus_refresh_token=refresh-good" } });
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).authenticated, true);
  assert.match(cookieHeader(refreshed), /nexus_access_token=access-refreshed/);

  const weakReset = await postJson(baseUrl, "/api/auth/update-password", { accessToken: "reset-token", password: "12345678901" });
  assert.equal(weakReset.status, 400);
  const reset = await postJson(baseUrl, "/api/auth/update-password", { accessToken: "reset-token", password: nextPassword });
  assert.equal(reset.status, 200);
  const oldLogin = await postJson(baseUrl, "/api/auth/login", { email: user.email, password: initialPassword, captchaToken });
  assert.equal(oldLogin.status, 401);
  const newLogin = await postJson(baseUrl, "/api/auth/login", { email: user.email, password: nextPassword, captchaToken });
  assert.equal(newLogin.status, 200);

  const logout = await postJson(baseUrl, "/api/auth/logout", {}, cookieHeader(newLogin));
  assert.equal(logout.status, 200);
  assert.equal(fake.state.logoutCalls, 1);
  for (const cookie of cookieList(logout)) assert.match(cookie, /Max-Age=0/i);

  console.log("Auth E2E: CAPTCHA, rate limit, cadastro, callbacks, login, refresh, reset, logout, redirects e cache passaram.");
} finally {
  if (nextServer && nextServer.exitCode === null) {
    nextServer.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (nextServer.exitCode === null) nextServer.kill("SIGKILL");
  }
  await new Promise((resolve) => fake.server.close(resolve));
}
