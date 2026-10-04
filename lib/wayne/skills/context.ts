import type { State, VaultEntry, SourceFile, Genre } from "../types.ts";
export type Context = {
  state: State;
  history: VaultEntry[];
  entries: VaultEntry[];
  generation?: { genre: Genre; files: SourceFile[] };
  now: string;
  uuid: () => string;
  hash: (text: string) => string;
};
