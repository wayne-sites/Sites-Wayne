import assert from "node:assert/strict";
import test from "node:test";
import { parseCrmLeadInput } from "../lib/crm.ts";

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
