"use client";

import { useCallback, useEffect, useState } from "react";
import { getBackendUrl } from "@/lib/api";

interface AssetEntry {
  id: string;
  name: string;
  assetId: string;
  url: string | null;
  createdAt: number;
}

type JobStatus = "queued" | "claimed" | "done" | "failed";

interface AssetJob {
  id: string;
  text: string;
  status: JobStatus;
  result: string | null;
  error: string | null;
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  claimed: "Inserting",
  done: "Done",
  failed: "Failed",
};

export default function AssetsPanel() {
  const [assets, setAssets] = useState<AssetEntry[]>([]);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [assetsRes, jobsRes] = await Promise.all([
        fetch(`${getBackendUrl()}/api/roblox/assets`, { cache: "no-store" }),
        fetch(`${getBackendUrl()}/api/roblox/jobs/recent`, { cache: "no-store" }),
      ]);
      if (assetsRes.ok) {
        const data = (await assetsRes.json()) as { assets: AssetEntry[] };
        setAssets(data.assets);
      }
      if (jobsRes.ok) {
        const data = (await jobsRes.json()) as {
          jobs: Array<{
            id: string;
            text: string;
            status: JobStatus;
            result: string | null;
            error: string | null;
            command: { type: string };
          }>;
        };
        setJobs(data.jobs.filter((job) => job.command.type === "asset"));
      }
    } catch {
      // Backend unreachable — leave the last known state on screen.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const add = useCallback(async () => {
    const value = ref.trim();
    if (!value) return;

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/roblox/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), url: value }),
      });
      const data = (await res.json()) as { asset?: AssetEntry; error?: string };
      if (!res.ok || !data.asset) {
        setNotice({ text: data.error ?? "Could not add that asset.", error: true });
      } else {
        setNotice({ text: `Saved "${data.asset.name}" to the library.`, error: false });
        setRef("");
        setName("");
      }
    } catch {
      setNotice({ text: "Could not reach the backend.", error: true });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [name, ref, refresh]);

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(`${getBackendUrl()}/api/roblox/assets/${id}`, { method: "DELETE" });
      } catch {
        setNotice({ text: "Could not reach the backend.", error: true });
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const insert = useCallback(
    async (id: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`${getBackendUrl()}/api/roblox/assets/${id}/insert`, {
          method: "POST",
        });
        const data = (await res.json()) as { accepted?: boolean; reply?: string };
        setNotice({
          text: data.accepted
            ? (data.reply ?? "Queued.")
            : (data.reply ?? "Could not queue that asset."),
          error: !data.accepted,
        });
      } catch {
        setNotice({ text: "Could not reach the backend.", error: true });
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  return (
    <section className="assets">
      <div className="projects-head">
        <h2>Asset library</h2>
        <span className="hint">Link Roblox assets, then insert them into the open place</span>
      </div>

      <p className="hint">
        Paste a Creator Store link or an asset id — for example{" "}
        <code>https://create.roblox.com/store/asset/123456789/Name</code> or{" "}
        <code>123456789</code>. Inserted assets land in{" "}
        <code>Workspace.LiveFieldHQ.Assets</code>.
      </p>

      {assets.length === 0 && (
        <p className="hint">No assets linked yet. Add one below to build your library.</p>
      )}

      <ul className="project-list">
        {assets.map((asset) => (
          <li key={asset.id} className="project-row">
            <div className="project-info">
              <span className="project-name">{asset.name}</span>
              <span className="project-path">Asset {asset.assetId}</span>
              {asset.url && (
                <a className="asset-link" href={asset.url} target="_blank" rel="noreferrer">
                  Open in Roblox
                </a>
              )}
            </div>
            <div className="project-actions">
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() => void insert(asset.id)}
              >
                Insert
              </button>
              <button
                type="button"
                className="link-button danger"
                disabled={busy}
                onClick={() => void remove(asset.id)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="project-add">
        <input
          className="composer-input"
          type="text"
          placeholder="Asset link or id — e.g. https://create.roblox.com/store/asset/123456789/Name"
          value={ref}
          onChange={(event) => setRef(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
        <input
          className="composer-input"
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
        <button
          type="button"
          className="send-button"
          disabled={busy || !ref.trim()}
          onClick={() => void add()}
        >
          Add to library
        </button>
      </div>

      {notice && <p className={notice.error ? "hint error" : "hint"}>{notice.text}</p>}

      {jobs.length > 0 && (
        <div className="asset-jobs">
          <h3>Recent inserts</h3>
          <ul className="asset-job-list">
            {jobs.map((job) => (
              <li key={job.id} className="asset-job-row">
                <span className="asset-job-text">{job.text}</span>
                <span className={`badge badge-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                {job.result && <span className="result">{job.result}</span>}
                {job.error && <span className="result error">{job.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
