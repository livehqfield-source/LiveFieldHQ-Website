import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RobloxCommand } from "./types";

export type JobStatus = "queued" | "claimed" | "done" | "failed";
export type JobSource = "text" | "voice";

export interface Job {
  id: string;
  text: string;
  source: JobSource;
  command: RobloxCommand;
  status: JobStatus;
  createdAt: number;
  claimedAt: number | null;
  finishedAt: number | null;
  result: string | null;
  error: string | null;
}

export interface PersistedState {
  jobs: Job[];
  lastPluginSeen: number | null;
}

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "jobs.json");
const MAX_JOBS = 50;
/** A claimed job is considered abandoned after this long and requeued. */
const CLAIM_TIMEOUT_MS = 90_000;

let jobs: Job[] = [];
let lastPluginSeen: number | null = null;

function load(): void {
  try {
    if (!existsSync(FILE)) return;
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<PersistedState>;
    if (Array.isArray(parsed.jobs)) jobs = parsed.jobs;
    lastPluginSeen = typeof parsed.lastPluginSeen === "number" ? parsed.lastPluginSeen : null;
  } catch {
    jobs = [];
  }
}

function save(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const state: PersistedState = { jobs: jobs.slice(0, MAX_JOBS), lastPluginSeen };
    writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Persistence is best-effort; the in-memory queue still works.
  }
}

load();

export function listRecent(limit = 20): Job[] {
  return jobs.slice(0, limit);
}

export function getJob(id: string): Job | undefined {
  return jobs.find((j) => j.id === id);
}

export function createJob(text: string, source: JobSource, command: RobloxCommand): Job {
  const job: Job = {
    id: randomUUID(),
    text,
    source,
    command,
    status: "queued",
    createdAt: Date.now(),
    claimedAt: null,
    finishedAt: null,
    result: null,
    error: null,
  };
  jobs.unshift(job);
  if (jobs.length > MAX_JOBS) jobs.length = MAX_JOBS;
  save();
  return job;
}

/** Requeues jobs a plugin picked up but never reported back on. */
export function requeueStaleClaims(): void {
  const now = Date.now();
  let changed = false;
  for (const job of jobs) {
    if (job.status === "claimed" && job.claimedAt && now - job.claimedAt > CLAIM_TIMEOUT_MS) {
      job.status = "queued";
      job.claimedAt = null;
      changed = true;
    }
  }
  if (changed) save();
}

export function claimPending(limit = 5): Job[] {
  requeueStaleClaims();
  const now = Date.now();
  const claimed: Job[] = [];
  for (const job of jobs) {
    if (job.status === "queued") {
      job.status = "claimed";
      job.claimedAt = now;
      claimed.push(job);
      if (claimed.length >= limit) break;
    }
  }
  if (claimed.length > 0) save();
  return claimed;
}

export function completeJob(id: string, ok: boolean, message: string): Job | null {
  const job = getJob(id);
  if (!job) return null;
  job.status = ok ? "done" : "failed";
  job.finishedAt = Date.now();
  if (ok) {
    job.result = message;
    job.error = null;
  } else {
    job.error = message;
    job.result = null;
  }
  save();
  return job;
}

export function markPluginSeen(): void {
  lastPluginSeen = Date.now();
  save();
}

export function getLastPluginSeen(): number | null {
  return lastPluginSeen;
}

export function queueDepth(): number {
  return jobs.filter((j) => j.status === "queued").length;
}
