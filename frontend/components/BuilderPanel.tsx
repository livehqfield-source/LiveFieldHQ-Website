"use client";

import { useCallback, useEffect, useState } from "react";
import { getBackendUrl } from "@/lib/api";
import ProjectsPanel from "@/components/ProjectsPanel";
import AssetsPanel from "@/components/AssetsPanel";
import { useSpeechInput } from "@/lib/useSpeechInput";

type JobStatus = "queued" | "claimed" | "done" | "failed";

interface Job {
  id: string;
  text: string;
  source: "text" | "voice";
  command: { type: string; label: string };
  status: JobStatus;
  createdAt: number;
  finishedAt: number | null;
  result: string | null;
  error: string | null;
}

interface BridgeState {
  status: string;
  message: string;
  bridge: {
    online: boolean;
    lastSeen: number | null;
    queued: number;
    token: string;
  };
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  claimed: "Building",
  done: "Done",
  failed: "Failed",
};

export default function BuilderPanel() {
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"builder" | "assets">("builder");

  const refresh = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        fetch(`${getBackendUrl()}/api/roblox/status`, { cache: "no-store" }),
        fetch(`${getBackendUrl()}/api/roblox/jobs/recent`, { cache: "no-store" }),
      ]);
      if (statusRes.ok) setBridge((await statusRes.json()) as BridgeState);
      if (jobsRes.ok) setJobs(((await jobsRes.json()) as { jobs: Job[] }).jobs);
    } catch {
      setBridge(null);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  const send = useCallback(
    async (raw: string, source: "text" | "voice") => {
      const value = raw.trim();
      if (!value || sending) return;

      setSending(true);
      setNotice(null);
      const slow = setTimeout(() => {
        setNotice("Still working — the local model can take a minute…");
      }, 5000);
      try {
        const res = await fetch(`${getBackendUrl()}/api/roblox/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: value, source }),
        });
        const data = (await res.json()) as { accepted?: boolean; reply?: string };
        if (data.accepted === false) setNotice(data.reply ?? "Command was not recognised.");
      } catch {
        setNotice("Could not reach the backend.");
      } finally {
        clearTimeout(slow);
        setSending(false);
        setText("");
        await refresh();
      }
    },
    [refresh, sending],
  );

  const { supported, listening, interim, error: voiceError, toggle } = useSpeechInput(
    (transcript) => void send(transcript, "voice"),
  );

  const copyToken = useCallback(() => {
    if (!bridge?.bridge.token) return;
    void navigator.clipboard?.writeText(bridge.bridge.token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [bridge]);

  const online = bridge?.bridge.online ?? false;

  return (
    <div className="builder">
      <div className="page-header">
        <h1>Roblox Builder</h1>
        <p className="page-subtitle">
          Type or speak a command — it is built in Roblox Studio by the LiveFieldHQ plugin.
        </p>
      </div>

      <div className="status-row">
        <span className="status-pill">
          <span className={`status-dot${online ? "" : " error"}`} />
          {online
            ? "Studio bridge connected"
            : "Studio bridge offline — open Studio with the plugin running"}
        </span>
        {bridge && bridge.bridge.queued > 0 && (
          <span className="status-pill">{bridge.bridge.queued} queued</span>
        )}
        <button
          type="button"
          className="link-button"
          onClick={() => setShowSetup((v) => !v)}
        >
          {showSetup ? "Hide setup" : "Plugin setup"}
        </button>
      </div>

      {showSetup && (
        <div className="card setup-card">
          <h3>Plugin setup</h3>
          <ol className="setup-list">
            <li>
              Run <code>node roblox-plugin/install.mjs</code> from the Website folder.
            </li>
            <li>Open Roblox Studio and your place.</li>
            <li>
              Plugins → <strong>LiveFieldHQ</strong> toolbar button.
            </li>
            <li>
              {bridge?.bridge.token ? (
                <>
                  Paste this token and click <strong>Save settings</strong>:
                  <div className="token-row">
                    <code className="token">{bridge.bridge.token}</code>
                    <button type="button" className="link-button" onClick={copyToken}>
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  Leave the token blank — this runs on your own machine, so no token is
                  required. Click <strong>Save settings</strong>.
                </>
              )}
            </li>
            <li>
              Click <strong>Start listening</strong>. If commands never arrive, enable{" "}
              <em>File → Experience Settings → Security → Allow HTTP Requests</em>.
            </li>
          </ol>
        </div>
      )}

      <div className="tab-bar">
        <button
          type="button"
          className={`tab${tab === "builder" ? " active" : ""}`}
          onClick={() => setTab("builder")}
        >
          Builder
        </button>
        <button
          type="button"
          className={`tab${tab === "assets" ? " active" : ""}`}
          onClick={() => setTab("assets")}
        >
          Assets
        </button>
      </div>

      {tab === "assets" ? (
        <AssetsPanel />
      ) : (
        <>
          <ProjectsPanel />

      <div className="composer">
        <input
          className="composer-input"
          type="text"
          value={listening && interim ? interim : text}
          placeholder='Try "build me a sunset sky"'
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send(text, "text");
          }}
        />
        {supported && (
          <button
            type="button"
            className={`icon-button${listening ? " listening" : ""}`}
            onClick={toggle}
            title={listening ? "Stop listening" : "Speak a command"}
            aria-label={listening ? "Stop listening" : "Speak a command"}
          >
            {listening ? "■" : "🎤"}
          </button>
        )}
        <button
          type="button"
          className="send-button"
          onClick={() => void send(text, "text")}
          disabled={sending || !text.trim()}
        >
          {sending ? "Working…" : "Build"}
        </button>
      </div>

      {voiceError && <p className="hint error">{voiceError}</p>}
      {notice && <p className="hint">{notice}</p>}
      {!supported && (
        <p className="hint">
          Voice input needs Chrome or Edge — text works everywhere.
        </p>
      )}

      <div className="transcript">
        {jobs.length === 0 && (
          <p className="hint">No commands yet. Say “build me a sky” to get started.</p>
        )}
        {jobs.map((job) => (
          <div key={job.id} className="transcript-row">
            <div className="transcript-head">
              <span className="transcript-text">
                {job.source === "voice" ? "🎤 " : ""}
                {job.text}
              </span>
              <span className={`badge badge-${job.status}`}>{STATUS_LABEL[job.status]}</span>
            </div>
            <div className="transcript-detail">
              <code>{job.command.label}</code>
              {job.result && <span className="result">{job.result}</span>}
              {job.error && <span className="result error">{job.error}</span>}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </div>
  );
}
