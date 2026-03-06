export interface Config {
  tokens: string[];
  mattermostWebhooks: Map<string, string>; // channel (lowercase) -> webhook URL
  port: number;
}

let _config: Config | undefined;

export function _resetConfig(): void {
  _config = undefined;
}

export function loadConfig(): Config {
  if (_config) return _config;

  // Parse tokens
  const tokenEnv = Deno.env.get("WEBHOOK_TOKEN");
  if (!tokenEnv || tokenEnv.trim() === "") {
    throw new Error(
      "WEBHOOK_TOKEN environment variable is required (comma-separated list of tokens)",
    );
  }
  const tokens = tokenEnv.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error("WEBHOOK_TOKEN must contain at least one non-empty token");
  }

  // Discover WEBHOOK_MATTERMOST_<CHANNEL>_URL env vars
  const mattermostWebhooks = new Map<string, string>();
  for (const [key, value] of Object.entries(Deno.env.toObject())) {
    const match = key.match(/^WEBHOOK_MATTERMOST_(.+)_URL$/);
    if (match && value.trim() !== "") {
      const channel = match[1].toLowerCase();
      mattermostWebhooks.set(channel, value.trim());
    }
  }

  if (mattermostWebhooks.size === 0) {
    throw new Error(
      "At least one WEBHOOK_MATTERMOST_<CHANNEL>_URL environment variable is required",
    );
  }

  const portEnv = Deno.env.get("PORT");
  const port = portEnv ? parseInt(portEnv, 10) : 8000;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${portEnv}`);
  }

  _config = { tokens, mattermostWebhooks, port };
  return _config;
}

export function getConfig(): Config {
  return loadConfig();
}
