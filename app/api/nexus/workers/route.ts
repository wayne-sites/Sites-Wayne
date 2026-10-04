import { NextRequest, NextResponse } from "next/server";
import { listNexusWorkersForUser } from "@/lib/server/nexus-worker-presence";
import { apiError, requestId } from "@/lib/server/http";
import { log } from "@/lib/server/logger";
import { getCurrentUser } from "@/lib/supabase/auth";

export async function GET(request: NextRequest) {
  const id = requestId(request);
  const user = await getCurrentUser();
  if (!user) return apiError("Autenticação necessária.", 401, id, "auth_required");

  try {
    const workers = await listNexusWorkersForUser(user.id, 25);
    return NextResponse.json(
      { workers, requestId: id },
      { headers: { "cache-control": "no-store", "x-request-id": id } },
    );
  } catch (error) {
    log("error", "nexus-worker", "presence_list_failed", { requestId: id, userId: user.id, error });
    return apiError("Não foi possível consultar os workers.", 503, id, "worker_presence_unavailable");
  }
}
