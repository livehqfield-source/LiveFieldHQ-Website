import { Router, type Request, type Response } from "express";
import { parseIntent } from "../roblox/intents";
import { getBridgeToken } from "../roblox/config";
import { openProjectInStudio } from "../roblox/launcher";
import {
  addProject,
  discoverProjects,
  getActiveProject,
  getProject,
  getStudioPlace,
  listProjects,
  removeProject,
  setActiveProject,
  setStudioPlace,
} from "../roblox/projects";
import {
  claimPending,
  completeJob,
  createJob,
  getLastPluginSeen,
  listRecent,
  markPluginSeen,
  queueDepth,
  type JobSource,
} from "../roblox/store";

export const robloxRouter = Router();

/** Seconds without a plugin poll before we call the bridge offline. */
const OFFLINE_AFTER_MS = 10_000;

function requireToken(req: Request, res: Response): boolean {
  const expected = getBridgeToken();
  if (!expected) return true; // no token configured — local-only mode
  const provided = req.header("x-bridge-token");
  if (provided === expected) return true;
  res.status(401).json({ error: "invalid or missing bridge token" });
  return false;
}

function publicJob(job: ReturnType<typeof listRecent>[number]) {
  return {
    id: job.id,
    text: job.text,
    source: job.source,
    command: job.command,
    status: job.status,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error,
  };
}

robloxRouter.get("/status", (_req: Request, res: Response) => {
  const lastSeen = getLastPluginSeen();
  const online = lastSeen !== null && Date.now() - lastSeen < OFFLINE_AFTER_MS;
  const studio = getStudioPlace();
  const active = getActiveProject();

  const mismatch =
    active && studio.placeId && active.placeId && studio.placeId !== active.placeId;

  res.json({
    status: online ? "online" : "offline",
    builder: "Roblox Builder",
    games: [],
    message: online
      ? mismatch
        ? `Studio is editing a different place than the active project "${active.name}".`
        : "Studio bridge connected."
      : "Studio bridge offline — open Roblox Studio with the LiveFieldHQ plugin running.",
    bridge: {
      online,
      lastSeen,
      queued: queueDepth(),
      token: getBridgeToken(),
      studioPlace: {
        placeId: studio.placeId,
        placeName: studio.placeName,
      },
    },
    activeProject: active
      ? { id: active.id, name: active.name, filePath: active.filePath, placeId: active.placeId }
      : null,
  });
});

robloxRouter.post("/command", (req: Request, res: Response) => {
  const raw = req.body?.text;
  const source: JobSource = req.body?.source === "voice" ? "voice" : "text";

  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "expected { text: string }" });
    return;
  }

  const trimmed = raw.trim().slice(0, 500);
  const parsed = parseIntent(trimmed);

  if (!parsed) {
    res.json({
      accepted: false,
      jobId: null,
      reply:
        "I didn't recognise that. Try things like \"build me a sunset sky\", \"add a red block 10x10x10 at 0,5,0\", \"build a tree\" or \"clear all parts\".",
    });
    return;
  }

  const job = createJob(trimmed, source, parsed.command);

  res.json({
    accepted: true,
    jobId: job.id,
    command: job.command,
    status: job.status,
    reply: parsed.reply,
  });
});

robloxRouter.get("/jobs/recent", (_req: Request, res: Response) => {
  res.json({ jobs: listRecent(20).map(publicJob) });
});

// --- Projects ---

robloxRouter.get("/projects", (_req: Request, res: Response) => {
  res.json({
    projects: listProjects(),
    activeId: getActiveProject()?.id ?? null,
    studio: getStudioPlace(),
  });
});

robloxRouter.post("/projects/discover", (req: Request, res: Response) => {
  const dir =
    typeof req.body?.dir === "string" && req.body.dir.trim() ? req.body.dir.trim() : undefined;
  res.json(discoverProjects(dir));
});

robloxRouter.post("/projects", (req: Request, res: Response) => {
  const name = req.body?.name;
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "expected { name: string }" });
    return;
  }
  const project = addProject({
    name,
    filePath: typeof req.body?.filePath === "string" ? req.body.filePath : undefined,
    placeId: typeof req.body?.placeId === "string" ? req.body.placeId : undefined,
  });
  res.json({ project });
});

robloxRouter.delete("/projects/:id", (req: Request, res: Response) => {
  if (!removeProject(req.params.id)) {
    res.status(404).json({ error: "unknown project" });
    return;
  }
  res.json({ removed: true });
});

robloxRouter.post("/projects/active", (req: Request, res: Response) => {
  const id = typeof req.body?.id === "string" ? req.body.id : null;
  if (id && !getProject(id)) {
    res.status(404).json({ error: "unknown project" });
    return;
  }
  setActiveProject(id);
  res.json({ activeId: id, activeProject: getActiveProject() });
});

robloxRouter.post("/projects/:id/open", (req: Request, res: Response) => {
  const project = getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: "unknown project" });
    return;
  }
  const result = openProjectInStudio(project);
  res.status(result.ok ? 200 : 400).json(result);
});

// --- Plugin-facing endpoints (token required) ---

robloxRouter.get("/jobs", (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  markPluginSeen();

  // The plugin tells us which place Studio currently has open so the backend
  // can enforce "only build into the active project".
  const placeId = (req.header("x-bridge-place-id") ?? "").trim() || null;
  const placeName = (req.header("x-bridge-place-name") ?? "").trim() || null;
  if (placeId || placeName) {
    setStudioPlace({ online: true, placeId, placeName });
  }

  const active = getActiveProject();
  const jobs = claimPending(5).map(publicJob);
  res.json({
    jobs,
    activeProject: active
      ? { id: active.id, name: active.name, placeId: active.placeId, filePath: active.filePath }
      : null,
  });
});

robloxRouter.post("/jobs/:id/result", (req: Request, res: Response) => {
  if (!requireToken(req, res)) return;
  markPluginSeen();

  const ok = req.body?.ok !== false;
  const message = typeof req.body?.message === "string" ? req.body.message.slice(0, 1000) : "";
  const job = completeJob(req.params.id, ok, message);

  if (!job) {
    res.status(404).json({ error: "unknown job" });
    return;
  }
  res.json({ received: true, status: job.status });
});
