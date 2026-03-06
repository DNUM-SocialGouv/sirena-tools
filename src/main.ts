import { loadConfig } from "./config.ts";
import { router } from "./router.ts";

const config = loadConfig();

Deno.serve(
  { port: config.port, hostname: "0.0.0.0" },
  (req: Request): Promise<Response> => {
    return router(req);
  },
);

console.log(`sirena-tools listening on port ${config.port}`);
console.log(
  `Configured channels: ${[...config.mattermostWebhooks.keys()].join(", ")}`,
);
console.log(`Loaded ${config.tokens.length} token(s)`);
