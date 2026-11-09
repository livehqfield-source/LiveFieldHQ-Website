# LiveFieldHQ Website

Dashboard with a sidebar, split into a Next.js frontend and an Express backend.
The **Roblox Builder** turns typed or spoken commands into real objects in Roblox Studio.

## Structure

```
Website/
├── frontend/          Next.js 16 (App Router, React 19, TypeScript) — port 3000
├── backend/           Express + TypeScript (tsx) — port 4000
├── roblox-plugin/     Roblox Studio plugin (Luau) that builds inside Studio
└── minions/           Minions mission control (separate tool)
```

## Run it

Three things need to be running:

**1. Backend**

```bash
cd backend
npm install
npm run dev      # http://localhost:4000
```

**2. Frontend**

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

**3. Roblox Studio + plugin**

```bash
node roblox-plugin/install.mjs     # copies the plugin into Studio's Plugins folder
```

Then open Roblox Studio, open a place, and click the **LiveFieldHQ** toolbar button.
The frontend reads `BACKEND_URL` from `frontend/.env.local` (default `http://localhost:4000`).

## How a command reaches Roblox Studio

```
you (text or voice)
  → Next.js Roblox Builder page
  → POST /api/roblox/command            backend parses the sentence
  → job queue                           backend/data/jobs.json
  ← GET /api/roblox/jobs                Studio plugin polls every second
  → plugin runs Luau in the open place
  → POST /api/roblox/jobs/:id/result    plugin reports success or failure
```

The plugin only creates objects under `Workspace.LiveFieldHQ` and
`Lighting.LiveFieldHQ_*`, so "clear" never touches your own work.

## Projects

The Projects panel scopes builds to one place at a time. It scans `Website/Roblox`,
`<project>/Roblox`, and `Documents/Roblox` for `.rbxl`/`.rbxlx` files and lists them
automatically — use **Scan for places** to pick up new files, or add one by hand.

1. **Add a project** — a name, plus the path to its `.rbxl`/`.rbxlx` file if you have one.
2. **Activate it** — the plugin then refuses to build unless Studio has that place open,
   and reports a clear failure in the transcript instead of building in the wrong file.
3. **Open** — launches Studio on that exact file
   (`RobloxStudioBeta.exe --task EditFile --localPlaceFile "<path>"`).

With no active project, the bridge builds into whatever place is open — the default
behaviour needs no setup.

The open place is matched by `game.PlaceId` for published places, and by file name
otherwise (normalised, so a project named `My Game` matches `MyGame.rbxlx`).

## Systems

The builder installs pre-written Luau systems, not just geometry. Say **"create a
modular weapon framework"** and it installs:

| File | Type | Location |
| --- | --- | --- |
| `WeaponFramework` | ModuleScript | `ReplicatedStorage.LiveFieldHQ_Weapons` |
| `Vandal` | ModuleScript | `ReplicatedStorage.LiveFieldHQ_Weapons` |
| `WeaponClient` | LocalScript | `StarterPlayer.StarterPlayerScripts.LiveFieldHQ_Weapons` |
| `WeaponServer` | Script | `ServerScriptService.LiveFieldHQ_Weapons` |
| `LiveFieldHQ_Vandal` | Tool (with Handle) | `StarterPack` |

The framework covers raycast shooting, headshot multiplier, damage falloff,
reloading, an ammo system, recoil and animation hooks. The Vandal config is the
first weapon: 40 body damage, 4x headshot, 25-round magazine, mild recoil.

Systems live in `roblox-systems/<id>/` — a `manifest.json` plus one `.luau` file
per script. **Adding a new system is just adding a folder**; no backend or plugin
changes are needed. "Clear all" removes everything the systems installed.

Damage is decided on the server, which performs its own raycast — clients cannot
fake hits. Ammo is tracked client-side for simplicity, so it is exploitable;
move it server-side if that matters.

## Maps

The builder also constructs playable spaces, not just objects. Say **"build me a
warmap with a A-Spawn and a B-Spawn"** and it builds a walled warm-up arena:

- 240×240 floor with 24-stud perimeter walls
- five cover blocks to practice around
- an **A** pad (blue) and a **B** pad (red), each with a floating label and a real
  `SpawnLocation` so players actually spawn there

Spawn detection understands `a-spawn`, `a spawn`, `aspawn`, `site a`, `spawn a` and
the same for B. Name only one to get a single spawn; name neither and you get both.

Re-building a warmap replaces the previous one rather than stacking a second arena.

## Assets

The **Assets** tab in the Roblox Builder is a library of Roblox assets you want in
your place. Paste a Creator Store link or an asset id and it is saved locally:

- `https://create.roblox.com/store/asset/123456789/Some-Tree`
- `123456789`

Click **Insert** on a saved asset and the plugin loads it into Studio with
`InsertService:LoadAsset`, under `Workspace.LiveFieldHQ.Assets`. "Clear all"
removes inserted assets along with everything else the builder made.

The library lives in `backend/data/assets.json`. Only the asset id is sent to
Studio, so it works for any free or owned asset — models, meshes, audio, and so
on. Assets you do not own, or that are not approved, fail with a clear message in
the **Recent inserts** list.

## Building anything with Ollama

The builder is not limited to its built-in commands. When a request matches none
of them, the backend asks a local model to write a system, saves it to
`roblox-systems/`, and installs it in the open place.

```bash
# nothing to install — Ollama is the only requirement
ollama pull qwen2.5-coder:7b

# optional — defaults shown
OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL=qwen2.5-coder:7b npm run dev
```

Then just ask:

> create me a lobby screen with a play button

The model returns a manifest plus Luau, the backend writes
`roblox-systems/lobby-screen/`, and the plugin installs it like any other system.
The request took about 18 seconds on an RTX 5060.

Because the generated system is saved, its keywords become ordinary menu items —
after the first generation, "create a lobby screen" installs instantly without
calling the model again.

**Read the generated code before you trust it.** Local 7–10B models produce
plausible but sometimes wrong Luau. The plugin verifies that the files landed, but
it does not check that the code is correct. "Clear all" removes generated systems
along with everything else.

Model quality is the limiting factor. If the local model is not good enough, set
`OLLAMA_MODEL` to a stronger local model, or point `OLLAMA_URL` at any
OpenAI-compatible endpoint.

## Try it

- `build me a sky`
- `build me a warmap with a A-Spawn and a B-Spawn`
- `build a warmup map with only the b spawn`
- `build me a sunset sky`
- `make it night time`
- `add a red block 10x10x10 at 0,5,0`
- `build a giant tree`
- `build a house`
- `add a spawn point at 0,10,0`
- `clear all parts`

Voice input uses the browser's Web Speech API (Chrome/Edge). Text works in any browser.

## API endpoints

| Endpoint                          | Description                              |
| --------------------------------- | ---------------------------------------- |
| `GET /api/health`                  | Backend status and uptime                |
| `GET /api/roblox/status`           | Bridge state, queue depth, active project |
| `POST /api/roblox/command`         | `{ text, source }` → parse, enqueue, or ask Ollama |
| `GET /api/roblox/jobs/recent`      | Last 20 jobs (used by the UI)            |
| `GET /api/roblox/projects`         | Project list, active id, studio place    |
| `POST /api/roblox/projects`        | Add a project                            |
| `POST /api/roblox/projects/active` | Set or clear the active project          |
| `POST /api/roblox/projects/:id/open` | Launch Studio on that place file       |
| `DELETE /api/roblox/projects/:id`  | Remove a project                         |
| `GET /api/roblox/assets`           | Asset library                            |
| `POST /api/roblox/assets`          | `{ url, name? }` → link an asset          |
| `POST /api/roblox/assets/:id/insert` | Queue an insert into the open place    |
| `DELETE /api/roblox/assets/:id`    | Remove an asset from the library         |
| `GET /api/roblox/jobs`             | Plugin poll — returns pending jobs       |
| `POST /api/roblox/jobs/:id/result` | Plugin reports a result                  |

## Security

No authentication is required by default — the plugin talks to the backend over
localhost on your own machine. To require a token, start the backend with:

```bash
BRIDGE_TOKEN=<random-string> npm run dev
```

and paste the same string into the plugin's settings panel.

## Troubleshooting

- **Bridge offline** — Studio isn't open with a place, or the plugin isn't running.
  Local plugins only load once a place is open, not at Studio's start page.
- **Commands never arrive** — enable *File → Experience Settings → Security → Allow HTTP Requests* in Studio.
- **Plugin not appearing** — re-run `node roblox-plugin/install.mjs` and restart Studio.
- **Voice button missing** — you're not in Chrome or Edge; use text input.
