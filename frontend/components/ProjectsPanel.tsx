"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBackendUrl } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  filePath: string | null;
  placeId: string | null;
  createdAt: number;
}

interface StudioPlace {
  online: boolean;
  lastSeen: number | null;
  placeId: string | null;
  placeName: string | null;
}

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [studio, setStudio] = useState<StudioPlace | null>(null);
  const [name, setName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/roblox/projects`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        projects: Project[];
        activeId: string | null;
        studio: StudioPlace;
      };
      setProjects(data.projects);
      setActiveId(data.activeId);
      setStudio(data.studio);
    } catch {
      // Backend unreachable — leave the last known state on screen.
    }
  }, []);

  const scan = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/roblox/projects/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { added?: Project[]; scanned?: number };
      if (data.added && data.added.length > 0) {
        setNotice({
          text: `Found ${data.added.length} place file${data.added.length === 1 ? "" : "s"}.`,
          error: false,
        });
      } else if (data.scanned === 0) {
        setNotice({ text: "No .rbxl or .rbxlx files found in the Roblox folder.", error: false });
      } else {
        setNotice({ text: "All place files are already listed.", error: false });
      }
    } catch {
      setNotice({ text: "Could not scan for place files.", error: true });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Populate the list from the user's own place files on first load, so the
  // panel is not empty when they have never added a project by hand.
  const didAutoScan = useRef(false);
  useEffect(() => {
    if (didAutoScan.current) return;
    if (projects.length > 0) {
      didAutoScan.current = true;
      return;
    }
    didAutoScan.current = true;
    void scan();
  }, [projects.length, scan]);

  const add = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${getBackendUrl()}/api/roblox/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, filePath: filePath.trim() || undefined }),
      });
      const data = (await res.json()) as { project?: Project; error?: string };
      if (!res.ok) setNotice({ text: data.error ?? "Could not add the project.", error: true });
      else {
        setName("");
        setFilePath("");
      }
    } catch {
      setNotice({ text: "Could not reach the backend.", error: true });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [filePath, name, refresh]);

  const setActive = useCallback(
    async (id: string | null) => {
      setBusy(true);
      try {
        await fetch(`${getBackendUrl()}/api/roblox/projects/active`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
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

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await fetch(`${getBackendUrl()}/api/roblox/projects/${id}`, { method: "DELETE" });
      } catch {
        setNotice({ text: "Could not reach the backend.", error: true });
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [refresh],
  );

  const openInStudio = useCallback(
    async (id: string) => {
      setBusy(true);
      setNotice(null);
      try {
        const res = await fetch(`${getBackendUrl()}/api/roblox/projects/${id}/open`, {
          method: "POST",
        });
        const data = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || data.ok === false) {
          setNotice({ text: data.message ?? "Could not open the project.", error: true });
        } else {
          setNotice({ text: data.message ?? "Opening in Studio.", error: false });
        }
      } catch {
        setNotice({ text: "Could not reach the backend.", error: true });
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const active = projects.find((p) => p.id === activeId) ?? null;

  return (
    <section className="projects">
      <div className="projects-head">
        <h2>Projects</h2>
        <div className="projects-head-right">
          <span className="hint">
            {studio?.online
              ? studio.placeName
                ? `Studio is editing: ${studio.placeName}`
                : "Studio is connected"
              : "Studio is offline"}
          </span>
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void scan()}
          >
            Scan for places
          </button>
        </div>
      </div>

      {active && (
        <p className="hint">
          Active project: <strong>{active.name}</strong> — builds only go to this place.{" "}
          <button type="button" className="link-button" onClick={() => void setActive(null)}>
            Clear
          </button>
        </p>
      )}

      {projects.length === 0 && (
        <p className="hint">No projects yet. Add one below to scope builds to a place file.</p>
      )}

      <ul className="project-list">
        {projects.map((project) => {
          const isActive = project.id === activeId;
          return (
            <li key={project.id} className={`project-row${isActive ? " active" : ""}`}>
              <div className="project-info">
                <span className="project-name">
                  {project.name}
                  {isActive && <span className="badge badge-done">Active</span>}
                </span>
                {project.filePath && (
                  <span className="project-path" title={project.filePath}>
                    {project.filePath}
                  </span>
                )}
              </div>
              <div className="project-actions">
                {project.filePath && (
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={() => void openInStudio(project.id)}
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  className="link-button"
                  disabled={busy}
                  onClick={() => void setActive(isActive ? null : project.id)}
                >
                  {isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  className="link-button danger"
                  disabled={busy}
                  onClick={() => void remove(project.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="project-add">
        <input
          className="composer-input"
          type="text"
          placeholder="Project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="composer-input"
          type="text"
          placeholder="Place file path (optional) — e.g. C:\Users\you\Documents\MyGame.rbxlx"
          value={filePath}
          onChange={(event) => setFilePath(event.target.value)}
        />
        <button
          type="button"
          className="send-button"
          disabled={busy || !name.trim()}
          onClick={() => void add()}
        >
          Add project
        </button>
      </div>

      {notice && <p className={notice.error ? "hint error" : "hint"}>{notice.text}</p>}
    </section>
  );
}
