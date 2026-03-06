#!/usr/bin/env bash
set -euo pipefail

ENVIRONNEMENT=${1:?Usage: $0 <environment> <image_tag>  (environments: test, production)}
IMAGE_TAG=${2:?Usage: $0 <environment> <image_tag>}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [[ "${ENVIRONNEMENT}" != "test" && "${ENVIRONNEMENT}" != "production" ]]; then
  echo "❌ Unknown environment '${ENVIRONNEMENT}'. Valid values: test, production" >&2
  exit 1
fi

rm -rf ./generated_manifests || true

HELM_FLAGS=""
if [[ "${ENVIRONNEMENT}" == "test" ]]; then
  HELM_FLAGS="--dry-run"
fi

# SIRENA-TOOLS
helm template sirena-tools . \
  -f values/sirena-tools.yaml \
  -f "values/env_specific/sirena-tools/${ENVIRONNEMENT}.yaml" \
  --set "SDPSN-devops-charts.deployment.image=ghcr.io/DNUM-SocialGouv/sirena-tools:${IMAGE_TAG}" \
  ${HELM_FLAGS} \
  --output-dir ./generated_manifests
mv ./generated_manifests/sirena-tools/charts/SDPSN-devops-charts/templates ./generated_manifests/sirena-tools-app
rm -rf ./generated_manifests/sirena-tools

# EXTERNAL-SECRETS
helm template external-secrets . \
  -f values/external-secrets.yaml \
  -f "values/env_specific/external-secrets/${ENVIRONNEMENT}.yaml" \
  ${HELM_FLAGS} \
  --output-dir ./generated_manifests
mv ./generated_manifests/sirena-tools/charts/SDPSN-devops-charts/templates ./generated_manifests/external-secrets
rm -rf ./generated_manifests/sirena-tools

echo "✅ Manifests generated in ./generated_manifests/ for environment: ${ENVIRONNEMENT} / image: ${IMAGE_TAG}"
