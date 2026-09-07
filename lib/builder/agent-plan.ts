export type AgentPlanPage = {
  slug: string;
  title: string;
  purpose: string;
  sections: string[];
};

export type AgentPlan = {
  projectName: string;
  objective: string;
  audience: string;
  tone: string;
  conversionGoal: string;
  pages: AgentPlanPage[];
  seo: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    title: string;
    description: string;
    localIntent: string;
  };
  contentRequirements: string[];
  missingBusinessData: string[];
  risks: string[];
  buildBrief: string;
  readiness: {
    canGenerate: boolean;
    blockers: string[];
  };
};

function readString(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`agent_${field}_invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new Error(`agent_${field}_invalid`);
  return normalized;
}

function readStringArray(value: unknown, field: string, maxItems: number, maxLength: number) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`agent_${field}_invalid`);
  return value.map((item) => readString(item, field, maxLength));
}

export function validateAgentPlan(value: unknown): AgentPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("agent_plan_invalid");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 8) throw new Error("agent_pages_invalid");

  const pages = input.pages.map((page) => {
    if (!page || typeof page !== "object" || Array.isArray(page)) throw new Error("agent_page_invalid");
    const record = page as Record<string, unknown>;
    const slug = readString(record.slug, "page_slug", 60).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("agent_page_slug_invalid");
    return {
      slug,
      title: readString(record.title, "page_title", 80),
      purpose: readString(record.purpose, "page_purpose", 240),
      sections: readStringArray(record.sections, "page_sections", 12, 100),
    };
  });

  const seoInput = input.seo;
  if (!seoInput || typeof seoInput !== "object" || Array.isArray(seoInput)) throw new Error("agent_seo_invalid");
  const seo = seoInput as Record<string, unknown>;

  const readinessInput = input.readiness;
  if (!readinessInput || typeof readinessInput !== "object" || Array.isArray(readinessInput)) throw new Error("agent_readiness_invalid");
  const readiness = readinessInput as Record<string, unknown>;
  if (typeof readiness.canGenerate !== "boolean") throw new Error("agent_can_generate_invalid");

  return {
    projectName: readString(input.projectName, "project_name", 80),
    objective: readString(input.objective, "objective", 500),
    audience: readString(input.audience, "audience", 300),
    tone: readString(input.tone, "tone", 160),
    conversionGoal: readString(input.conversionGoal, "conversion_goal", 300),
    pages,
    seo: {
      primaryKeyword: readString(seo.primaryKeyword, "seo_primary", 100),
      secondaryKeywords: readStringArray(seo.secondaryKeywords, "seo_secondary", 10, 100),
      title: readString(seo.title, "seo_title", 80),
      description: readString(seo.description, "seo_description", 180),
      localIntent: readString(seo.localIntent, "seo_local_intent", 180),
    },
    contentRequirements: readStringArray(input.contentRequirements, "content_requirements", 16, 180),
    missingBusinessData: readStringArray(input.missingBusinessData, "missing_business_data", 16, 140),
    risks: readStringArray(input.risks, "risks", 12, 180),
    buildBrief: readString(input.buildBrief, "build_brief", 3500),
    readiness: {
      canGenerate: readiness.canGenerate,
      blockers: readStringArray(readiness.blockers, "blockers", 10, 180),
    },
  };
}

export const AGENT_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "projectName",
    "objective",
    "audience",
    "tone",
    "conversionGoal",
    "pages",
    "seo",
    "contentRequirements",
    "missingBusinessData",
    "risks",
    "buildBrief",
    "readiness",
  ],
  properties: {
    projectName: { type: "string" },
    objective: { type: "string" },
    audience: { type: "string" },
    tone: { type: "string" },
    conversionGoal: { type: "string" },
    pages: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "title", "purpose", "sections"],
        properties: {
          slug: { type: "string" },
          title: { type: "string" },
          purpose: { type: "string" },
          sections: { type: "array", items: { type: "string" } },
        },
      },
    },
    seo: {
      type: "object",
      additionalProperties: false,
      required: ["primaryKeyword", "secondaryKeywords", "title", "description", "localIntent"],
      properties: {
        primaryKeyword: { type: "string" },
        secondaryKeywords: { type: "array", items: { type: "string" } },
        title: { type: "string" },
        description: { type: "string" },
        localIntent: { type: "string" },
      },
    },
    contentRequirements: { type: "array", items: { type: "string" } },
    missingBusinessData: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    buildBrief: { type: "string" },
    readiness: {
      type: "object",
      additionalProperties: false,
      required: ["canGenerate", "blockers"],
      properties: {
        canGenerate: { type: "boolean" },
        blockers: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
