import { getConfig } from "./config.ts";
import { handleSentry } from "./handlers/sentry.ts";

// Route pattern: /webhook/<source>/mattermost_<channel>/<token>
const ROUTE_PATTERN = /^\/webhook\/([^/]+)\/mattermost_([^/]+)\/([^/]+)\/?$/;

const SUPPORTED_SOURCES: Record<
  string,
  (req: Request, mattermostUrl: string) => Promise<Response>
> = {
  sentry: handleSentry,
};

export async function router(req: Request): Promise<Response> {
  // Health check endpoint (GET /health)
  if (req.method === "GET" && new URL(req.url).pathname === "/health") {
    return new Response("OK", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const match = url.pathname.match(ROUTE_PATTERN);

  if (!match) {
    return new Response("Not Found", { status: 404 });
  }

  const [, source, channel, token] = match;

  // Validate token
  const config = getConfig();
  if (!config.tokens.includes(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Look up Mattermost webhook URL for channel
  const mattermostUrl = config.mattermostWebhooks.get(channel.toLowerCase());
  if (!mattermostUrl) {
    return new Response(
      `Not Found: no Mattermost webhook configured for channel "${channel}"`,
      { status: 404 },
    );
  }

  // Dispatch to source handler
  const handler = SUPPORTED_SOURCES[source.toLowerCase()];
  if (!handler) {
    return new Response(
      `Not Found: unsupported source "${source}". Supported: ${
        Object.keys(SUPPORTED_SOURCES).join(", ")
      }`,
      { status: 404 },
    );
  }

  return await handler(req, mattermostUrl);
}
