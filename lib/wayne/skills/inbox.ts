import type { Context } from "./context.ts";
import { vault } from "./vault.ts";
export function inbox(ctx: Context, text: string) {
  return vault(ctx, "crudo", "Inbox Jarvis", text, ["inbox"]);
}
