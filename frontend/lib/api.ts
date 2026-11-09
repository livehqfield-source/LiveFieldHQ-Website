export function getBackendUrl(): string {
  return process.env.BACKEND_URL ?? "http://localhost:4000";
}
