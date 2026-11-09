export type SkyPreset = "default" | "day" | "sunset" | "night" | "space" | "storm" | "nebula";

export type PartShape = "Block" | "Sphere" | "Cylinder" | "Wedge";

export type PropKind = "tree" | "house" | "tower" | "wall" | "platform" | "lamp";

export type CommandType =
  | "sky"
  | "lighting"
  | "part"
  | "spawn"
  | "prop"
  | "clear"
  | "system"
  | "map";

export type MapKind = "warmap" | "arena";

export interface SpawnPointSpec {
  id: "A" | "B";
  position?: string;
}

interface BaseCommand {
  type: CommandType;
  /** Human-readable summary shown in the UI. */
  label: string;
}

export interface SkyCommand extends BaseCommand {
  type: "sky";
  preset: SkyPreset;
  starCount?: number;
}

export interface LightingCommand extends BaseCommand {
  type: "lighting";
  clockTime?: number; // 0-24
  brightness?: number;
  ambient?: string; // hex
  outdoorAmbient?: string; // hex
  globalShadows?: boolean;
  fog?: boolean;
  atmosphere?: boolean;
}

export interface PartCommand extends BaseCommand {
  type: "part";
  shape: PartShape;
  size?: string; // "10,10,10"
  color?: string; // hex or colour name
  position?: string; // "0,5,0"
  anchored?: boolean;
}

export interface SpawnCommand extends BaseCommand {
  type: "spawn";
  position?: string;
}

export interface PropCommand extends BaseCommand {
  type: "prop";
  prop: PropKind;
  position?: string;
  /** Multiplier applied to the prop's default dimensions. */
  scale?: number;
}

export interface ClearCommand extends BaseCommand {
  type: "clear";
  target: "all" | "parts" | "sky" | "lighting";
}

/** One file a system template installs into the place. */
export interface SystemFile {
  kind: "script" | "instance";
  name: string;
  className: string;
  /** Service name, or "StarterPlayerScripts" for StarterPlayer.StarterPlayerScripts. */
  location: string;
  folder?: string;
  /** Luau source, present when kind === "script". */
  source?: string;
  properties?: Record<string, unknown>;
}

export interface SystemCommand extends BaseCommand {
  type: "system";
  system: string;
  name: string;
  description: string;
  files: SystemFile[];
}

export interface MapCommand extends BaseCommand {
  type: "map";
  map: MapKind;
  spawns: SpawnPointSpec[];
}

export type RobloxCommand =
  | SkyCommand
  | LightingCommand
  | PartCommand
  | SpawnCommand
  | PropCommand
  | ClearCommand
  | SystemCommand
  | MapCommand;
