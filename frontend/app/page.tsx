import { getBackendUrl } from "@/lib/api";

export const dynamic = "force-dynamic";

type Health = {
  status: string;
  service: string;
  uptime: number;
  timestamp: string;
};

type Dashboard = {
  status: string;
  stats: { games: number; activePlayers: number; buildsToday: number };
  message: string;
};

export default async function DashboardPage() {
  let health: Health | null = null;
  let dashboard: Dashboard | null = null;
  let backendError: string | null = null;

  try {
    const [healthRes, dashRes] = await Promise.all([
      fetch(`${getBackendUrl()}/api/health`, { cache: "no-store" }),
      fetch(`${getBackendUrl()}/api/dashboard`, { cache: "no-store" }),
    ]);
    if (!healthRes.ok || !dashRes.ok) {
      throw new Error(`Backend responded ${healthRes.status}/${dashRes.status}`);
    }
    health = (await healthRes.json()) as Health;
    dashboard = (await dashRes.json()) as Dashboard;
  } catch (err) {
    backendError = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">Welcome to LiveFieldHQ.</p>
      </div>

      <div className="status-row">
        {health ? (
          <span className="status-pill">
            <span className="status-dot" />
            Backend connected — {health.service}
          </span>
        ) : (
          <span className="status-pill">
            <span className="status-dot error" />
            Backend unreachable{backendError ? `: ${backendError}` : ""}
          </span>
        )}
      </div>

      <div className="card-grid">
        <div className="card">
          <h3>Games</h3>
          <div className="value">{dashboard?.stats.games ?? "—"}</div>
        </div>
        <div className="card">
          <h3>Active Players</h3>
          <div className="value">{dashboard?.stats.activePlayers ?? "—"}</div>
        </div>
        <div className="card">
          <h3>Builds Today</h3>
          <div className="value">{dashboard?.stats.buildsToday ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}
