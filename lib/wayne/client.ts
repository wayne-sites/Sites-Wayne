import type { State, VaultEntry, SourceFile } from "./types";
export const runtimeMode: string = "NEXUS";
export type ActionResult = {
  files?: SourceFile[];
  genre?: string;
  vaultId?: string;
  conteudo?: string;
};
export class WayneRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WayneRequestError";
    this.status = status;
  }
}
async function json(response: Response) {
  if (response.status === 401)
    throw new WayneRequestError("Sua sessão expirou. Entre novamente no Nexus.", 401);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.error === "string"
      ? body.error
      : "O Nexus não respondeu como esperado. Tente novamente em instantes.";
    throw new WayneRequestError(message, response.status);
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new WayneRequestError("O Nexus retornou uma resposta inválida. Tente novamente.", response.status);
  return body;
}
async function request(init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch("/api/nexus/wayne", { cache: "no-store", ...init });
  } catch {
    throw new WayneRequestError("Não foi possível conectar ao Nexus. Confira sua conexão e tente novamente.", 0);
  }
  return json(response);
}
export async function loadManager(): Promise<{
  state: State;
  vault: VaultEntry[];
}> {
  const body = await request();
  if (!Array.isArray(body.state?.games) || !Array.isArray(body.state?.players)
      || !Array.isArray(body.state?.logs) || !Array.isArray(body.vault))
    throw new WayneRequestError("Não foi possível carregar os dados do painel. Tente novamente.", 200);
  return body;
}
export async function action(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const body = await request({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!body.result || typeof body.result !== "object" || Array.isArray(body.result))
    throw new WayneRequestError("Não foi possível confirmar o resultado. Confira o Vault antes de repetir a operação.", 200);
  return body.result;
}
