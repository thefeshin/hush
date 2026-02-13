#!/bin/bash
# HUSH Air-Gapped Environment Initializer
# Generates .env on the air-gapped machine and prints 12 login words once.

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
Usage: bash ./offline/init-airgap-env.sh [--rotate-secrets]

Options:
  --rotate-secrets   Replace existing .env (backs up to .env.backup)
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

pick_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo "python3"
    return
  fi
  if command -v python >/dev/null 2>&1; then
    echo "python"
    return
  fi
  fail "Python is required. Install offline deps first: bash ./offline/install-system-deps.sh"
}

validate_env_keys() {
  local key
  local missing=()
  for key in AUTH_HASH KDF_SALT JWT_SECRET; do
    if ! grep -q "^${key}=" "$PROJECT_ROOT/.env"; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    fail ".env was generated but missing required keys: ${missing[*]}"
  fi
}

main() {
  parse_args "$@"

  local python_cmd
  local words_output
  local -a words

  python_cmd="$(pick_python)"

  [[ -f "$SCRIPT_DIR/generate_secrets.py" ]] || fail "Missing offline/generate_secrets.py"

  if [[ -f "$PROJECT_ROOT/.env" && "$ROTATE_SECRETS" != true ]]; then
    fail ".env already exists. To rotate secrets run: bash ./offline/init-airgap-env.sh --rotate-secrets"
  fi

  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"
    echo "[WARN] Existing .env backed up to .env.backup"
  fi

  words_output="$($python_cmd "$SCRIPT_DIR/generate_secrets.py")"
  mapfile -t words <<< "$words_output"

  [[ -f "$PROJECT_ROOT/.env" ]] || fail "Secret generation did not create .env"
  validate_env_keys

  if [[ ${#words[@]} -ne 12 ]]; then
    fail "Expected 12 recovery words, got ${#words[@]}"
  fi

  echo ""
  echo "YOUR 12-WORD VAULT PASSPHRASE:"
  echo "${words[*]}"
  echo ""
  echo "================================================================"
  echo "  WRITE THESE DOWN NOW. THEY WILL NOT BE SHOWN AGAIN."
  echo "  WITHOUT THESE WORDS, YOUR VAULT DATA IS UNRECOVERABLE."
  echo "================================================================"
  echo ""
  echo "[OK] .env created at $PROJECT_ROOT/.env"
  echo "Next step: bash ./offline/deploy-offline.sh"
}

main "$@"
