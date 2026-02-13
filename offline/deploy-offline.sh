#!/bin/bash
# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PYTHON_CMD=""
BUNDLE_PATH=""
ROTATE_SECRETS=false
WORD_ARRAY=()

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

pick_python() {
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_CMD="python3"
        return
    fi
    if command -v python >/dev/null 2>&1; then
        PYTHON_CMD="python"
        return
    fi
    PYTHON_CMD=""
}

pick_bundle_path() {
    local preferred legacy
    preferred="$SCRIPT_DIR/hush-offline-bundle.tar"
    legacy="$PROJECT_ROOT/hush-offline-bundle.tar"

    if [[ -f "$preferred" ]]; then
        BUNDLE_PATH="$preferred"
        return
    fi
    if [[ -f "$legacy" ]]; then
        BUNDLE_PATH="$legacy"
        return
    fi

    BUNDLE_PATH="$preferred"
}

preflight_runtime() {
    local runtime_ok=true

    echo "[1/7] Checking system runtime prerequisites..."

    if ! command -v docker >/dev/null 2>&1; then
        echo "  [MISSING] docker"
        runtime_ok=false
    else
        echo "  [OK] docker found"
    fi

    pick_python
    if [[ -z "$PYTHON_CMD" ]]; then
        echo "  [MISSING] python3/python"
        runtime_ok=false
    else
        echo "  [OK] $PYTHON_CMD found"
    fi

    if [[ "$runtime_ok" != true ]]; then
        echo ""
        echo "[ERROR] Missing required system dependencies."
        echo "Install them using bundled offline packages:"
        echo "  bash ./offline/install-system-deps.sh"
        exit 1
    fi

    if ! docker info >/dev/null 2>&1; then
        fail "Docker daemon is not running. Start Docker, then retry."
    fi

    echo "[OK] Runtime prerequisites satisfied"
}

verify_bundle() {
    local size_mb

    echo ""
    echo "[2/7] Checking Docker image bundle..."
    pick_bundle_path

    if [[ ! -f "$BUNDLE_PATH" ]]; then
        echo ""
        echo "[ERROR] Docker image bundle not found!"
        echo "  Expected path: $BUNDLE_PATH"
        echo ""
        echo "Create artifacts on internet-connected machine:"
        echo "  bash ./offline/build-bundle.sh"
        echo "Then copy the full offline folder + project files."
        exit 1
    fi

    size_mb=$(du -m "$BUNDLE_PATH" | cut -f1)
    echo "[OK] Found bundle: ${size_mb} MB"
}

verify_required_files() {
    echo ""
    echo "[3/7] Verifying required files..."

    local missing=()
    local path
    local required=(
        "docker-compose.yml"
        "nginx/nginx.conf"
        "offline/generate_secrets.py"
        "offline/SHA256SUMS"
    )

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
    echo "[4/7] Verifying artifact checksums..."

    (
        cd "$PROJECT_ROOT"
        sha256sum -c "offline/SHA256SUMS"
    )

    echo "[OK] All artifact checksums verified"
}

ensure_ssl() {
    local ssl_dir cert_path key_path
    ssl_dir="$PROJECT_ROOT/nginx/ssl"
    cert_path="$ssl_dir/cert.pem"
    key_path="$ssl_dir/key.pem"

    echo ""
    echo "[5/7] Ensuring SSL certificates..."

    mkdir -p "$ssl_dir"
    if [[ -f "$cert_path" && -f "$key_path" ]]; then
        echo "[OK] SSL certificates already exist"
        return
    fi

    command -v openssl >/dev/null 2>&1 || fail "openssl not found and nginx/ssl certs are missing"

    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$key_path" \
        -out "$cert_path" \
        -subj "/CN=localhost/O=HUSH/C=US" >/dev/null 2>&1

    echo "[OK] SSL certificates generated (valid 10 years)"
}

generate_env_and_words() {
    local words_output

    echo ""
    echo "[6/7] Preparing deployment secrets..."

    if [[ -f "$PROJECT_ROOT/.env" && "$ROTATE_SECRETS" != true ]]; then
        echo "[OK] Reusing existing .env"
        return
    fi

    if [[ -f "$PROJECT_ROOT/.env" ]]; then
        echo "  [WARN] Rotating secrets, backing up existing .env to .env.backup"
        cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"
    fi

    words_output="$("$PYTHON_CMD" "$SCRIPT_DIR/generate_secrets.py")"
    mapfile -t WORD_ARRAY <<< "$words_output"
    echo "[OK] Secrets generated"
}

load_images_and_start() {
    local healthy=true
    local svc status

    echo ""
    echo "[7/7] Loading Docker images and starting services..."

    docker load -i "$BUNDLE_PATH"
    echo "[OK] Images loaded"

    docker compose down >/dev/null 2>&1 || true
    docker compose up -d

    echo "  Waiting for services to initialize..."
    sleep 8

    for svc in postgres backend nginx; do
        status="$(docker compose ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "unknown")"
        if [[ "$status" =~ Up|running|healthy ]]; then
            echo "  [OK] $svc"
        else
            echo "  [WARN] $svc - $status"
            healthy=false
        fi
    done

    if [[ ${#WORD_ARRAY[@]} -eq 12 ]]; then
        echo ""
        echo "================================================================"
        echo "         YOUR 12-WORD VAULT PASSPHRASE"
        echo "================================================================"
        echo ""

        for ((i=0; i<12; i+=3)); do
            printf "   %2d. %-12s  %2d. %-12s  %2d. %-12s\n" \
                $((i+1)) "${WORD_ARRAY[$i]}" \
                $((i+2)) "${WORD_ARRAY[$((i+1))]}" \
                $((i+3)) "${WORD_ARRAY[$((i+2))]}"
        done

        echo ""
        echo "================================================================"
        echo "  WRITE THESE DOWN NOW. THEY WILL NOT BE SHOWN AGAIN."
        echo "  Without these words, your vault data is UNRECOVERABLE."
        echo "================================================================"
        echo ""
    fi

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
    echo "  View logs:     docker compose logs -f"
    echo "  Stop:          docker compose down"
    echo "  Restart:       docker compose restart"
    echo "  Check status:  docker compose ps"
    echo ""
}

main() {
    if [[ "${1:-}" == "--rotate-secrets" ]]; then
        ROTATE_SECRETS=true
        echo "[WARN] --rotate-secrets enabled: existing vault access words will change"
    elif [[ -n "${1:-}" ]]; then
        fail "Unknown argument: $1 (supported: --rotate-secrets)"
    fi

    print_header
    cd "$PROJECT_ROOT"
    preflight_runtime
    verify_bundle
    verify_required_files
    verify_integrity
    ensure_ssl
    generate_env_and_words
    load_images_and_start
}

main "$@"
