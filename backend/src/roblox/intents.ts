import type {
  ClearCommand,
  LightingCommand,
  MapCommand,
  MapKind,
  PartCommand,
  PartShape,
  PropCommand,
  PropKind,
  RobloxCommand,
  SkyCommand,
  SkyPreset,
  SpawnCommand,
  SpawnPointSpec,
} from "./types";
import { findSystem } from "./templates";

export interface ParseResult {
  command: RobloxCommand;
  /** Short confirmation shown in the transcript. */
  reply: string;
}

const COLOR_NAMES: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  purple: "#a855f7",
  pink: "#ec4899",
  white: "#ffffff",
  black: "#000000",
  gray: "#6b7280",
  grey: "#6b7280",
  brown: "#92400e",
  cyan: "#06b6d4",
  lime: "#84cc16",
  gold: "#fbbf24",
  silver: "#c0c0c0",
  neon: "#39ff14",
};

const SHAPE_KEYWORDS: Array<{ shape: PartShape; words: string[] }> = [
  { shape: "Block", words: ["block", "cube", "box", "square"] },
  { shape: "Sphere", words: ["sphere", "ball", "orb", "globe"] },
  { shape: "Cylinder", words: ["cylinder", "pillar", "column", "pole", "tube"] },
  { shape: "Wedge", words: ["wedge", "ramp", "slope", "triangle"] },
];

const PROP_KEYWORDS: Array<{ prop: PropKind; words: string[] }> = [
  { prop: "tree", words: ["tree", "bush", "plant"] },
  { prop: "house", words: ["house", "building", "hut", "shed", "cabin"] },
  { prop: "tower", words: ["tower", "spire", "castle"] },
  { prop: "wall", words: ["wall", "fence", "barrier"] },
  { prop: "platform", words: ["platform", "floor", "stage", "baseplate"] },
  { prop: "lamp", words: ["lamp", "lightpost", "streetlight", "torch"] },
];

const PRESET_KEYWORDS: Array<{ preset: SkyPreset; words: string[] }> = [
  { preset: "space", words: ["space", "galaxy", "starry", "stars", "cosmos", "outer space"] },
  { preset: "nebula", words: ["nebula", "aurora", "purple sky"] },
  { preset: "storm", words: ["storm", "stormy", "rain", "rainy", "cloudy", "overcast", "foggy", "fog"] },
  { preset: "sunset", words: ["sunset", "sunrise", "dusk", "dawn", "twilight", "evening sky", "orange sky"] },
  { preset: "night", words: ["night", "nighttime", "midnight", "dark", "darkness", "moonlight"] },
  { preset: "day", words: ["day", "daytime", "noon", "sunny", "clear sky", "blue sky", "afternoon"] },
];

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

function extractHex(text: string): string | undefined {
  const match = text.match(/#([0-9a-f]{6})\b/);
  return match ? `#${match[1]}` : undefined;
}

function extractColor(text: string): string | undefined {
  const hex = extractHex(text);
  if (hex) return hex;
  for (const [name, value] of Object.entries(COLOR_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return value;
  }
  return undefined;
}

/** Matches "10x10x10", "10, 10, 10" and "10 by 10 by 10". */
function extractTriple(text: string): string | undefined {
  const match = text.match(
    /(-?\d+(?:\.\d+)?)\s*(?:x|×|\*|,|\bby\b)\s*(-?\d+(?:\.\d+)?)\s*(?:x|×|\*|,|\bby\b)\s*(-?\d+(?:\.\d+)?)/,
  );
  return match ? `${match[1]},${match[2]},${match[3]}` : undefined;
}

/** Matches "at 0,5,0" / "at 0 5 0". */
function extractPosition(text: string): string | undefined {
  const match = text.match(
    /\bat\s+(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d+(?:\.\d+)?)/,
  );
  return match ? `${match[1]},${match[2]},${match[3]}` : undefined;
}

/** Matches "at 6pm", "18:00", "noon", "midnight". */
function extractClockTime(text: string): number | undefined {
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = ampm[2] ? Number(ampm[2]) / 60 : 0;
    if (ampm[3] === "pm" && hours < 12) hours += 12;
    if (ampm[3] === "am" && hours === 12) hours = 0;
    return hours + minutes;
  }

  const military = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (military) return Number(military[1]) + Number(military[2]) / 60;

  if (/\bnoon\b/.test(text)) return 12;
  if (/\bmidnight\b/.test(text)) return 0;
  if (/\bmorning\b/.test(text)) return 9;
  if (/\bafternoon\b/.test(text)) return 15;
  if (/\bevening\b/.test(text)) return 19;

  return undefined;
}

function detectPreset(text: string): SkyPreset | undefined {
  for (const { preset, words } of PRESET_KEYWORDS) {
    if (includesAny(text, words)) return preset;
  }
  return undefined;
}

function buildSky(text: string): SkyCommand {
  const preset = detectPreset(text) ?? "default";
  const command: SkyCommand = {
    type: "sky",
    preset,
    label: `Sky — ${preset}`,
  };
  return command;
}

function buildLighting(text: string): LightingCommand | null {
  const clockTime = extractClockTime(text);
  const wantsFog = includesAny(text, ["fog", "foggy", "mist", "haze", "smoke"]);
  const wantsAtmosphere = includesAny(text, ["atmosphere", "air", "haze"]);
  const wantsShadows = includesAny(text, ["shadows", "shadow"]);
  const brighter = includesAny(text, ["brighter", "brighten", "more light"]);
  const darker = includesAny(text, ["darker", "dim", "dimmer", "less light"]);

  if (clockTime === undefined && !wantsFog && !wantsAtmosphere && !wantsShadows && !brighter && !darker) {
    return null;
  }

  const command: LightingCommand = {
    type: "lighting",
    label: "Lighting",
  };
  if (clockTime !== undefined) command.clockTime = clockTime;
  if (wantsFog) command.fog = true;
  if (wantsAtmosphere) command.atmosphere = true;
  if (wantsShadows) command.globalShadows = true;
  if (brighter) command.brightness = 4;
  if (darker) command.brightness = 1;

  if (brighter || darker) command.label = brighter ? "Lighting — brighter" : "Lighting — darker";
  else if (clockTime !== undefined) {
    const hours = Math.floor(clockTime);
    command.label = `Lighting — time ${hours}:00`;
  }

  return command;
}

function buildPart(text: string): PartCommand | null {
  let shape: PartShape | undefined;
  for (const { shape: candidate, words } of SHAPE_KEYWORDS) {
    if (includesAny(text, words)) {
      shape = candidate;
      break;
    }
  }
  if (!shape) return null;

  const command: PartCommand = {
    type: "part",
    shape,
    label: `Part — ${shape}`,
    anchored: true,
  };

  const triple = extractTriple(text);
  if (triple) {
    command.size = triple;
    command.label += ` ${triple.replaceAll(",", "×")}`;
  }
  const color = extractColor(text);
  if (color) {
    command.color = color;
    command.label += ` ${color}`;
  }
  const position = extractPosition(text);
  if (position) {
    command.position = position;
    command.label += ` @ ${position.replaceAll(",", " ")}`;
  }

  return command;
}

const MAP_KEYWORDS: Array<{ map: MapKind; words: string[] }> = [
  {
    map: "warmap",
    words: ["warmap", "warmup map", "warm up map", "warm-up map", "warmup", "warm up", "warm-up"],
  },
  { map: "arena", words: ["arena", "practice map", "training map", "bootcamp"] },
];

/** Matches "a-spawn", "a spawn", "site a", "spawn a", "a site", "aspawn". */
function mentionsSpawn(text: string, id: "A" | "B"): boolean {
  const letter = id.toLowerCase();
  return [
    `${letter}-spawn`,
    `${letter}spawn`,
    `${letter} spawn`,
    `${letter}-site`,
    `${letter} site`,
    `site ${letter}`,
    `spawn ${letter}`,
  ].some((pattern) => text.includes(pattern));
}

function buildMap(text: string): MapCommand | null {
  let map: MapKind | undefined;
  for (const { map: candidate, words } of MAP_KEYWORDS) {
    if (includesAny(text, words)) {
      map = candidate;
      break;
    }
  }
  if (!map) return null;

  const hasA = mentionsSpawn(text, "A");
  const hasB = mentionsSpawn(text, "B");
  // A warm-up map implies two sides unless the user named only one.
  const ids: Array<"A" | "B"> =
    hasA && !hasB ? ["A"] : hasB && !hasA ? ["B"] : ["A", "B"];

  const spawns: SpawnPointSpec[] = ids.map((id) => ({ id }));
  const label = `${map === "warmap" ? "Warm-up map" : "Arena"} — spawns ${ids.join(" and ")}`;

  return { type: "map", map, spawns, label };
}

function buildProp(text: string): PropCommand | null {
  let prop: PropKind | undefined;
  for (const { prop: candidate, words } of PROP_KEYWORDS) {
    if (includesAny(text, words)) {
      prop = candidate;
      break;
    }
  }
  if (!prop) return null;

  const command: PropCommand = {
    type: "prop",
    prop,
    label: `Prop — ${prop}`,
  };
  const position = extractPosition(text);
  if (position) {
    command.position = position;
    command.label += ` @ ${position.replaceAll(",", " ")}`;
  }
  const large = text.match(/\b(huge|giant|big|large|massive)\b/);
  if (large) command.scale = 2;
  const small = text.match(/\b(small|tiny|little|mini)\b/);
  if (small) command.scale = 0.5;
  return command;
}

function buildClear(text: string): ClearCommand | null {
  const mentionsParts = includesAny(text, ["part", "parts", "object", "objects", "prop", "props", "tree", "trees", "building", "buildings"]);
  const mentionsSky = includesAny(text, ["sky", "skybox"]);
  const mentionsLighting = includesAny(text, ["light", "lights", "lighting", "time"]);

  const wantsClear = includesAny(text, ["clear", "remove", "delete", "clean", "reset", "wipe", "erase"]);
  if (!wantsClear) return null;

  let target: ClearCommand["target"] = "all";
  if (mentionsParts && !mentionsSky && !mentionsLighting) target = "parts";
  else if (mentionsSky && !mentionsParts && !mentionsLighting) target = "sky";
  else if (mentionsLighting && !mentionsParts && !mentionsSky) target = "lighting";

  return {
    type: "clear",
    target,
    label: `Clear — ${target}`,
  };
}

/**
 * Turns a natural-language sentence into a build command.
 * Returns null when nothing matches — the caller decides how to phrase that.
 */
export function parseIntent(raw: string): ParseResult | null {
  const text = normalize(raw);
  if (!text) return null;

  const clear = buildClear(text);
  if (clear) return { command: clear, reply: clear.label };

  // Installable systems are matched before the simple build commands so that
  // "build a weapon framework" reaches the framework, not the prop builder.
  const system = findSystem(text);
  if (system) {
    return {
      command: {
        type: "system",
        system: system.id,
        name: system.name,
        description: system.description,
        files: system.files,
        label: `System — ${system.name}`,
      },
      reply: `${system.name} — installs ${system.files.length} files`,
    };
  }

  const sky = buildSky(text);
  if (sky.preset !== "default" || includesAny(text, ["sky", "skybox"])) {
    return { command: sky, reply: `Sky applied — preset "${sky.preset}"` };
  }

  const map = buildMap(text);
  if (map) return { command: map, reply: map.label };

  const prop = buildProp(text);
  if (prop) return { command: prop, reply: prop.label };

  const part = buildPart(text);
  if (part) return { command: part, reply: part.label };

  if (includesAny(text, ["spawn", "spawnpoint", "spawn location", "start point"])) {
    const command: SpawnCommand = { type: "spawn", label: "Spawn point" };
    const position = extractPosition(text);
    if (position) {
      command.position = position;
      command.label += ` @ ${position.replaceAll(",", " ")}`;
    }
    return { command, reply: command.label };
  }

  const lighting = buildLighting(text);
  if (lighting) return { command: lighting, reply: lighting.label };

  return null;
}

export function describeCommand(command: RobloxCommand): string {
  return command.label;
}
