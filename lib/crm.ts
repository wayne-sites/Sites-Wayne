import { isUuid } from "@/lib/validation";

export const crmLeadSources = ["solucoes-corporativas", "servicos", "auditoria", "builder", "manual"] as const;
export const crmStages = ["novo", "qualificado", "proposta", "negociacao", "ganho", "perdido"] as const;
export const crmPriorities = ["baixa", "normal", "alta"] as const;

export type CrmLeadSource = (typeof crmLeadSources)[number];
export type CrmStage = (typeof crmStages)[number];
export type CrmPriority = (typeof crmPriorities)[number];
export type CrmContactKind = "email" | "whatsapp" | "other";

export type ParsedCrmLead = {
  source: CrmLeadSource;
  name: string;
  business: string;
  contact: string;
  contact_kind: CrmContactKind;
  solution: string | null;
  bottleneck: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

export type ParsedCrmLeadPatch = {
  id: string;
  patch: Partial<{
    stage: CrmStage;
    priority: CrmPriority;
    estimated_value_cents: number | null;
    next_followup_at: string | null;
    last_contacted_at: string | null;
    notes: string | null;
  }>;
};

function cleanText(value: unknown, min: number, max: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < min || cleaned.length > max) return null;
  return cleaned;
}

function optionalText(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  return cleanText(value, 1, max);
}

function detectContactKind(contact: string): CrmContactKind {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return "email";
  const digits = contact.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) return "whatsapp";
  return "other";
}

function parseDateOrNull(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 80) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
}

export function parseCrmLeadInput(value: unknown): { ok: true; data: ParsedCrmLead } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Dados do lead inválidos." };
  const input = value as Record<string, unknown>;
  if (input.consent !== true) return { ok: false, error: "É necessário autorizar o contato sobre este pedido." };
  if (typeof input.source !== "string" || !(crmLeadSources as readonly string[]).includes(input.source)) return { ok: false, error: "Origem do lead inválida." };

  const name = cleanText(input.name, 2, 120);
  const business = cleanText(input.business, 2, 160);
  const contact = cleanText(input.contact, 5, 200);
  if (!name || !business || !contact) return { ok: false, error: "Nome, negócio e contato são obrigatórios." };

  const solution = optionalText(input.solution, 120);
  const bottleneck = optionalText(input.bottleneck, 2000);
  const utm_source = optionalText(input.utm_source, 120);
  const utm_medium = optionalText(input.utm_medium, 120);
  const utm_campaign = optionalText(input.utm_campaign, 160);
  if (input.solution && !solution) return { ok: false, error: "Área de interesse inválida." };
  if (input.bottleneck && !bottleneck) return { ok: false, error: "Descrição do problema inválida." };

  return {
    ok: true,
    data: {
      source: input.source as CrmLeadSource,
      name,
      business,
      contact,
      contact_kind: detectContactKind(contact),
      solution,
      bottleneck,
      utm_source,
      utm_medium,
      utm_campaign,
    },
  };
}

export function parseCrmLeadPatchInput(value: unknown): { ok: true; data: ParsedCrmLeadPatch } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "Atualização inválida." };
  const input = value as Record<string, unknown>;
  if (!isUuid(input.id)) return { ok: false, error: "Lead inválido." };

  const patch: ParsedCrmLeadPatch["patch"] = {};

  if (input.stage !== undefined) {
    if (typeof input.stage !== "string" || !(crmStages as readonly string[]).includes(input.stage)) return { ok: false, error: "Etapa inválida." };
    patch.stage = input.stage as CrmStage;
  }

  if (input.priority !== undefined) {
    if (typeof input.priority !== "string" || !(crmPriorities as readonly string[]).includes(input.priority)) return { ok: false, error: "Prioridade inválida." };
    patch.priority = input.priority as CrmPriority;
  }

  if (input.estimated_value_cents !== undefined) {
    if (input.estimated_value_cents === null) patch.estimated_value_cents = null;
    else if (Number.isInteger(input.estimated_value_cents) && Number(input.estimated_value_cents) >= 0 && Number(input.estimated_value_cents) <= 1_000_000_000) patch.estimated_value_cents = Number(input.estimated_value_cents);
    else return { ok: false, error: "Valor estimado inválido." };
  }

  if (input.next_followup_at !== undefined) {
    const parsed = parseDateOrNull(input.next_followup_at);
    if (parsed === undefined) return { ok: false, error: "Data de follow-up inválida." };
    patch.next_followup_at = parsed;
  }

  if (input.last_contacted_at !== undefined) {
    const parsed = parseDateOrNull(input.last_contacted_at);
    if (parsed === undefined) return { ok: false, error: "Data de contato inválida." };
    patch.last_contacted_at = parsed;
  }

  if (input.notes !== undefined) {
    if (input.notes === null || input.notes === "") patch.notes = null;
    else {
      const notes = cleanText(input.notes, 1, 5000);
      if (!notes) return { ok: false, error: "Notas inválidas." };
      patch.notes = notes;
    }
  }

  if (Object.keys(patch).length === 0) return { ok: false, error: "Nenhuma alteração informada." };
  return { ok: true, data: { id: input.id, patch } };
}
