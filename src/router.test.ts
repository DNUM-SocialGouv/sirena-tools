import { assertEquals, assertStringIncludes } from "@std/assert";
import { _resetConfig } from "./config.ts";
import { router } from "./router.ts";

// ---- test environment setup -------------------------------------------------

function setupEnv(): void {
  Deno.env.set("WEBHOOK_TOKEN", "valid-token,second-token");
  Deno.env.set("WEBHOOK_MATTERMOST_ALERTS_URL", "https://mattermost.example.com/hooks/alerts");
  _resetConfig();
}

function teardownEnv(): void {
  Deno.env.delete("WEBHOOK_TOKEN");
  Deno.env.delete("WEBHOOK_MATTERMOST_ALERTS_URL");
  _resetConfig();
}

function post(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

function get(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

const VALID_SENTRY_PAYLOAD = {
  action: "created",
  data: { issue: { id: "1", title: "Boom", level: "error", project: { name: "app" } } },
};

// ---- health check -----------------------------------------------------------

Deno.test("router: GET /health → 200 OK", async () => {
  const res = await router(get("/health"));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "OK");
});

Deno.test("router: POST /health → 404 (not a webhook route)", async () => {
  setupEnv();
  try {
    const res = await router(post("/health"));
    assertEquals(res.status, 404);
  } finally {
    teardownEnv();
  }
});

// ---- method enforcement -----------------------------------------------------

Deno.test("router: GET on webhook path → 405 Method Not Allowed", async () => {
  setupEnv();
  try {
    const res = await router(get("/webhook/sentry/mattermost_alerts/valid-token"));
    assertEquals(res.status, 405);
  } finally {
    teardownEnv();
  }
});

Deno.test("router: PUT on webhook path → 405 Method Not Allowed", async () => {
  setupEnv();
  try {
    const req = new Request("http://localhost/webhook/sentry/mattermost_alerts/valid-token", {
      method: "PUT",
    });
    const res = await router(req);
    assertEquals(res.status, 405);
  } finally {
    teardownEnv();
  }
});

// ---- route matching ---------------------------------------------------------

Deno.test("router: POST to unknown path → 404", async () => {
  setupEnv();
  try {
    const res = await router(post("/not/a/real/path"));
    assertEquals(res.status, 404);
  } finally {
    teardownEnv();
  }
});

Deno.test("router: POST to /webhook/ without full pattern → 404", async () => {
  setupEnv();
  try {
    const res = await router(post("/webhook/sentry/alerts/token"));
    assertEquals(res.status, 404);
  } finally {
    teardownEnv();
  }
});

// ---- token validation -------------------------------------------------------

Deno.test("router: invalid token → 401 Unauthorized", async () => {
  setupEnv();
  try {
    const res = await router(post("/webhook/sentry/mattermost_alerts/wrong-token"));
    assertEquals(res.status, 401);
  } finally {
    teardownEnv();
  }
});

Deno.test("router: accepts second token from comma-separated list", async () => {
  setupEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("ok", { status: 200 }));
  try {
    const req = new Request(
      "http://localhost/webhook/sentry/mattermost_alerts/second-token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_SENTRY_PAYLOAD),
      },
    );
    const res = await router(req);
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    teardownEnv();
  }
});

// ---- channel lookup ---------------------------------------------------------

Deno.test("router: unknown channel → 404", async () => {
  setupEnv();
  try {
    const res = await router(post("/webhook/sentry/mattermost_unknown/valid-token"));
    assertEquals(res.status, 404);
    assertStringIncludes(await res.text(), "unknown");
  } finally {
    teardownEnv();
  }
});

// ---- source dispatch --------------------------------------------------------

Deno.test("router: unknown source → 404 with hint", async () => {
  setupEnv();
  try {
    const res = await router(post("/webhook/pagerduty/mattermost_alerts/valid-token"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "pagerduty");
    assertStringIncludes(body, "sentry");
  } finally {
    teardownEnv();
  }
});

Deno.test("router: dispatches to sentry handler on success", async () => {
  setupEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("ok", { status: 200 }));
  try {
    const req = new Request(
      "http://localhost/webhook/sentry/mattermost_alerts/valid-token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_SENTRY_PAYLOAD),
      },
    );
    const res = await router(req);
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    teardownEnv();
  }
});

Deno.test("router: channel matching is case-insensitive (URL lowercased)", async () => {
  // WEBHOOK_MATTERMOST_ALERTS_URL sets channel "alerts"; URL uses mattermost_ALERTS
  setupEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("ok", { status: 200 }));
  try {
    const req = new Request(
      "http://localhost/webhook/sentry/mattermost_ALERTS/valid-token",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_SENTRY_PAYLOAD),
      },
    );
    const res = await router(req);
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
    teardownEnv();
  }
});
