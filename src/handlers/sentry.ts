import {
  sentryToMattermost,
  type SentryWebhookPayload,
} from "../formatters/sentry_to_mattermost.ts";

export async function handleSentry(
  req: Request,
  mattermostWebhookUrl: string,
): Promise<Response> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response("Unsupported Media Type: expected application/json", { status: 415 });
  }

  let payload: SentryWebhookPayload;
  try {
    payload = await req.json() as SentryWebhookPayload;
  } catch {
    return new Response("Bad Request: invalid JSON body", { status: 400 });
  }

  if (!payload.action || !payload.data) {
    return new Response("Bad Request: missing required fields (action, data)", { status: 400 });
  }

  const mattermostPayload = sentryToMattermost(payload);

  let mmResponse: Response;
  try {
    mmResponse = await fetch(mattermostWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mattermostPayload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Bad Gateway: failed to reach Mattermost — ${message}`, { status: 502 });
  }

  if (!mmResponse.ok) {
    const body = await mmResponse.text().catch(() => "");
    return new Response(
      `Bad Gateway: Mattermost returned ${mmResponse.status} — ${body}`,
      { status: 502 },
    );
  }

  return new Response("OK", { status: 200 });
}
