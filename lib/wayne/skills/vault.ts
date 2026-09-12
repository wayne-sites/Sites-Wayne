import type { Context } from "./context.ts";
import type { VaultEntry, VaultType } from "../types.ts";
export function vault(
  ctx: Context,
  tipo: VaultType,
  titulo: string,
  conteudo: string,
  tags: string[] = [],
): VaultEntry {
  if (!conteudo.trim() || conteudo.length > 200000)
    throw Error("Conteúdo do Vault inválido");
  const id = ctx.uuid();
  const folder =
    tipo === "pedido"
      ? "pedidos"
      : ["salida", "metrica", "plan"].includes(tipo)
        ? "salidas"
        : tipo;
  const entry = {
    id,
    tipo,
    titulo: titulo.slice(0, 160),
    conteudo,
    data: ctx.now,
    tags,
    file_path: `vault/${folder}/${id}.md`,
    sha256: ctx.hash(conteudo),
  };
  ctx.entries.push(entry);
  return entry;
}
