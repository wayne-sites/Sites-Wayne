import "server-only";
import { isCrmAdmin } from "./crm-store";

export async function isWayneOwner(userId: string): Promise<boolean> {
  const membership = await isCrmAdmin(userId);
  return membership?.role === "owner";
}
