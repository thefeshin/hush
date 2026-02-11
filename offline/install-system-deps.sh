#!/bin/bash
# HUSH Offline System Dependency Installer
# Installs Docker Engine + Python runtime from local .deb packages only.
# Target platform: Ubuntu 22.04 (jammy) amd64.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PKGS_ALL_DIR="$SCRIPT_DIR/pkgs/all"
CHECKSUM_FILE="$SCRIPT_DIR/SHA256SUMS"

SUDO=""

print_header() {
    echo ""
    echo "============================================"
    echo "  HUSH Offline System Dependency Installer"
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

ensure_sudo() {
    if [[ "$EUID" -eq 0 ]]; then
        SUDO=""
        return
    fi

    need_cmd sudo
    SUDO="sudo"
}

ensure_jammy_amd64() {
    [[ -f /etc/os-release ]] || fail "/etc/os-release not found"
    # shellcheck source=/etc/os-release
    . /etc/os-release

    local id codename arch
    id="${ID:-}"
    codename="${VERSION_CODENAME:-}"
    arch="$(dpkg --print-architecture 2>/dev/null || true)"

    [[ "$id" == "ubuntu" ]] || fail "Unsupported distribution: ${id:-unknown}. Expected ubuntu."
    [[ "$codename" == "jammy" ]] || fail "Unsupported Ubuntu codename: ${codename:-unknown}. Expected jammy."
    [[ "$arch" == "amd64" ]] || fail "Unsupported architecture: ${arch:-unknown}. Expected amd64."
}

verify_package_dir() {
    [[ -d "$PKGS_ALL_DIR" ]] || fail "Missing package directory: $PKGS_ALL_DIR"

    mapfile -t DEB_FILES < <(find "$PKGS_ALL_DIR" -maxdepth 1 -type f -name "*.deb" | sort)
    [[ "${#DEB_FILES[@]}" -gt 0 ]] || fail "No .deb files found in $PKGS_ALL_DIR"
}

verify_checksums_if_available() {
    if [[ ! -f "$CHECKSUM_FILE" ]]; then
        echo "[WARN] $CHECKSUM_FILE not found; skipping checksum verification"
        return
    fi

    echo "[1/5] Verifying checksums..."
    (
        cd "$PROJECT_ROOT"
        sha256sum -c "offline/SHA256SUMS" --ignore-missing
    )
    echo "[OK] Checksums verified"
}

install_local_debs() {
    local install_failed=0

    echo ""
    echo "[2/5] Installing local .deb packages..."
    if ! $SUDO apt-get install -y --no-download "${DEB_FILES[@]}"; then
        install_failed=1
        echo "[WARN] apt local install was incomplete; attempting dpkg + apt fix using local cache"
    fi

    if [[ "$install_failed" -eq 1 ]]; then
        echo ""
        echo "[3/5] Retrying with dpkg + offline apt fix..."
        $SUDO cp "${DEB_FILES[@]}" /var/cache/apt/archives/
        $SUDO dpkg -i "${DEB_FILES[@]}" || true
        $SUDO apt-get install -y --no-download -f
        echo "[OK] Offline dependency repair complete"
    else
        echo "[OK] Local package install complete"
    fi
}

verify_runtime() {
    local missing=()

    echo ""
    echo "[4/5] Verifying runtime commands..."

    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v python3 >/dev/null 2>&1 || missing+=("python3")
    command -v pip3 >/dev/null 2>&1 || missing+=("pip3")

    if ! python3 -m venv --help >/dev/null 2>&1; then
        missing+=("python3-venv")
    fi

    if ! docker compose version >/dev/null 2>&1; then
        missing+=("docker-compose-plugin")
    fi

    if [[ "${#missing[@]}" -gt 0 ]]; then
        fail "Missing runtime pieces after install: ${missing[*]}"
    fi

    echo "[OK] docker, compose plugin, python3, pip3, and venv are available"
}

start_docker_service() {
    echo ""
    echo "[5/5] Starting Docker service..."

    if command -v systemctl >/dev/null 2>&1; then
        $SUDO systemctl enable docker >/dev/null 2>&1 || true
        $SUDO systemctl start docker >/dev/null 2>&1 || true
    fi

    if ! $SUDO docker info >/dev/null 2>&1; then
        echo "[WARN] Docker service may not be running yet. Start it manually before deployment."
    else
        echo "[OK] Docker daemon is reachable"
    fi
}

print_summary() {
    echo ""
    echo "============================================"
    echo "  System Dependencies Ready"
    echo "============================================"
    echo ""

    if [[ "$EUID" -ne 0 ]] && ! groups "$USER" | grep -q '\bdocker\b'; then
        echo "Note: add your user to the docker group for non-root Docker access:"
        echo "  sudo usermod -aG docker $USER"
        echo "Then log out and log back in."
        echo ""
    fi

    echo "Next step:"
    echo "  bash ./offline/deploy-offline.sh"
    echo ""
}

main() {
    print_header
    need_cmd apt-get
    need_cmd dpkg
    ensure_sudo
    ensure_jammy_amd64
    verify_package_dir
    verify_checksums_if_available
    install_local_debs
    verify_runtime
    start_docker_service
    print_summary
}

main "$@"
