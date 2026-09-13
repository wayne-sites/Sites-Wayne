import assert from "node:assert/strict";
import test from "node:test";
import { parseCrmProposalCreateInput, parseProposalDecisionInput } from "../lib/crm-proposals.ts";

const leadId = "b560bf04-8a02-4f59-a813-508228bf21c1";
const publicId = "5db5c471-78de-4134-b0b7-1fb8ed08a6f4";

function future(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

test("proposal aceita lead qualificado, itens e validade futura", () => {
  const result = parseCrmProposalCreateInput({
    lead_id: leadId,
    valid_until: future(),
    notes: "Condições comerciais válidas no período.",
    items: [
      { title: "Implantação CRM", description: "Configuração inicial", quantity: 1, unit_price_cents: 69700 },
      { title: "Automação", quantity: 2, unit_price_cents: 15000 },
    ],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.items[0].unit_price_cents, 69700);
  }
});

test("proposal recusa validade passada, total zero e lead inválido", () => {
  assert.equal(parseCrmProposalCreateInput({ lead_id: "x", valid_until: future(), items: [{ title: "CRM", quantity: 1, unit_price_cents: 100 }] }).ok, false);
  assert.equal(parseCrmProposalCreateInput({ lead_id: leadId, valid_until: new Date(Date.now() - 1000).toISOString(), items: [{ title: "CRM", quantity: 1, unit_price_cents: 100 }] }).ok, false);
  assert.equal(parseCrmProposalCreateInput({ lead_id: leadId, valid_until: future(), items: [{ title: "CRM", quantity: 1, unit_price_cents: 0 }] }).ok, false);
});

test("approval exige aceite e nome", () => {
  assert.equal(parseProposalDecisionInput({ public_id: publicId, action: "approve", accept: true, approver_name: "Cliente Nexus" }).ok, true);
  assert.equal(parseProposalDecisionInput({ public_id: publicId, action: "approve", accept: false, approver_name: "Cliente Nexus" }).ok, false);
  assert.equal(parseProposalDecisionInput({ public_id: publicId, action: "approve", accept: true, approver_name: "A" }).ok, false);
});

test("rejection não exige dados de aprovação", () => {
  const result = parseProposalDecisionInput({ public_id: publicId, action: "reject" });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.action, "reject");
});
