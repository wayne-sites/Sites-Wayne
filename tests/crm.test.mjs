import assert from "node:assert/strict";
import test from "node:test";
import { parseCrmLeadInput, parseCrmLeadPatchInput } from "../lib/crm.ts";

const validLead = {
  source: "solucoes-corporativas",
  name: "Cliente Nexus",
  business: "Empresa Exemplo",
  contact: "+55 (37) 99999-9999",
  solution: "CRM",
  bottleneck: "Perdemos oportunidades por falta de follow-up.",
  consent: true,
  utm_source: "  campanha-organica  ",
};

const leadId = "b560bf04-8a02-4f59-a813-508228bf21c1";

test("lead válido exige consentimento e normaliza campos", () => {
  const result = parseCrmLeadInput(validLead);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.contact_kind, "whatsapp");
    assert.equal(result.data.utm_source, "campanha-organica");
    assert.equal(result.data.source, "solucoes-corporativas");
  }
});

test("lead sem consentimento é recusado", () => {
  assert.equal(parseCrmLeadInput({ ...validLead, consent: false }).ok, false);
});

test("origem desconhecida e texto excessivo são recusados", () => {
  assert.equal(parseCrmLeadInput({ ...validLead, source: "externo" }).ok, false);
  assert.equal(parseCrmLeadInput({ ...validLead, bottleneck: "x".repeat(2001) }).ok, false);
});

test("contato por e-mail é classificado sem expor heurística no cliente", () => {
  const result = parseCrmLeadInput({ ...validLead, contact: "contato@example.com" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.contact_kind, "email");
});

test("pipeline aceita somente campos e estados controlados", () => {
  const result = parseCrmLeadPatchInput({
    id: leadId,
    stage: "proposta",
    priority: "alta",
    estimated_value_cents: 149700,
    next_followup_at: "2026-09-08T14:00:00-03:00",
    notes: "Enviar proposta revisada.",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.patch.stage, "proposta");
    assert.equal(result.data.patch.priority, "alta");
    assert.equal(result.data.patch.estimated_value_cents, 149700);
    assert.equal(result.data.patch.next_followup_at, "2026-09-08T17:00:00.000Z");
  }
});

test("pipeline recusa id, etapa, valor e patch vazio inválidos", () => {
  assert.equal(parseCrmLeadPatchInput({ id: "abc", stage: "ganho" }).ok, false);
  assert.equal(parseCrmLeadPatchInput({ id: leadId, stage: "hack" }).ok, false);
  assert.equal(parseCrmLeadPatchInput({ id: leadId, estimated_value_cents: -1 }).ok, false);
  assert.equal(parseCrmLeadPatchInput({ id: leadId }).ok, false);
});
