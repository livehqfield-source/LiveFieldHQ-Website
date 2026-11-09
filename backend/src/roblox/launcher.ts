import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "./projects";

/** Locates the installed Roblox Studio executable, or null if not found. */
export function findStudioExe(): string | null {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const versionsDir = join(localAppData, "Roblox", "Versions");
  try {
    const versions = readdirSync(versionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("version-"))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const version of versions) {
      const candidate = join(versionsDir, version, "RobloxStudioBeta.exe");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Roblox not installed.
  }
  return null;
}

/**
 * Opens a project's place file in Roblox Studio. Studio is launched with
 * `--task EditFile` so it opens the exact file rather than the start page.
 */
export function openProjectInStudio(project: Project): { ok: boolean; message: string } {
  const exe = findStudioExe();
  if (!exe) {
    return { ok: false, message: "Roblox Studio executable not found." };
  }
  if (!project.filePath) {
    return { ok: false, message: "This project has no place file path." };
  }
  if (!existsSync(project.filePath)) {
    return { ok: false, message: `File not found: ${project.filePath}` };
  }

  const child = spawn(exe, ["--task", "EditFile", "--localPlaceFile", project.filePath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return { ok: true, message: `Opening ${project.filePath}` };
}
