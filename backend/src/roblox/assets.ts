import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface AssetEntry {
  id: string;
  /** Display name; falls back to the asset id when the user gives none. */
  name: string;
  /** Roblox asset id, passed to InsertService:LoadAsset inside Studio. */
  assetId: string;
  /** The page the asset was linked from, when it came from a URL. */
  url: string | null;
  createdAt: number;
}

interface State {
  assets: AssetEntry[];
}

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "assets.json");

let state: State = { assets: [] };

function load(): void {
  try {
    if (!existsSync(FILE)) return;
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<State>;
    if (Array.isArray(parsed.assets)) state.assets = parsed.assets;
  } catch {
    // Corrupt file — start clean rather than crash the backend.
  }
}

function save(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Best-effort persistence.
  }
}

load();

export function listAssets(): AssetEntry[] {
  return state.assets;
}

export function getAsset(id: string): AssetEntry | undefined {
  return state.assets.find((a) => a.id === id);
}

/**
 * Reads a Roblox asset reference from either a full URL
 * (create.roblox.com/store/asset/…, roblox.com/library/…, roblox.com/catalog/…)
 * or a bare numeric asset id.
 */
export function parseAssetRef(input: string): { assetId: string; url: string | null } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const isUrl = /^https?:\/\//i.test(trimmed);
  const fromPath = trimmed.match(/(?:asset|library|catalog)\/(\d{4,})/i);
  const fromBare = isUrl ? null : trimmed.match(/^(\d{4,})$/);
  const match = fromPath ?? fromBare;

  if (!match) return null;
  return { assetId: match[1], url: isUrl ? trimmed : null };
}

export function addAsset(input: { name: string; url: string }): AssetEntry | null {
  const ref = parseAssetRef(input.url);
  if (!ref) return null;

  const asset: AssetEntry = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 80) || ref.assetId,
    assetId: ref.assetId,
    url: ref.url,
    createdAt: Date.now(),
  };
  state.assets.push(asset);
  save();
  return asset;
}

export function removeAsset(id: string): boolean {
  const before = state.assets.length;
  state.assets = state.assets.filter((a) => a.id !== id);
  if (state.assets.length === before) return false;
  save();
  return true;
}
