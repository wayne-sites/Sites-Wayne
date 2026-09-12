import type { Context } from "./context.ts";
import { vault } from "./vault.ts";
export function metricas(ctx: Context) {
  const measured = ctx.state.games.filter((g) => g.robuxTotal !== null);
  const result = {
    totalVisitas: ctx.state.games.some((g) => g.visitas !== null)
      ? ctx.state.games.reduce((n, g) => n + (g.visitas ?? 0), 0)
      : null,
    totalRobux: measured.length
      ? measured.reduce((n, g) => n + (g.robuxTotal ?? 0), 0)
      : null,
    jogosPublicados: ctx.state.games.filter((g) =>
      ["Publicado", "Viral"].includes(g.status),
    ).length,
    generoMaiorReceita: measured.length
      ? [...measured].sort(
          (a, b) => (b.robuxTotal ?? 0) - (a.robuxTotal ?? 0),
        )[0].genre
      : null,
    nota: "Receita bruta informada. Não representa lucro ou saldo sacável.",
  };
  const entry = vault(
    ctx,
    "metrica",
    "Métricas Wayne",
    JSON.stringify(result, null, 2),
    ["metricas"],
  );
  return { ...result, vaultId: entry.id };
}
