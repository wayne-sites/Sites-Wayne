import { configs, validateConfig } from "./configs.ts";
import { genres, type State } from "./types.ts";
import type { Context } from "./skills/context.ts";
import { vault } from "./skills/vault.ts";
import { metricas } from "./skills/metricas.ts";
import { inbox } from "./skills/inbox.ts";
import { plan } from "./skills/plan.ts";
import { roblox_gen } from "./skills/roblox_gen.ts";
import { marketingDraft } from "./marketing.ts";
export function initialState(): State {
  return {
    games: genres.map((genre) => ({
      id: genre,
      name: genre.replaceAll("_", " "),
      genre,
      placeId: "",
      status: "Ideia",
      visitas: null,
      robuxTotal: null,
      config: structuredClone(configs[genre]),
      gamepasses: [],
      daily_metrics: [],
    })),
    logs: [],
    players: [],
    expenses: [],
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Entrada inválida");
  return value as Record<string, unknown>;
}
function integer(value: unknown, max = 1_000_000_000) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw Error("Valor numérico inválido");
  return value;
}
function date(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Data inválida");
  return value;
}
export function execute(ctx: Context, input: unknown): unknown {
  const b = record(input);
  if (b.action === "generate") return roblox_gen(ctx, b.genre);
  if (b.action === "marketing") {
    const index = integer(b.index, 5);
    if (typeof b.brief !== "string" || b.brief.length > 20000)
      throw Error("Contexto inválido");
    return vault(
      ctx,
      "salida",
      "Marketing Wayne",
      marketingDraft(index, b.brief),
      ["marketing"],
    );
  }
  if (b.action === "command") {
    if (
      typeof b.command !== "string" ||
      !b.command.trim() ||
      b.command.length > 20000
    )
      throw Error("Comando inválido");
    vault(ctx, "pedido", "Comando Jarvis", b.command);
    const text = b.command.toLowerCase();
    if (/gerar|jogo|rng|simulator/.test(text))
      return roblox_gen(
        ctx,
        genres.find((g) => text.includes(g.split("_")[0].toLowerCase())) ||
          "RNG_Brainrot",
      );
    if (/métrica|metrica|robux|resumo/.test(text)) return metricas(ctx);
    if (/plano|plan |dia/.test(text)) return plan(ctx, b.command);
    return inbox(ctx, b.command);
  }
  if (b.action === "game") {
    const patch = record(b.patch);
    const game = ctx.state.games.find((g) => g.id === b.id);
    if (!game) throw Error("Jogo não encontrado");
    if (
      Object.keys(patch).some(
        (k) =>
          !["config", "gamepasses", "metric", "placeId", "status"].includes(k),
      )
    )
      throw Error("Campo não permitido");
    if (patch.config !== undefined) {
      const config = record(patch.config);
      validateConfig(game.genre, config);
      game.config = config;
    }
    if (patch.gamepasses !== undefined) {
      if (!Array.isArray(patch.gamepasses) || patch.gamepasses.length > 50)
        throw Error("Gamepasses inválidos");
      game.gamepasses = patch.gamepasses.map((v) => {
        const p = record(v);
        if (
          !/^\d{1,20}$/.test(String(p.id)) ||
          typeof p.name !== "string" ||
          !p.name.trim() ||
          p.name.length > 100
        )
          throw Error("Gamepass inválido");
        return { id: String(p.id), name: p.name, price: integer(p.price) };
      });
    }
    if (patch.metric !== undefined) {
      const m = record(patch.metric);
      const metric = {
        date: date(m.date),
        visitas: integer(m.visitas),
        robux: integer(m.robux),
      };
      game.daily_metrics = game.daily_metrics.filter(
        (x) => x.date !== metric.date,
      );
      if (game.daily_metrics.length >= 3660)
        throw Error("Limite de métricas atingido");
      game.daily_metrics.push(metric);
      game.visitas = game.daily_metrics.reduce((n, x) => n + x.visitas, 0);
      game.robuxTotal = game.daily_metrics.reduce((n, x) => n + x.robux, 0);
    }
    if (patch.placeId !== undefined) {
      if (
        typeof patch.placeId !== "string" ||
        !/^\d{0,20}$/.test(patch.placeId)
      )
        throw Error("Place ID inválido");
      game.placeId = patch.placeId;
    }
    if (patch.status !== undefined) {
      if (
        !["Ideia", "Em Dev", "Publicado", "Viral"].includes(
          String(patch.status),
        )
      )
        throw Error("Status inválido");
      game.status = patch.status as typeof game.status;
    }
    vault(
      ctx,
      "pedido",
      "Editar jogo",
      JSON.stringify({ id: game.id, patch }),
      [game.genre],
    );
    return game;
  }
  throw Error("Ação não permitida");
}
