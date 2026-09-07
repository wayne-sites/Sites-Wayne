export const crmLeadSources = ["solucoes-corporativas", "servicos", "auditoria", "builder", "manual"] as const;
export type CrmLeadSource = (typeof crmLeadSources)[number];
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
