# sirena-tools

[![CI](https://github.com/DNUM-SocialGouv/sirena-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/DNUM-SocialGouv/sirena-tools/actions/workflows/ci.yml)
[![Docker](https://github.com/DNUM-SocialGouv/sirena-tools/actions/workflows/docker.yml/badge.svg)](https://github.com/DNUM-SocialGouv/sirena-tools/actions/workflows/docker.yml)

A **Deno**-based webhook middleware that receives payloads from external services and forwards them
as formatted messages to [Mattermost](https://mattermost.com/) channels via incoming webhooks.

## Features

- 🔀 Routes webhooks to specific Mattermost channels
- 🔒 Token-based authentication (URL path token, supports comma-separated list for zero-downtime
  rotation)
- 🐳 Distroless production Docker image (minimal attack surface)
- 🚨 **Sentry** → Mattermost integration (more sources coming)

---

## Webhook URL Format

```
POST /webhook/<source>/mattermost_<channel>/<token>
```

| Segment   | Description                          |
| --------- | ------------------------------------ |
| `source`  | Webhook source (e.g. `sentry`)       |
| `channel` | Mattermost channel name (lowercased) |
| `token`   | Auth token matching `WEBHOOK_TOKEN`  |

**Example:**

```
POST /webhook/sentry/mattermost_alerts/my-secret-token
```

---

## Environment Variables

| Variable                           | Required | Description                                                                  |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------- |
| `WEBHOOK_TOKEN`                    | ✅ Yes   | Comma-separated list of valid auth tokens (supports rolling rotation)        |
| `WEBHOOK_MATTERMOST_<CHANNEL>_URL` | ✅ Yes*  | Mattermost incoming webhook URL for `<CHANNEL>` (one per channel, uppercase) |
| `PORT`                             | No       | HTTP port to listen on (default: `8000`)                                     |

*At least one `WEBHOOK_MATTERMOST_*_URL` is required.

**Examples:**

```env
WEBHOOK_TOKEN=token-abc123,token-xyz789
WEBHOOK_MATTERMOST_ALERTS_URL=https://mattermost.example.com/hooks/xxxxxxxxxxxx
WEBHOOK_MATTERMOST_DEPLOYMENTS_URL=https://mattermost.example.com/hooks/yyyyyyyyyyyy
PORT=8000
```

The channel name in the env var is the **uppercased** version of what appears in the URL:

- `WEBHOOK_MATTERMOST_ALERTS_URL` → `/webhook/sentry/mattermost_alerts/<token>`
- `WEBHOOK_MATTERMOST_DEPLOYMENTS_URL` → `/webhook/sentry/mattermost_deployments/<token>`

---

## Supported Sources

### Sentry

Configure a Sentry webhook pointing to:

```
POST https://your-host/webhook/sentry/mattermost_<channel>/<token>
```

In Sentry: **Project Settings → Integrations → Webhooks → Add Webhook URL**.

Supported Sentry actions: `created`, `resolved`, `assigned`, `ignored`, `unresolved`.

The Mattermost message will include:

- Issue title (linked to Sentry)
- Action & severity level with emoji
- Culprit, project, occurrence count, affected users
- Actor name (who triggered the action)

---

## Local Development

### Prerequisites

- [Deno](https://deno.land/) v2.x

### Run

```bash
export WEBHOOK_TOKEN=dev-token
export WEBHOOK_MATTERMOST_ALERTS_URL=https://mattermost.example.com/hooks/xxxx

# Start with hot reload
deno task dev

# Or start normally
deno task start
```

### Lint & Format

```bash
deno task lint
deno fmt          # auto-fix formatting
deno task fmt     # check only
deno task check   # type check
```

### Test a webhook locally

```bash
curl -X POST http://localhost:8000/webhook/sentry/mattermost_alerts/dev-token \
  -H "Content-Type: application/json" \
  -d '{
    "action": "created",
    "data": {
      "issue": {
        "id": "123",
        "title": "TypeError: Cannot read property of undefined",
        "culprit": "src/app.ts in handleRequest",
        "level": "error",
        "status": "unresolved",
        "permalink": "https://sentry.io/organizations/myorg/issues/123/",
        "project": { "name": "my-app", "slug": "my-app" },
        "count": "42",
        "userCount": 7
      }
    },
    "actor": { "name": "Jane Doe", "email": "jane@example.com" }
  }'
```

---

## Docker

### Build

```bash
docker build -t sirena-tools .
```

### Run

```bash
docker run -p 8000:8000 \
  -e WEBHOOK_TOKEN=my-secret-token \
  -e WEBHOOK_MATTERMOST_ALERTS_URL=https://mattermost.example.com/hooks/xxxx \
  sirena-tools
```

### Production image

The production image is built on `denoland/deno:distroless` — Deno's official distroless image,
non-root, shell-less, minimal attack surface.

---

## Helm Chart

The chart lives in `helm_charts/` and depends on `SDPSN-devops-charts` (same pattern as
[sirena](https://github.com/DNUM-SocialGouv/sirena/tree/main/helm_charts)).

### Structure

```
helm_charts/
├── Chart.yaml                                  # Chart metadata + SDPSN-devops-charts dependency
├── values.yaml                                 # Base defaults
├── generate_manifests.sh                       # Render manifests for GitOps
├── values/
│   ├── sirena-tools.yaml                       # Main component values
│   ├── external-secrets.yaml                   # ExternalSecret definitions
│   └── env_specific/
│       ├── sirena-tools/{test,production}.yaml
│       └── external-secrets/{test,production}.yaml
└── templates/                                  # Extra templates (if any)
```

### Prerequisites

- [Helm](https://helm.sh/) v3
- Access to the `SDPSN-devops-charts` registry

```bash
cd helm_charts
helm dependency update
```

### Generate manifests (GitOps)

```bash
./helm_charts/generate_manifests.sh <environment> <image_tag>
# e.g.
./helm_charts/generate_manifests.sh production sha-abc1234
# dry-run (test environment renders manifests but does not apply)
./helm_charts/generate_manifests.sh test sha-abc1234
```

Generated manifests are written to `helm_charts/generated_manifests/` (gitignored).

### Secrets (ExternalSecret)

Secrets are sourced from the secret store via the `sirena-tools` keystore. Required keys:

| Key                             | Description                                 |
| ------------------------------- | ------------------------------------------- |
| `WEBHOOK_TOKEN`                 | Comma-separated auth tokens                 |
| `WEBHOOK_MATTERMOST_ALERTS_URL` | Mattermost webhook URL for `alerts` channel |

Add one `WEBHOOK_MATTERMOST_<CHANNEL>_URL` key per channel to both the secret store and
`values/external-secrets.yaml`.

### Customise for your org

- Replace `DNUM-SocialGouv` in `values/sirena-tools.yaml` with your GitHub org
- Update the `host` in each `env_specific/sirena-tools/<env>.yaml`
- Update the `namespace` in each `env_specific/` file
- Add/remove Mattermost channel entries in `values/external-secrets.yaml`

---

## GitHub Actions

### CI (`ci.yml`)

Triggered on every push and pull request:

- `deno fmt --check` — formatting
- `deno lint` — linting
- `deno check src/main.ts` — type checking

### Docker publish (`docker.yml`)

Triggered on push to `main` and on semver tags (`v*.*.*`):

- Builds the Docker image
- Pushes to [GitHub Container Registry](https://ghcr.io) (`ghcr.io/DNUM-SocialGouv/sirena-tools`)

Tags applied:

| Trigger        | Tags                          |
| -------------- | ----------------------------- |
| Push to `main` | `latest`, `sha-<short-sha>`   |
| Tag `v1.2.3`   | `1.2.3`, `1.2`, `1`, `latest` |

---

## Token Rotation (Zero Downtime)

Add the new token to `WEBHOOK_TOKEN` alongside the old one, then update your webhook senders to use
the new token, then remove the old token:

```
# Step 1 — both tokens active
WEBHOOK_TOKEN=old-token,new-token

# Step 2 — migrate senders to new-token
# Step 3 — remove old token
WEBHOOK_TOKEN=new-token
```

---

## License

MIT
