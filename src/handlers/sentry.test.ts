import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleSentry } from "./sentry.ts";

// ---- helpers ----------------------------------------------------------------

function makeRequest(
  body: unknown,
  contentType = "application/json",
): Request {
  return new Request("http://localhost/webhook/sentry/mattermost_alerts/token", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

const MM_URL = "https://mattermost.example.com/hooks/test";

const VALID_PAYLOAD = {
  action: "created",
  data: {
    issue: {
      id: "1",
      title: "Test error",
      level: "error",
      project: { name: "test-app" },
    },
  },
};

// ---- content-type validation ------------------------------------------------

Deno.test("handleSentry: rejects non-JSON content-type with 415", async () => {
  const req = makeRequest(VALID_PAYLOAD, "text/plain");
  const res = await handleSentry(req, MM_URL);
  assertEquals(res.status, 415);
});

Deno.test("handleSentry: accepts application/json with charset suffix", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("ok", { status: 200 }));
  try {
    const req = makeRequest(VALID_PAYLOAD, "application/json; charset=utf-8");
    const res = await handleSentry(req, MM_URL);
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---- body validation --------------------------------------------------------

Deno.test("handleSentry: rejects invalid JSON body with 400", async () => {
  const req = new Request("http://localhost/webhook/sentry/mattermost_alerts/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json {{{",
  });
  const res = await handleSentry(req, MM_URL);
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "invalid JSON");
});

Deno.test("handleSentry: rejects payload missing action field with 400", async () => {
  const req = makeRequest({ data: { issue: {} } });
  const res = await handleSentry(req, MM_URL);
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "missing required fields");
});

Deno.test("handleSentry: rejects payload missing data field with 400", async () => {
  const req = makeRequest({ action: "created" });
  const res = await handleSentry(req, MM_URL);
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "missing required fields");
});

// ---- Mattermost forwarding --------------------------------------------------

Deno.test("handleSentry: returns 502 when Mattermost fetch throws", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("connection refused");
  };
  try {
    const req = makeRequest(VALID_PAYLOAD);
    const res = await handleSentry(req, MM_URL);
    assertEquals(res.status, 502);
    assertStringIncludes(await res.text(), "connection refused");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleSentry: returns 502 when Mattermost responds non-2xx", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("invalid token", { status: 403 }));
  try {
    const req = makeRequest(VALID_PAYLOAD);
    const res = await handleSentry(req, MM_URL);
    assertEquals(res.status, 502);
    assertStringIncludes(await res.text(), "403");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleSentry: returns 200 on success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("ok", { status: 200 }));
  try {
    const req = makeRequest(VALID_PAYLOAD);
    const res = await handleSentry(req, MM_URL);
    assertEquals(res.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleSentry: POSTs to the provided Mattermost URL", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  globalThis.fetch = (input: RequestInfo | URL) => {
    calledUrl = input.toString();
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const req = makeRequest(VALID_PAYLOAD);
    await handleSentry(req, MM_URL);
    assertEquals(calledUrl, MM_URL);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("handleSentry: sends JSON body to Mattermost", async () => {
  const originalFetch = globalThis.fetch;
  let sentBody = "";
  globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBody = init?.body as string;
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    const req = makeRequest(VALID_PAYLOAD);
    await handleSentry(req, MM_URL);
    const parsed = JSON.parse(sentBody);
    assertEquals(typeof parsed.text, "string");
    assertEquals(parsed.username, "Sentry");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
