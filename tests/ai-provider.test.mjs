import assert from "node:assert/strict";
import test from "node:test";
import { getAIProviderConfig } from "../lib/ai/config.ts";

const keys = [
  "AI_PROVIDER",
  "AI_API_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "GROQ_API_KEY",
  "GROQ_API_URL",
  "GROQ_MODEL",
  "OLLAMA_OPENAI_URL",
  "OLLAMA_MODEL",
  "NODE_ENV",
];

function snapshotEnv() {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of keys) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearAIEnv() {
  for (const key of keys) delete process.env[key];
}

test("Groq usa endpoint oficial e modelo de produção por padrão", { concurrency: false }, () => {
  const before = snapshotEnv();
  try {
    clearAIEnv();
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-only-key";
    const provider = getAIProviderConfig();
    assert.equal(provider?.name, "groq");
    assert.equal(provider?.apiUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(provider?.model, "openai/gpt-oss-20b");
    assert.equal(provider?.apiKey, "test-only-key");
  } finally {
    restoreEnv(before);
  }
});

test("Groq recusa host diferente de api.groq.com", { concurrency: false }, () => {
  const before = snapshotEnv();
  try {
    clearAIEnv();
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-only-key";
    process.env.GROQ_API_URL = "https://example.com/openai/v1/chat/completions";
    assert.throws(() => getAIProviderConfig(), /groq_provider_host_invalid/);
  } finally {
    restoreEnv(before);
  }
});

test("Ollama aceita somente loopback e nunca produção", { concurrency: false }, () => {
  const before = snapshotEnv();
  try {
    clearAIEnv();
    process.env.AI_PROVIDER = "ollama";
    process.env.NODE_ENV = "development";
    const provider = getAIProviderConfig();
    assert.equal(provider?.name, "ollama");
    assert.equal(provider?.apiUrl, "http://127.0.0.1:11434/v1/chat/completions");
    assert.equal(provider?.model, "jarvis-local");

    process.env.OLLAMA_OPENAI_URL = "http://192.168.0.2:11434/v1/chat/completions";
    assert.throws(() => getAIProviderConfig(), /ollama_must_use_loopback/);

    process.env.OLLAMA_OPENAI_URL = "http://127.0.0.1:11434/v1/chat/completions";
    process.env.NODE_ENV = "production";
    assert.throws(() => getAIProviderConfig(), /ollama_not_allowed_in_production/);
  } finally {
    restoreEnv(before);
  }
});

test("provider sem credencial não finge estar configurado", { concurrency: false }, () => {
  const before = snapshotEnv();
  try {
    clearAIEnv();
    process.env.AI_PROVIDER = "groq";
    assert.equal(getAIProviderConfig(), null);
  } finally {
    restoreEnv(before);
  }
});
