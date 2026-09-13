import type { Genre } from "./types.ts";
export const configs: Record<Genre, Record<string, unknown>> = {
  RNG_Brainrot: {
    Genre: "RNG_Brainrot",
    RollCost: 10,
    StealSeconds: 10,
    BaseLock: 60,
    Brainrots: [
      { name: "Noobini", weight: 5000, income: 1 },
      { name: "Ballerina", weight: 2500, income: 2 },
      { name: "Tung Tung", weight: 1500, income: 4 },
      { name: "Tralalero", weight: 700, income: 8 },
      { name: "Bombardino", weight: 250, income: 16 },
      { name: "Garama", weight: 50, income: 40 },
    ],
  },
  Simulator: {
    Genre: "Simulator",
    ClickReward: 1,
    Pets: [
      { name: "Dog", weight: 60, power: 1 },
      { name: "Cat", weight: 30, power: 2 },
      { name: "Dragon", weight: 9, power: 5 },
      { name: "God", weight: 1, power: 12 },
    ],
    Eggs: [
      { name: "Básico", cost: 25 },
      { name: "Prata", cost: 100 },
      { name: "Ouro", cost: 250 },
    ],
  },
  Tycoon: {
    Genre: "Tycoon",
    TycoonButtons: [
      { id: "Dropper1", cost: 0, income: 1 },
      { id: "Dropper2", cost: 50, income: 3 },
      { id: "Upgrade", cost: 200, income: 8 },
    ],
  },
  Horror_Doors: {
    Genre: "Horror_Doors",
    Entities: {
      Rush: { speed: 35, damage: 100 },
      Figure: { speed: 16, damage: 35 },
    },
  },
  Obby: { Genre: "Obby", Checkpoints: 100, CheckpointReward: 5 },
  Shooter_BedWars: {
    Genre: "Shooter_BedWars",
    WeaponConfig: {
      Rifle: { damage: 20, range: 500, cooldown: 0.5, magazine: 12, reload: 2 },
    },
  },
  Roleplay_Brookhaven: {
    Genre: "Roleplay_Brookhaven",
    Houses: 8,
    CarSpeed: 35,
  },
};
function shape(value: unknown, base: unknown): boolean {
  if (typeof base === "number")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100000
    );
  if (typeof base === "string")
    return typeof value === "string" && value.length > 0 && value.length < 100;
  if (Array.isArray(base))
    return (
      Array.isArray(value) &&
      value.length === base.length &&
      value.every((v, i) => shape(v, base[i]))
    );
  if (base && typeof base === "object")
    return (
      !!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === Object.keys(base).length &&
      Object.entries(base).every(([k, v]) =>
        shape((value as Record<string, unknown>)[k], v),
      )
    );
  return false;
}
export function validateConfig(genre: Genre, c: Record<string, unknown>) {
  if (!shape(c, configs[genre]) || c.Genre !== genre)
    throw Error("Config não corresponde ao gênero");
  for (const [key, total] of [
    ["Brainrots", 10000],
    ["Pets", 100],
  ] as const) {
    if (c[key]) {
      const entries = c[key] as { name: string; weight: number }[];
      if (
        entries.some((e) => !Number.isInteger(e.weight)) ||
        entries.reduce((n, e) => n + e.weight, 0) !== total ||
        new Set(entries.map((e) => e.name)).size !== entries.length
      )
        throw Error("Probabilidades devem somar 100%, com nomes únicos");
    }
  }
  if (
    genre === "RNG_Brainrot" &&
    (Number(c.StealSeconds) < 10 ||
      Number(c.BaseLock) !== 60 ||
      !Number.isInteger(c.RollCost))
  )
    throw Error("RNG exige roubo >=10s, proteção 60s e custo inteiro");
  if (genre === "Obby" && c.Checkpoints !== 100)
    throw Error("Wayne Tree exige 100 checkpoints");
  if (genre === "Shooter_BedWars") {
    const rifle = (
      c.WeaponConfig as { Rifle: { range: number; cooldown: number } }
    ).Rifle;
    if (rifle.range > 500 || rifle.cooldown < 0.5)
      throw Error("Arma ultrapassa limites do servidor");
  }
}
function luau(value: unknown): string {
  if (typeof value === "string")
    return (
      '"' +
      Array.from(value)
        .map((c) => {
          const n = c.charCodeAt(0);
          return c === '"'
            ? '\\"'
            : c === "\\"
              ? "\\\\"
              : n < 32
                ? "\\" + String(n).padStart(3, "0")
                : c;
        })
        .join("") +
      '"'
    );
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return "{" + value.map(luau).join(",") + "}";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .map(([k, v]) => "[" + luau(k) + "]=" + luau(v))
        .join(",") +
      "}"
    );
  throw Error("Valor não serializável");
}
export function configLua(genre: Genre, c: Record<string, unknown>) {
  validateConfig(genre, c);
  return "--!strict\nreturn table.freeze(" + luau(c) + ")\n";
}
