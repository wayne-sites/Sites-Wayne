import bundles from "../bundles.json" with { type: "json" };
import { configLua } from "../configs.ts";
import { isGenre } from "../types.ts";
import type { Context } from "./context.ts";
import { vault } from "./vault.ts";
export function roblox_gen(ctx: Context, genre: unknown) {
  if (!isGenre(genre)) throw Error("Gênero não permitido");
  const game = ctx.state.games.find((g) => g.genre === genre);
  if (!game) throw Error("Jogo não encontrado");
  const files = bundles[genre].map((f) =>
    f.arquivo.endsWith("/Config.lua")
      ? { ...f, codigoLuau: configLua(genre, game.config) }
      : { ...f },
  );
  const entry = vault(
    ctx,
    "salida",
    `Wayne Tree • ${genre}`,
    files
      .map((f) => `## ${f.arquivo}\n\n\`\`\`lua\n${f.codigoLuau}\n\`\`\``)
      .join("\n\n"),
    ["luau", genre],
  );
  ctx.generation = { genre, files };
  return { genre, files, vaultId: entry.id };
}
