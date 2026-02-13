#!/bin/bash
# HUSH Air-Gapped One-Command Deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

ROTATE_SECRETS=false

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage: bash ./offline/deploy-airgapped.sh [--rotate-secrets]

Options:
  --rotate-secrets   Regenerate .env on target before deployment
  -h, --help         Show this help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --rotate-secrets)
        ROTATE_SECRETS=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  cd "$PROJECT_ROOT"

  echo "[1/3] Installing offline system dependencies..."
  bash ./offline/install-system-deps.sh

  echo ""
  if [[ "$ROTATE_SECRETS" == true ]]; then
    echo "[2/3] Rotating .env on air-gapped machine..."
    bash ./offline/init-airgap-env.sh --rotate-secrets
  elif [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    echo "[2/3] .env not found; generating .env on air-gapped machine..."
    bash ./offline/init-airgap-env.sh
  else
    echo "[2/3] .env already present; keeping existing secrets"
  fi

  echo ""
  echo "[3/3] Deploying HUSH services..."
  bash ./offline/deploy-offline.sh
}

main "$@"
