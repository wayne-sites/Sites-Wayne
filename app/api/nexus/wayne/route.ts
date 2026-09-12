import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  loadWayne,
  runWayne,
  WayneConflictError,
} from "@/lib/server/wayne-store";
import { apiError, requestId } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { readWayneJson, wayneOriginAllowed } from "@/lib/wayne/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const id = requestId(request);
  const user = await getCurrentUser();
  if (!user)
    return apiError("Entre na sua conta Nexus.", 401, id, "auth_required");
  try {
    return NextResponse.json(await loadWayne(user.id), {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch {
    return apiError(
      "Vault Nexus indisponível. A configuração do banco precisa estar concluída.",
      503,
      id,
      "wayne_storage_unavailable",
    );
  }
}
export async function POST(request: NextRequest) {
  const id = requestId(request);
  if (!wayneOriginAllowed(request))
    return apiError("Origem não autorizada.", 403, id, "origin_denied");
  const user = await getCurrentUser();
  if (!user)
    return apiError("Entre na sua conta Nexus.", 401, id, "auth_required");
  const limit = rateLimit(`wayne:${user.id}`, 60, 60 * 60 * 1000);
  if (!limit.allowed)
    return NextResponse.json(
      { error: "Muitas operações. Aguarde antes de tentar novamente." },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  let input: unknown;
  try {
    input = await readWayneJson(request);
  } catch {
    return apiError(
      "Entrada inválida ou maior que 100 KB.",
      400,
      id,
      "invalid_input",
    );
  }
  try {
    return NextResponse.json(await runWayne(user.id, input), {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    if (error instanceof WayneConflictError)
      return apiError(error.message, 409, id, "revision_conflict");
    const message =
      error instanceof Error ? error.message : "Falha na operação";
    if (message.startsWith("wayne_"))
      return apiError(
        "Não foi possível salvar no Nexus. Nenhuma conclusão foi confirmada.",
        503,
        id,
        "wayne_storage_unavailable",
      );
    return apiError(message, 400, id, "invalid_operation");
  }
}
