import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { sentryToMattermost, type SentryWebhookPayload } from "./sentry_to_mattermost.ts";

// ---- helpers ----------------------------------------------------------------

function makePayload(overrides: Partial<SentryWebhookPayload> = {}): SentryWebhookPayload {
  return {
    action: "created",
    data: {
      issue: {
        id: "123",
        title: "TypeError: Cannot read properties of undefined",
        culprit: "src/app.ts in handleRequest",
        level: "error",
        status: "unresolved",
        permalink: "https://sentry.io/organizations/myorg/issues/123/",
        project: { name: "my-app", slug: "my-app-slug" },
        count: "42",
        userCount: 7,
      },
    },
    actor: { name: "Jane Doe", email: "jane@example.com" },
    ...overrides,
  };
}

// ---- formatter output shape -------------------------------------------------

Deno.test("sentryToMattermost: always returns username=Sentry and icon_url", () => {
  const result = sentryToMattermost(makePayload());
  assertEquals(result.username, "Sentry");
  assertEquals(result.icon_url, "https://sentry.io/favicon.ico");
});

// ---- issue title & link -----------------------------------------------------

Deno.test("sentryToMattermost: uses permalink as markdown link when present", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(
    result.text,
    "[TypeError: Cannot read properties of undefined](https://sentry.io/organizations/myorg/issues/123/)",
  );
});

Deno.test("sentryToMattermost: bolds title when no permalink", () => {
  const payload = makePayload();
  payload.data.issue!.permalink = undefined;
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "**TypeError: Cannot read properties of undefined**");
});

// ---- action emojis ----------------------------------------------------------

const ACTION_CASES: Array<[string, string]> = [
  ["created", "🆕"],
  ["resolved", "✅"],
  ["assigned", "👤"],
  ["ignored", "🔕"],
  ["unresolved", "🔄"],
  ["unknown_action", "🔔"],
];

for (const [action, emoji] of ACTION_CASES) {
  Deno.test(`sentryToMattermost: action "${action}" → emoji ${emoji}`, () => {
    const result = sentryToMattermost(makePayload({ action }));
    assertStringIncludes(result.text, emoji);
  });
}

// ---- level emojis -----------------------------------------------------------

const LEVEL_CASES: Array<[string, string]> = [
  ["fatal", "💀"],
  ["error", "🔴"],
  ["warning", "🟡"],
  ["info", "🔵"],
  ["debug", "⚪"],
  ["unknown_level", "🔴"], // fallback
];

for (const [level, emoji] of LEVEL_CASES) {
  Deno.test(`sentryToMattermost: level "${level}" → emoji ${emoji}`, () => {
    const payload = makePayload();
    payload.data.issue!.level = level;
    const result = sentryToMattermost(payload);
    assertStringIncludes(result.text, emoji);
  });
}

Deno.test("sentryToMattermost: missing level defaults to error emoji 🔴", () => {
  const payload = makePayload();
  payload.data.issue!.level = undefined;
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "🔴");
});

// ---- detail fields ----------------------------------------------------------

Deno.test("sentryToMattermost: includes project name", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(result.text, "**Project:** my-app");
});

Deno.test("sentryToMattermost: falls back to project slug when name absent", () => {
  const payload = makePayload();
  payload.data.issue!.project = { slug: "my-slug" };
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "**Project:** my-slug");
});

Deno.test("sentryToMattermost: shows 'unknown' when project missing entirely", () => {
  const payload = makePayload();
  payload.data.issue!.project = undefined;
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "**Project:** unknown");
});

Deno.test("sentryToMattermost: includes culprit when present", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(result.text, "**Culprit:** `src/app.ts in handleRequest`");
});

Deno.test("sentryToMattermost: omits culprit line when absent", () => {
  const payload = makePayload();
  payload.data.issue!.culprit = undefined;
  const result = sentryToMattermost(payload);
  assertEquals(result.text.includes("**Culprit:**"), false);
});

Deno.test("sentryToMattermost: includes occurrence count", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(result.text, "**Occurrences:** 42");
});

Deno.test("sentryToMattermost: includes user count", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(result.text, "**Users affected:** 7");
});

Deno.test("sentryToMattermost: omits count when absent", () => {
  const payload = makePayload();
  payload.data.issue!.count = undefined;
  const result = sentryToMattermost(payload);
  assertEquals(result.text.includes("**Occurrences:**"), false);
});

Deno.test("sentryToMattermost: omits userCount when absent", () => {
  const payload = makePayload();
  payload.data.issue!.userCount = undefined;
  const result = sentryToMattermost(payload);
  assertEquals(result.text.includes("**Users affected:**"), false);
});

// ---- actor ------------------------------------------------------------------

Deno.test("sentryToMattermost: shows actor name and email", () => {
  const result = sentryToMattermost(makePayload());
  assertStringIncludes(result.text, "**By:** Jane Doe <jane@example.com>");
});

Deno.test("sentryToMattermost: shows actor name only when no email", () => {
  const payload = makePayload();
  payload.actor = { name: "Jane Doe" };
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "**By:** Jane Doe");
  assertEquals(result.text.includes("<"), false);
});

Deno.test("sentryToMattermost: omits actor line when no actor", () => {
  const payload = makePayload();
  payload.actor = undefined;
  const result = sentryToMattermost(payload);
  assertEquals(result.text.includes("**By:**"), false);
});

// ---- fallback: issue from data.event.issue ----------------------------------

Deno.test("sentryToMattermost: reads issue from data.event.issue when data.issue absent", () => {
  const payload: SentryWebhookPayload = {
    action: "created",
    data: {
      event: {
        issue: {
          id: "456",
          title: "Event-level issue",
          level: "warning",
          project: { name: "event-app" },
        },
      },
    },
  };
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "Event-level issue");
  assertStringIncludes(result.text, "🟡");
});

// ---- no issue at all --------------------------------------------------------

Deno.test("sentryToMattermost: handles missing issue gracefully", () => {
  const payload: SentryWebhookPayload = {
    action: "created",
    data: {},
  };
  const result = sentryToMattermost(payload);
  assertStringIncludes(result.text, "**Sentry**");
  assertStringIncludes(result.text, "Created");
  assertStringIncludes(result.text, "no issue details");
  assertEquals(result.username, "Sentry");
});

// ---- action label capitalisation --------------------------------------------

Deno.test("sentryToMattermost: action label is capitalised", () => {
  const result = sentryToMattermost(makePayload({ action: "resolved" }));
  assertMatch(result.text, /\*\*\[Sentry\] Resolved\*\*/);
});
