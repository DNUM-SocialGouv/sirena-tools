import { assertEquals, assertStringIncludes } from "@std/assert";
import { _resetConfig } from "./config.ts";
import { loadConfig } from "./config.ts";

// Reset singleton before every test to allow fresh env var reads
function withEnv(vars: Record<string, string>, fn: () => void): void {
  for (const [k, v] of Object.entries(vars)) Deno.env.set(k, v);
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) Deno.env.delete(k);
    _resetConfig();
  }
}

// ---- WEBHOOK_TOKEN ----------------------------------------------------------

Deno.test("loadConfig: throws when WEBHOOK_TOKEN is missing", () => {
  _resetConfig();
  Deno.env.delete("WEBHOOK_TOKEN");
  try {
    loadConfig();
    throw new Error("expected to throw");
  } catch (e) {
    assertStringIncludes((e as Error).message, "WEBHOOK_TOKEN");
  } finally {
    _resetConfig();
  }
});

Deno.test("loadConfig: throws when WEBHOOK_TOKEN is blank", () => {
  _resetConfig();
  Deno.env.set("WEBHOOK_TOKEN", "   ");
  try {
    loadConfig();
    throw new Error("expected to throw");
  } catch (e) {
    assertStringIncludes((e as Error).message, "WEBHOOK_TOKEN");
  } finally {
    Deno.env.delete("WEBHOOK_TOKEN");
    _resetConfig();
  }
});

Deno.test("loadConfig: parses single token", () => {
  withEnv(
    { WEBHOOK_TOKEN: "abc123", WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x" },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.tokens, ["abc123"]);
    },
  );
});

Deno.test("loadConfig: parses multiple comma-separated tokens, trimming whitespace", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: " tok-a , tok-b ,  tok-c  ",
      WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x",
    },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.tokens, ["tok-a", "tok-b", "tok-c"]);
    },
  );
});

// ---- WEBHOOK_MATTERMOST_*_URL -----------------------------------------------

Deno.test("loadConfig: throws when no WEBHOOK_MATTERMOST_*_URL is set", () => {
  _resetConfig();
  Deno.env.set("WEBHOOK_TOKEN", "tok");
  // ensure no stray WEBHOOK_MATTERMOST_*_URL from the environment
  for (const key of Object.keys(Deno.env.toObject())) {
    if (/^WEBHOOK_MATTERMOST_.+_URL$/.test(key)) Deno.env.delete(key);
  }
  try {
    loadConfig();
    throw new Error("expected to throw");
  } catch (e) {
    assertStringIncludes((e as Error).message, "WEBHOOK_MATTERMOST");
  } finally {
    Deno.env.delete("WEBHOOK_TOKEN");
    _resetConfig();
  }
});

Deno.test("loadConfig: maps channel name to lowercased key", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: "tok",
      WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/alerts",
    },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.mattermostWebhooks.get("alerts"), "https://mm.example.com/hooks/alerts");
    },
  );
});

Deno.test("loadConfig: lowercases multi-word channel names", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: "tok",
      WEBHOOK_MATTERMOST_OPS_ALERTS_URL: "https://mm.example.com/hooks/ops",
    },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.mattermostWebhooks.get("ops_alerts"), "https://mm.example.com/hooks/ops");
    },
  );
});

Deno.test("loadConfig: collects multiple channels", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: "tok",
      WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/a",
      WEBHOOK_MATTERMOST_DEPLOYS_URL: "https://mm.example.com/hooks/d",
    },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.mattermostWebhooks.size, 2);
      assertEquals(cfg.mattermostWebhooks.get("alerts"), "https://mm.example.com/hooks/a");
      assertEquals(cfg.mattermostWebhooks.get("deploys"), "https://mm.example.com/hooks/d");
    },
  );
});

// ---- PORT -------------------------------------------------------------------

Deno.test("loadConfig: defaults to port 8000 when PORT not set", () => {
  _resetConfig();
  Deno.env.delete("PORT");
  withEnv(
    { WEBHOOK_TOKEN: "tok", WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x" },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.port, 8000);
    },
  );
});

Deno.test("loadConfig: reads PORT from env", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: "tok",
      WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x",
      PORT: "9000",
    },
    () => {
      _resetConfig();
      const cfg = loadConfig();
      assertEquals(cfg.port, 9000);
    },
  );
});

Deno.test("loadConfig: throws on invalid PORT", () => {
  withEnv(
    {
      WEBHOOK_TOKEN: "tok",
      WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x",
      PORT: "not-a-port",
    },
    () => {
      _resetConfig();
      try {
        loadConfig();
        throw new Error("expected to throw");
      } catch (e) {
        assertStringIncludes((e as Error).message, "PORT");
      }
    },
  );
});

// ---- caching ----------------------------------------------------------------

Deno.test("loadConfig: returns same object on repeated calls (singleton)", () => {
  withEnv(
    { WEBHOOK_TOKEN: "tok", WEBHOOK_MATTERMOST_ALERTS_URL: "https://mm.example.com/hooks/x" },
    () => {
      _resetConfig();
      const a = loadConfig();
      const b = loadConfig();
      assertEquals(a === b, true);
    },
  );
});
