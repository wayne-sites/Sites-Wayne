export const genres = [
  "RNG_Brainrot",
  "Simulator",
  "Tycoon",
  "Horror_Doors",
  "Obby",
  "Shooter_BedWars",
  "Roleplay_Brookhaven",
] as const;
export type Genre = (typeof genres)[number];
export type VaultType =
  | "crudo"
  | "medio"
  | "pedido"
  | "salida"
  | "metrica"
  | "plan";
export type SourceFile = { arquivo: string; codigoLuau: string; ordem: number };
export type Metric = { date: string; visitas: number; robux: number };
export type Game = {
  id: string;
  nexusProjectId?: string;
  name: string;
  genre: Genre;
  placeId: string;
  status: "Ideia" | "Em Dev" | "Publicado" | "Viral";
  visitas: number | null;
  robuxTotal: number | null;
  config: Record<string, unknown>;
  gamepasses: { id: string; name: string; price: number }[];
  daily_metrics: Metric[];
};
export type VaultEntry = {
  id: string;
  tipo: VaultType;
  titulo: string;
  conteudo: string;
  data: string;
  tags: string[];
  file_path: string;
  sha256: string;
};
export type Log = {
  id: string;
  gameId: string;
  userId: string;
  motivo: string;
  data: string;
};
export type PlayerData = {
  gameId: string;
  userId: string;
  username: string;
  moedas: number;
  level: number;
  inventario: Record<string, number>;
};
export type State = {
  games: Game[];
  logs: Log[];
  players: PlayerData[];
  expenses: { date: string; amount: number; description: string }[];
};
export function isGenre(value: unknown): value is Genre {
  return (
    typeof value === "string" && (genres as readonly string[]).includes(value)
  );
}
