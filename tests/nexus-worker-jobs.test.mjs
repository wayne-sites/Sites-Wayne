import assert from "node:assert/strict";
import test from "node:test";
import { parseNexusWorkerJobCompletion, parseNexusWorkerJobRequest } from "../lib/nexus-worker-jobs.ts";

const projectId = "38274a8f-8a38-48c7-906c-a1cacef799f0";
const jobId = "0fed1948-de88-41f7-a948-2c0f079f9ff7";
const leaseId = "0b526645-2d26-4941-b75c-cdd621fc6dbc";

test("worker job request aceita somente zero cost e input objeto", () => {
  const result = parseNexusWorkerJobRequest({
    projectId,
    capability: "data.json.validate",
    input: { text: "{}" },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.zeroCostMode, true);
});

test("worker job request bloqueia execução paga", () => {
  const result = parseNexusWorkerJobRequest({
    projectId,
    capability: "data.json.validate",
    input: { text: "{}" },
    zeroCostMode: false,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "paid_execution_disabled");
});

test("worker job request rejeita input não estruturado", () => {
  const result = parseNexusWorkerJobRequest({
    projectId,
    capability: "data.json.validate",
    input: "rm -rf /",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "job_input_invalid");
});

test("worker completion exige lease e status suportado", () => {
  const result = parseNexusWorkerJobCompletion({
    jobId,
    leaseId,
    status: "succeeded",
    output: { valid: true },
  });
  assert.equal(result.ok, true);
});

test("worker completion failed exige erro", () => {
  const result = parseNexusWorkerJobCompletion({
    jobId,
    leaseId,
    status: "failed",
    output: null,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "job_error_required");
});
