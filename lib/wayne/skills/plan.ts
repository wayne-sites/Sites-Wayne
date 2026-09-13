import type { Context } from "./context.ts";
import { vault } from "./vault.ts";
export function plan(ctx: Context, goal: string) {
  const ideas = ctx.history.filter((e) => e.tipo === "crudo").slice(0, 5);
  return vault(
    ctx,
    "plan",
    "Plano diário",
    `# Plano de hoje\n\n${goal}\n\n- 07:00 — resumo\n- 09:00 — escolher uma entrega\n- 14:00 — registrar métricas\n- 19:00 — registrar resultado e bloqueadores\n\n${ideas.map((e) => `- ${e.titulo}`).join("\n")}\n\nHorários de referência; nenhuma execução automática foi agendada.`,
    ["plan"],
  );
}
