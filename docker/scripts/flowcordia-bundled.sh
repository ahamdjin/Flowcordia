#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <absolute-config-path> <absolute-secrets-path> [docker compose arguments...]" >&2
  exit 2
fi

config_path="$1"
secrets_path="$2"
shift 2

if [[ "$config_path" != /* || "$secrets_path" != /* ]]; then
  echo "Configuration and secrets paths must be absolute." >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository_root="$(cd -- "$script_dir/../.." && pwd -P)"

if [[ $# -eq 0 ]]; then
  set -- up -d --wait
fi

exec docker compose \
  --project-name "${FLOWCORDIA_COMPOSE_PROJECT_NAME:-flowcordia-bundled}" \
  --env-file "$config_path" \
  --env-file "$secrets_path" \
  -f "$repository_root/docker/flowcordia-self-host.yml" \
  -f "$repository_root/docker/flowcordia-bundled.yml" \
  "$@"
