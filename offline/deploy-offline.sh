#!/bin/bash
# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TARGET_CODENAME=""
TARGET_ID=""
BUNDLE_DIR=""
BUNDLE_PATH=""

print_header() {
  echo ""
  echo "============================================"
  echo "  HUSH Offline Deployment"
  echo "============================================"
  echo ""
}

fail() {
  echo "[ERROR] $*" >&2
  exit 1
}

detect_target_bundle() {
  [[ -f /etc/os-release ]] || fail "/etc/os-release not found"
  # shellcheck source=/etc/os-release
  . /etc/os-release

  local arch
  arch="$(dpkg --print-architecture 2>/dev/null || true)"

  [[ "${ID:-}" == "ubuntu" ]] || fail "Unsupported distribution: ${ID:-unknown}. Expected ubuntu."
  [[ "$arch" == "amd64" ]] || fail "Unsupported architecture: ${arch:-unknown}. Expected amd64."

  TARGET_CODENAME="${VERSION_CODENAME:-}"
  case "$TARGET_CODENAME" in
    jammy|noble) ;;
    *) fail "Unsupported Ubuntu codename: ${TARGET_CODENAME:-unknown}. Supported: jammy, noble." ;;
  esac

  TARGET_ID="${TARGET_CODENAME}-amd64"
  BUNDLE_DIR="$SCRIPT_DIR/bundles/$TARGET_ID"
  BUNDLE_PATH="$BUNDLE_DIR/hush-offline-bundle.tar"
}

preflight_runtime() {
  local runtime_ok=true

  echo "[1/7] Checking runtime prerequisites..."

  if ! command -v docker >/dev/null 2>&1; then
    echo "  [MISSING] docker"
    runtime_ok=false
  else
    echo "  [OK] docker found"
  fi

  if [[ "$runtime_ok" != true ]]; then
    fail "Install offline dependencies first: bash ./offline/install-system-deps.sh"
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker daemon is not running. Start Docker and retry."
  fi

  echo "[OK] Runtime prerequisites satisfied"
}

verify_bundle() {
  local size_mb

  echo ""
  echo "[2/7] Checking target bundle..."

  [[ -d "$BUNDLE_DIR" ]] || fail "Missing bundle directory: $BUNDLE_DIR"
  [[ -f "$BUNDLE_PATH" ]] || fail "Missing Docker image bundle: $BUNDLE_PATH"
  [[ -f "$BUNDLE_DIR/SHA256SUMS" ]] || fail "Missing checksum file: $BUNDLE_DIR/SHA256SUMS"

  size_mb="$(du -m "$BUNDLE_PATH" | cut -f1)"
  echo "[OK] Found image bundle for $TARGET_ID (${size_mb} MB)"
}

verify_required_files() {
  echo ""
  echo "[3/7] Verifying required deployment files..."

  local missing=()
  local required=(
    "docker-compose.yml"
    "nginx/nginx.conf"
    "offline/install-system-deps.sh"
    "offline/init-airgap-env.sh"
  )

  local path
  for path in "${required[@]}"; do
    if [[ -f "$PROJECT_ROOT/$path" ]]; then
      echo "  [OK] $path"
    else
      echo "  [MISSING] $path"
      missing+=("$path")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    fail "Missing required deployment files: ${missing[*]}"
  fi
}

verify_integrity() {
  echo ""
  echo "[4/7] Verifying bundle checksums..."

  (
    cd "$BUNDLE_DIR"
    sha256sum -c "SHA256SUMS"
  )

  echo "[OK] Bundle checksums verified"
}

verify_env_present() {
  echo ""
  echo "[5/7] Verifying .env presence and required keys..."

  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    echo "[ERROR] .env is mandatory and was not found at $PROJECT_ROOT/.env"
    echo "Create .env on this air-gapped machine now:"
    echo "  bash ./offline/init-airgap-env.sh"
    fail "Deployment stopped because .env is missing"
  fi

  local key
  local missing=()
  for key in AUTH_HASH KDF_SALT JWT_SECRET; do
    if ! grep -q "^${key}=" "$PROJECT_ROOT/.env"; then
      missing+=("$key")
    fi
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[ERROR] .env exists but is missing required keys: ${missing[*]}"
    echo "Recreate .env on this air-gapped machine:"
    echo "  bash ./offline/init-airgap-env.sh --rotate-secrets"
    fail "Deployment stopped because .env is invalid"
  fi

  echo "[OK] .env is present and valid"
}

ensure_ssl() {
  local ssl_dir cert_path key_path
  ssl_dir="$PROJECT_ROOT/nginx/ssl"
  cert_path="$ssl_dir/cert.pem"
  key_path="$ssl_dir/key.pem"

  echo ""
  echo "[6/7] Ensuring SSL certificates..."

  mkdir -p "$ssl_dir"
  if [[ -f "$cert_path" && -f "$key_path" ]]; then
    echo "[OK] SSL certificates already exist"
    return
  fi

  command -v openssl >/dev/null 2>&1 || fail "openssl not found and nginx SSL certs are missing"

  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$key_path" \
    -out "$cert_path" \
    -subj "/CN=localhost/O=HUSH/C=US" >/dev/null 2>&1

  echo "[OK] SSL certificates generated (valid 10 years)"
}

load_images_and_start() {
  local healthy=true
  local svc status
  local -a compose_images
  local image
  local image_platform

  echo ""
  echo "[7/7] Loading Docker images and starting services..."

  docker load -i "$BUNDLE_PATH"
  echo "[OK] Images loaded"

  mapfile -t compose_images < <(docker compose -f docker-compose.yml config --images 2>/dev/null | sed '/^[[:space:]]*$/d' | sort -u)
  if [[ ${#compose_images[@]} -eq 0 ]]; then
    fail "Could not resolve compose image list for platform verification"
  fi

  echo "[INFO] Verifying image platforms (expected linux/amd64)..."
  for image in "${compose_images[@]}"; do
    image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
    if [[ "$image_platform" != "linux/amd64" ]]; then
      fail "Image '$image' has platform '${image_platform:-unknown}'. Rebuild and transfer an amd64 bundle with ./offline/build-bundle.sh --target $TARGET_CODENAME"
    fi
    echo "  [OK] $image -> $image_platform"
  done

  if [[ -f "$PROJECT_ROOT/docker-compose.override.yml" ]]; then
    echo "[INFO] Ignoring docker-compose.override.yml for air-gapped deploy"
  fi

  DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -f docker-compose.yml down >/dev/null 2>&1 || true
  DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose -f docker-compose.yml up -d

  echo "  Waiting for services to initialize..."
  sleep 8

  for svc in postgres backend nginx; do
    status="$(docker compose -f docker-compose.yml ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "unknown")"
    if [[ "$status" =~ Up|running|healthy ]]; then
      echo "  [OK] $svc"
    else
      echo "  [WARN] $svc - $status"
      healthy=false
    fi
  done

  echo ""
  if [[ "$healthy" == true ]]; then
    echo "============================================"
    echo "  HUSH Deployed Successfully!"
    echo "============================================"
  else
    echo "============================================"
    echo "  HUSH Started (some services may need time)"
    echo "============================================"
  fi

  echo ""
  echo "Access your vault at: https://localhost"
  echo ""
  echo "Commands:"
  echo "  View logs:     docker compose -f docker-compose.yml logs -f"
  echo "  Stop:          docker compose -f docker-compose.yml down"
  echo "  Restart:       docker compose -f docker-compose.yml restart"
  echo "  Check status:  docker compose -f docker-compose.yml ps"
  echo ""
}

main() {
  if [[ $# -gt 0 ]]; then
    fail "deploy-offline.sh does not accept arguments. Use deploy-airgapped.sh for orchestration."
  fi

  print_header
  cd "$PROJECT_ROOT"
  detect_target_bundle
  preflight_runtime
  verify_bundle
  verify_required_files
  verify_integrity
  verify_env_present
  ensure_ssl
  load_images_and_start
}

main "$@"
