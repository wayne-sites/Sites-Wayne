import { isUuid } from "./validation.ts";

export const crmProposalStatuses = ["ready", "approved", "payment_pending", "paid", "expired", "rejected", "canceled", "refunded"] as const;
export type CrmProposalStatus = (typeof crmProposalStatuses)[number];

export type ParsedProposalItem = {
  title: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
};

export type ParsedProposalCreate = {
  lead_id: string;
  valid_until: string;
  notes: string | null;
  items: ParsedProposalItem[];
};

function clean(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const result = value.trim().replace(/\s+/g, " ");
  return result.length >= min && result.length <= max ? result : null;
}

export function parseCrmProposalCreateInput(value: unknown): { ok: true; data: ParsedProposalCreate } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Proposta inválida." };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.lead_id)) return { ok: false, error: "Lead inválido." };

  const date = typeof input.valid_until === "string" ? new Date(input.valid_until) : null;
  if (!date || !Number.isFinite(date.getTime())) return { ok: false, error: "Validade inválida." };
  const now = Date.now();
  if (date.getTime() <= now || date.getTime() > now + 180 * 24 * 60 * 60 * 1000) return { ok: false, error: "A validade deve ficar entre agora e 180 dias." };

  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) return { ok: false, error: "Informe de 1 a 20 itens." };
  const items: ParsedProposalItem[] = [];
  let total = 0;
  for (const raw of input.items) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Item inválido." };
    const item = raw as Record<string, unknown>;
    const title = clean(item.title, 2, 160);
    const description = item.description === undefined || item.description === null || item.description === "" ? null : clean(item.description, 1, 1200);
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price_cents);
    if (!title || (item.description && !description)) return { ok: false, error: "Título ou descrição de item inválidos." };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return { ok: false, error: "Quantidade inválida." };
    if (!Number.isInteger(unitPrice) || unitPrice < 0 || unitPrice > 1_000_000_000) return { ok: false, error: "Preço de item inválido." };
    total += quantity * unitPrice;
    if (!Number.isSafeInteger(total) || total > 1_000_000_000) return { ok: false, error: "Valor total inválido." };
    items.push({ title, description, quantity, unit_price_cents: unitPrice });
  }
  if (total <= 0) return { ok: false, error: "A proposta precisa ter valor maior que zero." };

  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null && input.notes !== "") {
    notes = clean(input.notes, 1, 5000);
    if (!notes) return { ok: false, error: "Notas inválidas." };
  }
  return { ok: true, data: { lead_id: input.lead_id as string, valid_until: date.toISOString(), notes, items } };
}

export function parseProposalDecisionInput(value: unknown): { ok: true; data: { public_id: string; action: "approve" | "reject"; approver_name: string | null } } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Decisão inválida." };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.public_id)) return { ok: false, error: "Proposta inválida." };
  if (input.action !== "approve" && input.action !== "reject") return { ok: false, error: "Ação inválida." };
  if (input.action === "reject") return { ok: true, data: { public_id: input.public_id as string, action: "reject", approver_name: null } };
  if (input.accept !== true) return { ok: false, error: "É necessário confirmar a aprovação da proposta." };
  const approver = clean(input.approver_name, 2, 120);
  if (!approver) return { ok: false, error: "Informe o nome de quem aprova." };
  return { ok: true, data: { public_id: input.public_id as string, action: "approve", approver_name: approver } };
}
