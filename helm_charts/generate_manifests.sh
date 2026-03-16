#!/usr/bin/env bash
set -euo pipefail

ENVIRONNEMENT=${1:?Usage: $0 <environment> <image_tag>  (environments: integration, validation)}
IMAGE_TAG=${2:?Usage: $0 <environment> <image_tag>}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

if [[ "${ENVIRONNEMENT}" != "integration" && "${ENVIRONNEMENT}" != "validation" ]]; then
  echo "❌ Unknown environment '${ENVIRONNEMENT}'. Valid values: integration, validation" >&2
  exit 1
fi

rm -rf ./generated_manifests || true

HELM_FLAGS=""
if [[ "${ENVIRONNEMENT}" == "integration" ]]; then
  HELM_FLAGS="--dry-run"
fi

# SIRENA-TOOLS
helm template sirena-tools . \
  -f "values/${ENVIRONNEMENT}.yaml" \
  --set "SDPSN-devops-charts.deployment.image=ghcr.io/DNUM-SocialGouv/sirena-tools:${IMAGE_TAG}" \
  ${HELM_FLAGS} \
  --output-dir ./generated_manifests
mv ./generated_manifests/sirena-tools/charts/SDPSN-devops-charts/templates ./generated_manifests/sirena-tools-app
rm -rf ./generated_manifests/sirena-tools

echo "✅ Manifests generated in ./generated_manifests/ for environment: ${ENVIRONNEMENT} / image: ${IMAGE_TAG}"
