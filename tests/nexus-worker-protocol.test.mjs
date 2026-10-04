import assert from "node:assert/strict";
import test from "node:test";
import { parseNexusWorkerAnnouncement, selectNexusWorker } from "../lib/nexus-worker-protocol.ts";

const announcement = {
  protocolVersion: "1",
  name: "Worker Linux",
  platform: "linux",
  tools: ["ffmpeg", "ollama"],
  capabilities: ["video.encode", "ai.chat"],
  resources: { cpuCores: 4, ramMb: 4096, gpu: false, gpuName: null },
};

test("worker announcement válido normaliza listas e recursos", () => {
  const result = parseNexusWorkerAnnouncement({ ...announcement, tools: ["ffmpeg", "ffmpeg", "ollama"] });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data.tools, ["ffmpeg", "ollama"]);
    assert.equal(result.data.platform, "linux");
  }
});

test("worker protocol desconhecido falha fechado", () => {
  const result = parseNexusWorkerAnnouncement({ ...announcement, protocolVersion: "999" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "worker_protocol_unsupported");
});

test("scheduler não escolhe worker offline ou stale", () => {
  const workers = [
    { ...announcement, id: "w1", status: "offline", lastSeenAt: "2026-09-07T23:50:00.000Z" },
    { ...announcement, id: "w2", status: "online", lastSeenAt: "2026-09-07T23:40:00.000Z" },
  ];
  const selected = selectNexusWorker(workers, { capability: "video.encode", toolId: "ffmpeg" }, new Date("2026-09-07T23:50:30.000Z"));
  assert.equal(selected, null);
});

test("scheduler prefere CPU worker para tarefa sem GPU obrigatória", () => {
  const base = { ...announcement, status: "online", lastSeenAt: "2026-09-07T23:50:00.000Z" };
  const workers = [
    { ...base, id: "gpu", name: "GPU Worker", resources: { cpuCores: 8, ramMb: 8192, gpu: true, gpuName: "GPU" } },
    { ...base, id: "cpu", name: "CPU Worker", resources: { cpuCores: 4, ramMb: 4096, gpu: false, gpuName: null } },
  ];
  const selected = selectNexusWorker(workers, { capability: "video.encode", toolId: "ffmpeg" }, new Date("2026-09-07T23:50:30.000Z"));
  assert.equal(selected?.id, "cpu");
});

test("scheduler exige GPU quando solicitado", () => {
  const base = { ...announcement, status: "online", lastSeenAt: "2026-09-07T23:50:00.000Z" };
  const workers = [
    { ...base, id: "cpu", resources: { cpuCores: 8, ramMb: 16384, gpu: false, gpuName: null } },
    { ...base, id: "gpu", resources: { cpuCores: 4, ramMb: 8192, gpu: true, gpuName: "GPU" } },
  ];
  const selected = selectNexusWorker(workers, { capability: "video.encode", toolId: "ffmpeg", gpuRequired: true }, new Date("2026-09-07T23:50:30.000Z"));
  assert.equal(selected?.id, "gpu");
});
