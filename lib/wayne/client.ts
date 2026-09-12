import type { State, VaultEntry, SourceFile } from "./types";
export const runtimeMode: string = "NEXUS";
export type ActionResult = {
  files?: SourceFile[];
  genre?: string;
  vaultId?: string;
  conteudo?: string;
};
async function json(response: Response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Nexus indisponível");
  return body;
}
export async function loadManager(): Promise<{
  state: State;
  vault: VaultEntry[];
}> {
  return json(await fetch("/api/nexus/wayne", { cache: "no-store" }));
}
export async function action(
  input: Record<string, unknown>,
): Promise<ActionResult> {
  const response = await fetch("/api/nexus/wayne", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await json(response)).result;
}
