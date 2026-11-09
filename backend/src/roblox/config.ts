/**
 * Optional bridge authentication.
 *
 * The plugin talks to this backend over localhost on your own machine, so no
 * token is required by default. Set BRIDGE_TOKEN in the environment if you want
 * the plugin to authenticate (for example if you ever expose the backend):
 *
 *   BRIDGE_TOKEN=<random-string> npm run dev
 *
 * An empty string means "accept any local caller".
 */
export function getBridgeToken(): string {
  return (process.env.BRIDGE_TOKEN ?? "").trim();
}

export const BRIDGE_BASE_URL = "http://127.0.0.1:4000";
