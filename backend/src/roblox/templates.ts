import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SystemFile } from "./types";

export interface SystemTemplate {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  files: SystemFile[];
}

/** Installable systems live at the project root, next to roblox-plugin/. */
const SYSTEMS_DIR = join(process.cwd(), "..", "roblox-systems");

function loadTemplate(id: string): SystemTemplate | null {
  const dir = join(SYSTEMS_DIR, id);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return null;

  let raw: {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    keywords?: unknown;
    files?: unknown;
  };
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }

  const files: SystemFile[] = Array.isArray(raw.files)
    ? raw.files.flatMap((entry) => {
        const record = entry as Record<string, unknown>;
        const kind = record.kind === "instance" ? "instance" : "script";
        const name = typeof record.name === "string" ? record.name : "";
        const className = typeof record.className === "string" ? record.className : "Script";
        const location =
          typeof record.location === "string" ? record.location : "ServerScriptService";
        if (!name) return [];

        const file: SystemFile = {
          kind,
          name,
          className,
          location,
          folder: typeof record.folder === "string" ? record.folder : undefined,
          properties:
            record.properties && typeof record.properties === "object"
              ? (record.properties as Record<string, unknown>)
              : undefined,
        };

        if (kind === "script" && typeof record.source === "string") {
          try {
            file.source = readFileSync(join(dir, record.source), "utf8");
          } catch {
            return []; // Missing source file — skip rather than install broken code.
          }
        }
        return [file];
      })
    : [];

  return {
    id: typeof raw.id === "string" ? raw.id : id,
    name: typeof raw.name === "string" ? raw.name : id,
    description: typeof raw.description === "string" ? raw.description : "",
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String) : [],
    files,
  };
}

export function listSystemIds(): string[] {
  try {
    return readdirSync(SYSTEMS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return []; // No roblox-systems folder yet.
  }
}

export function listSystems(): SystemTemplate[] {
  return listSystemIds()
    .map((id) => loadTemplate(id))
    .filter((template): template is SystemTemplate => template !== null);
}

export function getSystem(id: string): SystemTemplate | null {
  return loadTemplate(id);
}

/** Longest keyword wins, so "modular weapon framework" beats a bare "gun". */
export function findSystem(text: string): SystemTemplate | null {
  let best: { template: SystemTemplate; length: number } | null = null;
  for (const template of listSystems()) {
    for (const keyword of template.keywords) {
      if (text.includes(keyword) && (!best || keyword.length > best.length)) {
        best = { template, length: keyword.length };
      }
    }
  }
  return best?.template ?? null;
}
