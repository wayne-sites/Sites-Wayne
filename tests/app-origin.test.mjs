import assert from "node:assert/strict";
import test from "node:test";
import { applicationOrigin } from "../lib/app-origin.ts";

test("origem canônica exige HTTPS e remove paths", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  const previousLocal = process.env.AUTH_ALLOW_INSECURE_LOCAL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "https://sites-wayne.vercel.app/caminho";
    assert.equal(applicationOrigin("https://preview.example"), "https://sites-wayne.vercel.app");
    process.env.NEXT_PUBLIC_APP_URL = "http://dominio-malicioso.com";
    assert.equal(applicationOrigin("https://preview.example/callback"), "https://preview.example");
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:4100";
    process.env.AUTH_ALLOW_INSECURE_LOCAL = "true";
    assert.equal(applicationOrigin("http://localhost:3000"), "http://127.0.0.1:4100");
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
    if (previousLocal === undefined) delete process.env.AUTH_ALLOW_INSECURE_LOCAL;
    else process.env.AUTH_ALLOW_INSECURE_LOCAL = previousLocal;
  }
});
