#!/usr/bin/env node
/**
 * Installs the LiveFieldHQ Studio plugin into Roblox Studio's local Plugins
 * folder. Studio picks the file up on next start (or right away).
 *
 *   node roblox-plugin/install.mjs
 */
import { copyFile, mkdir, access } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "LiveFieldHQBridge.plugin.lua");

const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
const pluginsDir = join(localAppData, "Roblox", "Plugins");
const destination = join(pluginsDir, "LiveFieldHQBridge.plugin.lua");

await mkdir(pluginsDir, { recursive: true });
await copyFile(source, destination);
console.log(`Installed plugin -> ${destination}`);

// Surface the bridge token if one is configured, so it can be pasted into the
// plugin panel. With no BRIDGE_TOKEN set, the plugin needs nothing.
const tokenFile = resolve(process.cwd(), "backend", "data", "bridge-token.txt");
const token = process.env.BRIDGE_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, "utf8").trim() : "");

console.log(`
Next steps:
  1. Start the backend:   cd backend && npm run dev
  2. Start Roblox Studio and open your place
  3. Plugins tab -> LiveFieldHQ toolbar button
  4. ${token ? `Paste this token: ${token}` : "Leave the token blank (local-only mode)"}
  5. Click "Save settings", then "Start listening"

If commands never arrive, enable File > Experience Settings > Security > Allow HTTP Requests.
`);
