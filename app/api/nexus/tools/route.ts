import { NextRequest, NextResponse } from "next/server";
import { NEXUS_TOOL_CATALOG, findToolsByCapability } from "@/lib/nexus-tool-network";

export async function GET(request: NextRequest) {
  const capability = request.nextUrl.searchParams.get("capability")?.trim().toLowerCase() || "";
  const category = request.nextUrl.searchParams.get("category")?.trim().toLowerCase() || "";
  const pricing = request.nextUrl.searchParams.get("pricing")?.trim().toLowerCase() || "";

  let tools = capability ? findToolsByCapability(capability) : NEXUS_TOOL_CATALOG;
  if (category) tools = tools.filter((tool) => tool.category.includes(category));
  if (pricing) tools = tools.filter((tool) => tool.pricingModel === pricing);

  return NextResponse.json(
    {
      tools: tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        version: tool.version,
        category: tool.category,
        description: tool.description,
        license: tool.license,
        pricingModel: tool.pricingModel,
        execution: tool.execution,
        capabilities: tool.capabilities,
        permissions: tool.permissions,
        requirements: tool.requirements || null,
        sandboxRequired: tool.sandboxRequired,
        riskLevel: tool.riskLevel,
      })),
      count: tools.length,
      filters: { capability: capability || null, category: category || null, pricing: pricing || null },
      policy: { defaultRouting: "free-first", zeroCostModeDefault: true },
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
