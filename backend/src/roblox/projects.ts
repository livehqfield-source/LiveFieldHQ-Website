import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Project {
  id: string;
  name: string;
  /** Absolute path to a .rbxl/.rbxlx place file, if the project has one. */
  filePath: string | null;
  /** Published place id, if known. Used to reliably match Studio's open place. */
  placeId: string | null;
  createdAt: number;
}

export interface StudioPlace {
  online: boolean;
  lastSeen: number | null;
  placeId: string | null;
  placeName: string | null;
}

interface State {
  projects: Project[];
  activeId: string | null;
  studio: StudioPlace;
}

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "projects.json");

let state: State = {
  projects: [],
  activeId: null,
  studio: { online: false, lastSeen: null, placeId: null, placeName: null },
};

function load(): void {
  try {
    if (!existsSync(FILE)) return;
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<State>;
    if (Array.isArray(parsed.projects)) state.projects = parsed.projects;
    state.activeId = typeof parsed.activeId === "string" ? parsed.activeId : null;
    if (parsed.studio) state.studio = { ...state.studio, ...parsed.studio };
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

export function listProjects(): Project[] {
  return state.projects;
}

export function getProject(id: string): Project | undefined {
  return state.projects.find((p) => p.id === id);
}

export function getActiveProject(): Project | null {
  return state.activeId ? (getProject(state.activeId) ?? null) : null;
}

export function addProject(input: { name: string; filePath?: string; placeId?: string }): Project {
  const project: Project = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 80),
    filePath: input.filePath?.trim() ? input.filePath.trim() : null,
    placeId: input.placeId?.trim() ? input.placeId.trim() : null,
    createdAt: Date.now(),
  };
  state.projects.push(project);
  save();
  return project;
}

export function removeProject(id: string): boolean {
  const before = state.projects.length;
  state.projects = state.projects.filter((p) => p.id !== id);
  if (state.projects.length === before) return false;
  if (state.activeId === id) state.activeId = null;
  save();
  return true;
}

export function setActiveProject(id: string | null): void {
  state.activeId = id && getProject(id) ? id : null;
  save();
}

export function getStudioPlace(): StudioPlace {
  return state.studio;
}

export function setStudioPlace(place: Partial<StudioPlace>): void {
  state.studio = { ...state.studio, ...place, lastSeen: Date.now() };
  save();
}

/**
 * Candidate place-file folders, relative to the backend's working directory
 * (Website/backend). The user's places live in the project root's Roblox folder,
 * but a Website/Roblox folder is also common.
 */
export const PLACE_DIR_CANDIDATES = [
  join(process.cwd(), "..", "Roblox"), // Website/Roblox
  join(process.cwd(), "..", "..", "Roblox"), // <project>/Roblox
  join(process.cwd(), "..", "..", "..", "Documents", "Roblox"), // Documents/Roblox
];

/** Recursively finds .rbxl/.rbxlx place files, skipping Studio lock files. */
export function discoverPlaceFiles(dir: string, maxDepth = 3): string[] {
  const found: string[] = [];

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // Missing or unreadable folder — not an error for discovery.
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && /\.rbxlx?$/i.test(entry.name)) {
        found.push(full);
      }
    }
  }

  walk(dir, 0);
  return found.sort();
}

/**
 * Adds projects for place files that are not registered yet, so the list is
 * populated from the user's own files instead of starting empty.
 */
export function discoverProjects(dir?: string): {
  added: Project[];
  skipped: number;
  scanned: number;
} {
  const existing = new Set(
    listProjects()
      .map((p) => p.filePath)
      .filter((p): p is string => Boolean(p)),
  );

  const dirs = dir ? [dir] : PLACE_DIR_CANDIDATES;
  const files = [...new Set(dirs.flatMap((d) => discoverPlaceFiles(d)))].sort();
  const added: Project[] = [];

  for (const file of files) {
    if (existing.has(file)) continue;
    const base = file.split(/[\\/]/).pop() ?? file;
    const name = base.replace(/\.rbxlx?$/i, "");
    added.push(addProject({ name, filePath: file }));
  }

  return { added, skipped: files.length - added.length, scanned: files.length };
}
