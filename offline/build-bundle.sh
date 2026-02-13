#!/bin/bash
# HUSH Offline Bundle Builder
# Run this on a machine WITH internet access.
# This script builds Docker images, generates .env secrets, and packages
# everything required for air-gapped deployment on Ubuntu 22.04 (jammy) amd64.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TARGET_DISTRO="jammy"
TARGET_ARCH="amd64"
DOCKER_POOL_URL="https://download.docker.com/linux/ubuntu/dists/${TARGET_DISTRO}/pool/stable/${TARGET_ARCH}"

BUNDLE_PATH="$SCRIPT_DIR/hush-offline-bundle.tar"
PKGS_ROOT="$SCRIPT_DIR/pkgs"
DOCKER_PKGS_DIR="$PKGS_ROOT/docker"
PYTHON_PKGS_DIR="$PKGS_ROOT/python"
ALL_PKGS_DIR="$PKGS_ROOT/all"
TMP_DIR="$SCRIPT_DIR/tmp"
MANIFESTS_DIR="$SCRIPT_DIR/manifests"

SHA_FILE="$SCRIPT_DIR/SHA256SUMS"
BUNDLE_MANIFEST="$SCRIPT_DIR/bundle-manifest.txt"
IMAGES_MANIFEST="$MANIFESTS_DIR/images.txt"
DOCKER_MANIFEST="$MANIFESTS_DIR/docker-packages.txt"
PYTHON_MANIFEST="$MANIFESTS_DIR/python-packages.txt"
ALL_MANIFEST="$MANIFESTS_DIR/all-packages.txt"
APT_CANDIDATES_MANIFEST="$MANIFESTS_DIR/apt-candidates.txt"

COMPOSE_CMD=()
PYTHON_CMD=""
DOWNLOAD_TOOL=""

print_header() {
    echo ""
    echo "============================================"
    echo "  HUSH Offline Bundle Builder"
    echo "============================================"
    echo ""
}

fail() {
    echo "[ERROR] $*" >&2
    exit 1
}

need_cmd() {
    local cmd="$1"
    command -v "$cmd" >/dev/null 2>&1 || fail "Required command not found: $cmd"
}

choose_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD=(docker compose)
        return
    fi
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
        return
    fi
    fail "Neither 'docker compose' nor 'docker-compose' is available"
}

choose_python_cmd() {
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_CMD="python3"
        return
    fi
    if command -v python >/dev/null 2>&1; then
        PYTHON_CMD="python"
        return
    fi
    fail "Python is required for secure secret generation"
}

choose_download_tool() {
    if command -v curl >/dev/null 2>&1; then
        DOWNLOAD_TOOL="curl"
        return
    fi
    if command -v wget >/dev/null 2>&1; then
        DOWNLOAD_TOOL="wget"
        return
    fi
    fail "Either curl or wget is required to download package artifacts"
}

download_text() {
    local url="$1"
    if [[ "$DOWNLOAD_TOOL" == "curl" ]]; then
        curl -fsSL "$url"
    else
        wget -qO- "$url"
    fi
}

download_file() {
    local url="$1"
    local output="$2"
    if [[ "$DOWNLOAD_TOOL" == "curl" ]]; then
        curl -fsSL "$url" -o "$output"
    else
        wget -qO "$output" "$url"
    fi
}

prepare_dirs() {
    rm -rf "$PKGS_ROOT" "$TMP_DIR" "$MANIFESTS_DIR"
    mkdir -p "$DOCKER_PKGS_DIR" "$PYTHON_PKGS_DIR" "$ALL_PKGS_DIR" "$TMP_DIR" "$MANIFESTS_DIR"
}

validate_prerequisites() {
    need_cmd docker
    choose_compose_cmd
    choose_python_cmd
    choose_download_tool

    docker info >/dev/null 2>&1 || fail "Docker daemon is not running"
}

generate_ssl_if_missing() {
    local ssl_dir cert_path key_path
    ssl_dir="$PROJECT_ROOT/nginx/ssl"
    cert_path="$ssl_dir/cert.pem"
    key_path="$ssl_dir/key.pem"

    mkdir -p "$ssl_dir"

    if [[ -f "$cert_path" && -f "$key_path" ]]; then
        echo "[OK] SSL certificates already exist"
        return
    fi

    if ! command -v openssl >/dev/null 2>&1; then
        fail "openssl not found and nginx SSL certs are missing"
    fi

    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$key_path" \
        -out "$cert_path" \
        -subj "/CN=localhost/O=HUSH/C=US" >/dev/null 2>&1
    echo "[OK] SSL certificates generated (valid 10 years)"
}

generate_env_and_words() {
    local words_output
    words_output="$("$PYTHON_CMD" -c "
import sys
sys.path.insert(0, 'cli')
from secret_generator import SecretGenerator
from config import ConfigManager

generator = SecretGenerator()
secrets = generator.generate_all()

config = {
    'deployment_mode': 'docker',
    'max_auth_failures': 5,
    'failure_mode': 'ip_temp',
    'ip_block_minutes': 5,
    'panic_mode': False,
    'persist_vault': True
}

manager = ConfigManager()
manager.write_env(config, secrets)

for word in secrets['words']:
    print(word)
" )"

    mapfile -t WORD_ARRAY <<< "$words_output"
}

download_latest_docker_packages() {
    local index_html filename pkg
    local packages=(
        "containerd.io"
        "docker-ce"
        "docker-ce-cli"
        "docker-buildx-plugin"
        "docker-compose-plugin"
    )

    : > "$DOCKER_MANIFEST"
    index_html="$(download_text "$DOCKER_POOL_URL/")"

    for pkg in "${packages[@]}"; do
        filename="$(printf '%s' "$index_html" \
            | grep -oE "href=\"${pkg}_[^\"]+_${TARGET_ARCH}\\.deb\"" \
            | sed -E 's/^href=\"|\"$//g' \
            | sort -Vu \
            | tail -n1 || true)"

        [[ -n "$filename" ]] || fail "Could not resolve latest package for ${pkg}"

        echo "  - $filename"
        download_file "${DOCKER_POOL_URL}/${filename}" "$DOCKER_PKGS_DIR/$filename"
        echo "$filename" >> "$DOCKER_MANIFEST"
    done
}

collect_dependency_closure() {
    local jammy_image="ubuntu:22.04"
    local docker_deps_dir="$TMP_DIR/docker-deps"
    mkdir -p "$docker_deps_dir"

    docker pull "$jammy_image" >/dev/null

    docker run --rm --platform "linux/${TARGET_ARCH}" \
        -v "$PYTHON_PKGS_DIR:/out/python" \
        -v "$docker_deps_dir:/out/docker-deps" \
        -v "$MANIFESTS_DIR:/out/manifests" \
        "$jammy_image" bash -s <<'EOF'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
APT_OPTS=("-y" "--no-install-recommends")
DOCKER_PKGS=(containerd.io docker-ce docker-ce-cli docker-buildx-plugin docker-compose-plugin)
PYTHON_PKGS=(python3 python3-pip python3-venv)

apt-get update
apt-get install "${APT_OPTS[@]}" ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu jammy stable" \
    > /etc/apt/sources.list.d/docker.list

apt-get update

{
  echo "# Candidate versions in jammy at bundle build time"
  for pkg in "${DOCKER_PKGS[@]}" "${PYTHON_PKGS[@]}"; do
    candidate="$(apt-cache policy "$pkg" | awk '/Candidate:/ {print $2; exit}')"
    if [[ -z "${candidate:-}" || "$candidate" == "(none)" ]]; then
      echo "$pkg=<missing>"
    else
      echo "$pkg=$candidate"
    fi
  done
} > /out/manifests/apt-candidates.txt

rm -f /var/cache/apt/archives/*.deb
apt-get install "${APT_OPTS[@]}" --download-only "${PYTHON_PKGS[@]}"
cp /var/cache/apt/archives/*.deb /out/python/

rm -f /var/cache/apt/archives/*.deb
apt-get install "${APT_OPTS[@]}" --download-only "${DOCKER_PKGS[@]}"
cp /var/cache/apt/archives/*.deb /out/docker-deps/
EOF

    # Merge and dedupe package sets.
    cp "$DOCKER_PKGS_DIR"/*.deb "$ALL_PKGS_DIR"/
    cp "$PYTHON_PKGS_DIR"/*.deb "$ALL_PKGS_DIR"/
    cp "$docker_deps_dir"/*.deb "$ALL_PKGS_DIR"/

    find "$PYTHON_PKGS_DIR" -maxdepth 1 -type f -name "*.deb" -printf "%f\n" | sort -u > "$PYTHON_MANIFEST"
}

build_and_collect_images() {
    local -a compose_images
    local image

    "${COMPOSE_CMD[@]}" build --no-cache

    if mapfile -t compose_images < <("${COMPOSE_CMD[@]}" config --images 2>/dev/null | sed '/^\s*$/d' | sort -u); then
        :
    else
        compose_images=()
    fi

    if [[ ${#compose_images[@]} -eq 0 ]]; then
        fail "Could not resolve images from docker compose config"
    fi

    : > "$IMAGES_MANIFEST"
    for image in "${compose_images[@]}"; do
        echo "$image" >> "$IMAGES_MANIFEST"
        if ! docker image inspect "$image" >/dev/null 2>&1; then
            docker pull "$image" >/dev/null
        fi
    done

    rm -f "$BUNDLE_PATH"
    docker save "${compose_images[@]}" -o "$BUNDLE_PATH"
}

generate_integrity_files() {
    find "$ALL_PKGS_DIR" -maxdepth 1 -type f -name "*.deb" -printf "%f\n" | sort -u > "$ALL_MANIFEST"

    {
        echo "bundle_created_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        echo "target_distro=${TARGET_DISTRO}"
        echo "target_arch=${TARGET_ARCH}"
        echo "image_count=$(wc -l < "$IMAGES_MANIFEST" | tr -d ' ')"
        echo "docker_package_count=$(wc -l < "$DOCKER_MANIFEST" | tr -d ' ')"
        echo "python_package_count=$(wc -l < "$PYTHON_MANIFEST" | tr -d ' ')"
        echo "all_package_count=$(wc -l < "$ALL_MANIFEST" | tr -d ' ')"
        echo "images_manifest=offline/manifests/images.txt"
        echo "docker_packages_manifest=offline/manifests/docker-packages.txt"
        echo "python_packages_manifest=offline/manifests/python-packages.txt"
        echo "all_packages_manifest=offline/manifests/all-packages.txt"
        echo "apt_candidates_manifest=offline/manifests/apt-candidates.txt"
    } > "$BUNDLE_MANIFEST"

    (
        cd "$PROJECT_ROOT"
        {
            sha256sum "offline/hush-offline-bundle.tar"
            find "offline/pkgs" -type f -name "*.deb" -print | sort | xargs -r sha256sum
            sha256sum "docker-compose.yml"
            sha256sum "nginx/nginx.conf"
            sha256sum "offline/install-system-deps.sh"
            sha256sum "offline/deploy-offline.sh"
            sha256sum "offline/generate_secrets.py"
            sha256sum "offline/bundle-manifest.txt"
            find "offline/manifests" -type f -name "*.txt" -print | sort | xargs -r sha256sum
            sha256sum ".env"
        } > "$SHA_FILE"
    )
}

show_words_and_summary() {
    local bundle_size_mb
    bundle_size_mb=$(du -m "$BUNDLE_PATH" | cut -f1)

    echo ""
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

    echo "============================================"
    echo "  Bundle Complete!"
    echo "============================================"
    echo ""
    echo "Artifacts generated:"
    echo "  offline/hush-offline-bundle.tar       (${bundle_size_mb} MB)"
    echo "  offline/pkgs/docker/*.deb             (core Docker engine packages)"
    echo "  offline/pkgs/python/*.deb             (python3/pip/venv + deps)"
    echo "  offline/pkgs/all/*.deb                (union for offline install)"
    echo "  offline/install-system-deps.sh"
    echo "  offline/manifests/*.txt"
    echo "  offline/bundle-manifest.txt"
    echo "  offline/SHA256SUMS"
    echo "  .env"
    echo ""
    echo "On the air-gapped machine:"
    echo "  1) bash ./offline/install-system-deps.sh"
    echo "  2) bash ./offline/deploy-offline.sh"
    echo ""
}

main() {
    print_header
    validate_prerequisites

    cd "$PROJECT_ROOT"
    prepare_dirs

    echo "[1/8] Preparing SSL certificates..."
    generate_ssl_if_missing

    echo ""
    echo "[2/8] Generating cryptographic secrets..."
    generate_env_and_words
    echo "[OK] Secrets generated (.env updated)"

    echo ""
    echo "[3/8] Building application images..."
    build_and_collect_images
    echo "[OK] Docker image bundle created"

    echo ""
    echo "[4/8] Downloading latest Docker engine .deb files from ${DOCKER_POOL_URL}..."
    download_latest_docker_packages
    echo "[OK] Docker engine packages downloaded"

    echo ""
    echo "[5/8] Resolving python/docker dependency closure on Ubuntu ${TARGET_DISTRO}..."
    collect_dependency_closure
    echo "[OK] Dependency packages collected"

    echo ""
    echo "[6/8] Writing package manifests..."
    # Manifests for docker/python are generated during previous steps.
    [[ -f "$DOCKER_MANIFEST" ]] || fail "Missing docker manifest"
    [[ -f "$PYTHON_MANIFEST" ]] || fail "Missing python manifest"
    [[ -f "$APT_CANDIDATES_MANIFEST" ]] || fail "Missing apt candidates manifest"
    echo "[OK] Manifests written"

    echo ""
    echo "[7/8] Generating checksums and bundle metadata..."
    generate_integrity_files
    echo "[OK] Integrity files written"

    echo ""
    echo "[8/8] Finalizing bundle summary..."
    show_words_and_summary
}

main "$@"
