import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_PLAN_JSON_SCHEMA, validateAgentPlan } from "../lib/builder/agent-plan.ts";

const sample = {
  projectName: "Wayne Fitness",
  objective: "Gerar uma presença digital para apresentar a academia e captar contatos.",
  audience: "Adultos interessados em treino e condicionamento físico.",
  tone: "Direto, premium e motivador.",
  conversionGoal: "Levar o visitante a iniciar contato para conhecer a academia.",
  pages: [
    {
      slug: "inicio",
      title: "Wayne Fitness",
      purpose: "Apresentar proposta, benefícios e chamada principal.",
      sections: ["Hero", "Benefícios", "Planos demonstrativos", "Horários", "FAQ", "Contato"],
    },
  ],
  seo: {
    primaryKeyword: "academia",
    secondaryKeywords: ["treino", "condicionamento físico"],
    title: "Wayne Fitness | Academia",
    description: "Conheça a Wayne Fitness, seus serviços, horários e formas de contato.",
    localIntent: "Usar cidade/região apenas quando esse dado real for informado.",
  },
  contentRequirements: ["Não inventar preços", "Destacar diferenciais sem métricas falsas"],
  missingBusinessData: ["Cidade", "Telefone", "Endereço"],
  risks: ["Não apresentar depoimentos fictícios como reais"],
  buildBrief: "Crie uma landing page premium para a Wayne Fitness, responsiva, acessível e sem inventar dados reais.",
  readiness: {
    canGenerate: true,
    blockers: [],
  },
};

test("V3 valida um plano completo", () => {
  const plan = validateAgentPlan(sample);
  assert.equal(plan.projectName, "Wayne Fitness");
  assert.equal(plan.pages.length, 1);
  assert.equal(plan.readiness.canGenerate, true);
});

test("V3 rejeita slug inseguro", () => {
  assert.throws(() => validateAgentPlan({
    ...sample,
    pages: [{ ...sample.pages[0], slug: "../admin" }],
  }), /agent_page_slug_invalid/);
});

test("schema estruturado exige propriedades fechadas", () => {
  assert.equal(AGENT_PLAN_JSON_SCHEMA.additionalProperties, false);
  assert.equal(AGENT_PLAN_JSON_SCHEMA.properties.pages.items.additionalProperties, false);
  assert.equal(AGENT_PLAN_JSON_SCHEMA.properties.seo.additionalProperties, false);
});
