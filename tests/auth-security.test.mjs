import assert from "node:assert/strict";
import test from "node:test";
import { CAPTCHA_TOKEN_MAX_LENGTH, isAcceptableNewPassword, normalizeCaptchaToken, safeNextPath } from "../lib/auth-security.ts";

test("safeNextPath aceita somente destinos internos conhecidos", () => {
  assert.equal(safeNextPath("/conta"), "/conta");
  assert.equal(safeNextPath("/conta?aba=seguranca"), "/conta?aba=seguranca");
  assert.equal(safeNextPath("/videos"), "/conta");
});

test("safeNextPath bloqueia hosts externos, barras invertidas e controles", () => {
  const blocked = [
    "//dominio-malicioso.com",
    "/\\dominio-malicioso.com",
    "/%5Cdominio-malicioso.com",
    "/%255Cdominio-malicioso.com",
    "https://dominio-malicioso.com",
    "/conta%0d%0aLocation:%20https://dominio-malicioso.com",
    "/conta#access_token=segredo",
  ];
  for (const value of blocked) assert.equal(safeNextPath(value), "/conta", value);
});

test("senha nova exige de 12 a 128 caracteres", () => {
  assert.equal(isAcceptableNewPassword("12345678901"), false);
  assert.equal(isAcceptableNewPassword("frase-segura"), true);
  assert.equal(isAcceptableNewPassword("x".repeat(128)), true);
  assert.equal(isAcceptableNewPassword("x".repeat(129)), false);
});

test("token CAPTCHA rejeita ausência, espaços e payload excessivo", () => {
  assert.equal(normalizeCaptchaToken(undefined), "");
  assert.equal(normalizeCaptchaToken("   "), "");
  assert.equal(normalizeCaptchaToken(" captcha-valido "), "captcha-valido");
  assert.equal(normalizeCaptchaToken("x".repeat(CAPTCHA_TOKEN_MAX_LENGTH)), "x".repeat(CAPTCHA_TOKEN_MAX_LENGTH));
  assert.equal(normalizeCaptchaToken("x".repeat(CAPTCHA_TOKEN_MAX_LENGTH + 1)), "");
});
