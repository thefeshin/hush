#!/bin/bash
# HUSH Air-Gapped One-Command Deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

ROTATE_SECRETS=false

prompt_env_choice() {
  echo "[2/3] .env already exists on this machine."
  echo "       Choose how to proceed:"
  echo "       1) Use existing .env"
  echo "       2) Create new .env (rotate secrets)"
  echo "       3) Abort"
  read -r -p "       Select [1-3]: " choice

  case "$choice" in
    1)
      echo "[2/3] Using existing .env"
      ;;
    2)
      echo "[2/3] Rotating .env on air-gapped machine..."
      bash ./offline/init-airgap-env.sh --rotate-secrets
      ;;
    3)
      fail "Aborted by user"
      ;;
    *)
      fail "Invalid selection: $choice"
      ;;
  esac
}

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
    prompt_env_choice
  fi

  echo ""
  echo "[3/3] Deploying HUSH services..."
  bash ./offline/deploy-offline.sh
}

main "$@"
