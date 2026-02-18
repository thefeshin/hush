#!/bin/bash
# HUSH Offline Bundle Builder
# Run this on a machine WITH internet access.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TARGET_ARCH="amd64"
TARGET="all"
OUTPUT_ROOT="$SCRIPT_DIR/bundles"
NO_CACHE=false

COMPOSE_CMD=()
DOWNLOAD_TOOL=""
TMP_DIR="$SCRIPT_DIR/tmp"

DOCKER_PACKAGES=(
  "containerd.io"
  "docker-ce"
  "docker-ce-cli"
  "docker-buildx-plugin"
  "docker-compose-plugin"
)

PYTHON_PACKAGES=(
  "python3"
  "python3-pip"
  "python3-venv"
)

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

usage() {
  cat <<EOF
Usage: bash ./offline/build-bundle.sh [options]

Options:
  --target <jammy|noble|all>   Target Ubuntu codename(s). Default: all
  --output-dir <path>          Output root directory. Default: offline/bundles
  --no-cache                   Pass --no-cache to docker compose build
  -h, --help                   Show this help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target)
        [[ $# -ge 2 ]] || fail "--target requires a value"
        TARGET="$2"
        shift 2
        ;;
      --output-dir)
        [[ $# -ge 2 ]] || fail "--output-dir requires a value"
        OUTPUT_ROOT="$2"
        shift 2
        ;;
      --no-cache)
        NO_CACHE=true
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

choose_download_tool() {
  if command -v curl >/dev/null 2>&1; then
    DOWNLOAD_TOOL="curl"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    DOWNLOAD_TOOL="wget"
    return
  fi
  fail "Either curl or wget is required"
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

validate_target() {
  case "$TARGET" in
    jammy|noble|all) ;;
    *) fail "Invalid --target '$TARGET'. Use jammy, noble, or all." ;;
  esac
}

resolve_targets() {
  if [[ "$TARGET" == "all" ]]; then
    echo "jammy noble"
  else
    echo "$TARGET"
  fi
}

ubuntu_tag_for() {
  case "$1" in
    jammy) echo "22.04" ;;
    noble) echo "24.04" ;;
    *) fail "Unsupported target codename: $1" ;;
  esac
}

docker_pool_url_for() {
  local codename="$1"
  echo "https://download.docker.com/linux/ubuntu/dists/${codename}/pool/stable/${TARGET_ARCH}"
}

validate_prerequisites() {
  need_cmd docker
  need_cmd sha256sum
  need_cmd sort
  need_cmd sed
  need_cmd grep
  choose_compose_cmd
  choose_download_tool

  [[ -f "$PROJECT_ROOT/docker-compose.yml" ]] || fail "Missing docker-compose.yml"
  [[ -f "$PROJECT_ROOT/offline/install-system-deps.sh" ]] || fail "Missing offline/install-system-deps.sh"
  [[ -f "$PROJECT_ROOT/offline/deploy-offline.sh" ]] || fail "Missing offline/deploy-offline.sh"
  [[ -f "$PROJECT_ROOT/offline/init-airgap-env.sh" ]] || fail "Missing offline/init-airgap-env.sh"
  [[ -f "$PROJECT_ROOT/offline/deploy-airgapped.sh" ]] || fail "Missing offline/deploy-airgapped.sh"
  [[ -f "$PROJECT_ROOT/offline/generate_secrets.py" ]] || fail "Missing offline/generate_secrets.py"
  [[ -f "$PROJECT_ROOT/nginx/nginx.conf" ]] || fail "Missing nginx/nginx.conf"

  docker info >/dev/null 2>&1 || fail "Docker daemon is not running"
}

prepare_dirs() {
  rm -rf "$TMP_DIR"
  mkdir -p "$TMP_DIR"
  mkdir -p "$OUTPUT_ROOT"
}

build_image_bundle() {
  local -a compose_images
  local image
  local -a build_args
  local image_platform
  local local_image_platform
  local pulled_platform_variant
  local save_supports_platform=false
  local inspect_supports_platform=false

  build_args=(build)
  if [[ "$NO_CACHE" == true ]]; then
    build_args+=(--no-cache)
  fi
  build_args+=(--pull)

  echo "[bundle] Building images for linux/${TARGET_ARCH}"
  DOCKER_DEFAULT_PLATFORM="linux/${TARGET_ARCH}" "${COMPOSE_CMD[@]}" "${build_args[@]}"

  compose_images=()
  while IFS= read -r image; do
    [[ -n "$image" ]] && compose_images+=("$image")
  done < <("${COMPOSE_CMD[@]}" config --images 2>/dev/null | sed '/^[[:space:]]*$/d' | sort -u)

  [[ ${#compose_images[@]} -gt 0 ]] || fail "Could not resolve docker images from compose config"

  if docker image save --help 2>/dev/null | grep -q -- '--platform'; then
    save_supports_platform=true
  fi
  if docker image inspect --help 2>/dev/null | grep -q -- '--platform'; then
    inspect_supports_platform=true
  fi

  if [[ "$save_supports_platform" != true || "$inspect_supports_platform" != true ]]; then
    fail "Your Docker CLI does not support platform-pinned inspect/save. Please upgrade Docker (or build bundle on an amd64 host) to export an amd64-only offline tar."
  fi

  : > "$TMP_DIR/images.txt"
  for image in "${compose_images[@]}"; do
    echo "$image" >> "$TMP_DIR/images.txt"

    local_image_platform=""
    if docker image inspect "$image" >/dev/null 2>&1; then
      local_image_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
    fi

    pulled_platform_variant=false
    if docker pull --platform "linux/${TARGET_ARCH}" "$image" >/dev/null 2>&1; then
      pulled_platform_variant=true
    elif [[ -z "$local_image_platform" ]]; then
      fail "Image $image is not available locally and could not be pulled for linux/${TARGET_ARCH}."
    else
      echo "[bundle] Using local image $image (could not pull remote tag)"
    fi

    if [[ "$pulled_platform_variant" == true ]]; then
      image_platform="$(docker image inspect --platform "linux/${TARGET_ARCH}" --format '{{.Os}}/{{.Architecture}}' "$image" 2>/dev/null || true)"
    else
      image_platform="$local_image_platform"
    fi

    if [[ "$image_platform" != "linux/${TARGET_ARCH}" ]]; then
      fail "Image $image resolved to platform '${image_platform:-unknown}', expected linux/${TARGET_ARCH}. Rebuild/pull failed."
    fi

    echo "[bundle] Using $image ($image_platform variant)"
  done

  docker image save --platform "linux/${TARGET_ARCH}" -o "$TMP_DIR/hush-offline-bundle.tar" "${compose_images[@]}"
}

prepare_target_layout() {
  local target_id="$1"
  local target_dir="$OUTPUT_ROOT/$target_id"

  rm -rf "$target_dir"
  mkdir -p "$target_dir/pkgs/docker" "$target_dir/pkgs/python" "$target_dir/pkgs/all" "$target_dir/manifests"

  cp "$TMP_DIR/hush-offline-bundle.tar" "$target_dir/hush-offline-bundle.tar"
  cp "$TMP_DIR/images.txt" "$target_dir/manifests/images.txt"

  cp "$PROJECT_ROOT/docker-compose.yml" "$target_dir/docker-compose.yml"
  if [[ -f "$PROJECT_ROOT/docker-compose.override.yml" ]]; then
    cp "$PROJECT_ROOT/docker-compose.override.yml" "$target_dir/docker-compose.override.yml"
  fi
  cp -R "$PROJECT_ROOT/nginx" "$target_dir/nginx"
  cp "$PROJECT_ROOT/offline/install-system-deps.sh" "$target_dir/install-system-deps.sh"
  cp "$PROJECT_ROOT/offline/deploy-offline.sh" "$target_dir/deploy-offline.sh"
  cp "$PROJECT_ROOT/offline/init-airgap-env.sh" "$target_dir/init-airgap-env.sh"
  cp "$PROJECT_ROOT/offline/deploy-airgapped.sh" "$target_dir/deploy-airgapped.sh"
  cp "$PROJECT_ROOT/offline/generate_secrets.py" "$target_dir/generate_secrets.py"
}

download_docker_packages() {
  local codename="$1"
  local target_dir="$2"
  local pool_url index_html filename pkg

  pool_url="$(docker_pool_url_for "$codename")"
  index_html="$(download_text "$pool_url/")"
  : > "$target_dir/manifests/docker-packages.txt"

  for pkg in "${DOCKER_PACKAGES[@]}"; do
    filename="$(printf '%s' "$index_html" \
      | grep -oE "href=\"${pkg}_[^\"]+_${TARGET_ARCH}\\.deb\"" \
      | sed -E 's/^href="|"$//g' \
      | sort -Vu \
      | tail -n1 || true)"

    [[ -n "$filename" ]] || fail "Could not resolve latest package for $pkg on $codename"
    download_file "$pool_url/$filename" "$target_dir/pkgs/docker/$filename"
    echo "$filename" >> "$target_dir/manifests/docker-packages.txt"
  done
}

collect_dependency_closure() {
  local codename="$1"
  local ubuntu_tag="$2"
  local target_dir="$3"
  local deps_tmp_dir="$TMP_DIR/${codename}-deps"
  local closure_log="$target_dir/manifests/dependency-closure.log"
  local closure_script="$TMP_DIR/${codename}-dependency-closure.sh"

  mkdir -p "$deps_tmp_dir"
  docker pull "ubuntu:${ubuntu_tag}" >/dev/null

  : > "$closure_log"
  echo "[closure] target=$codename ubuntu_tag=$ubuntu_tag arch=$TARGET_ARCH" | tee -a "$closure_log"

  cat > "$closure_script" <<'EOF'
#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
APT_OPTS=("-y" "--no-install-recommends")
DOCKER_PKGS=(containerd.io docker-ce docker-ce-cli docker-buildx-plugin docker-compose-plugin)
PYTHON_PKGS=(python3 python3-pip python3-venv)

echo "[closure] uname: $(uname -a)"
echo "[closure] target codename: ${TARGET_CODENAME}"

mkdir -p /tmp/apt-cache

print_cache_state() {
  local label="$1"
  echo "[closure] cache state (${label})"
  ls -lah /tmp/apt-cache || true
  if compgen -G "/tmp/apt-cache/*.deb" >/dev/null; then
    ls -1 /tmp/apt-cache/*.deb | sed 's|.*/||' | sort -u
  else
    echo "[closure] no deb files in /tmp/apt-cache"
  fi
}

apt-get update
apt-get install "${APT_OPTS[@]}" ca-certificates curl gnupg

# Ubuntu Docker images often include apt auto-clean hooks that remove cached
# .deb files immediately after apt operations. Disable this so --download-only
# artifacts remain available for bundling.
rm -f /etc/apt/apt.conf.d/docker-clean

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${TARGET_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update

echo "[closure] apt keep-downloaded settings"
apt-config dump | grep -E 'Keep-Downloaded|Post-Invoke|docker-clean' || true

{
  echo "# Candidate versions for ${TARGET_CODENAME} at bundle build time"
  for pkg in "${DOCKER_PKGS[@]}" "${PYTHON_PKGS[@]}"; do
    echo "[closure] resolving candidate for ${pkg}" >&2
    policy_output="$(apt-cache policy "$pkg" || true)"
    candidate="$(printf '%s\n' "$policy_output" | awk '/Candidate:/ {print $2} END {if (NR == 0) print ""}')"
    if [[ -z "${candidate:-}" || "$candidate" == "(none)" ]]; then
      echo "$pkg=<missing>"
    else
      echo "$pkg=$candidate"
    fi
  done
} > /out/manifests/apt-candidates.txt

echo "[closure] wrote /out/manifests/apt-candidates.txt"

rm -f /tmp/apt-cache/*.deb
apt-get install "${APT_OPTS[@]}" --reinstall --download-only \
  -o APT::Keep-Downloaded-Packages=true \
  -o Dir::Cache::archives=/tmp/apt-cache \
  "${PYTHON_PKGS[@]}"
print_cache_state "after python download"
if compgen -G "/tmp/apt-cache/*.deb" >/dev/null; then
  cp /tmp/apt-cache/*.deb /out/python/
  echo "[closure] python debs copied to /out/python"
  ls -lah /out/python || true
else
  echo "No Python .deb packages were downloaded" >&2
  apt-cache policy "${PYTHON_PKGS[@]}" || true
  exit 1
fi

rm -f /tmp/apt-cache/*.deb
apt-get install "${APT_OPTS[@]}" --reinstall --download-only \
  -o APT::Keep-Downloaded-Packages=true \
  -o Dir::Cache::archives=/tmp/apt-cache \
  "${DOCKER_PKGS[@]}"
print_cache_state "after docker deps download"
if compgen -G "/tmp/apt-cache/*.deb" >/dev/null; then
  cp /tmp/apt-cache/*.deb /out/docker-deps/
  echo "[closure] docker dep debs copied to /out/docker-deps"
  ls -lah /out/docker-deps || true
else
  echo "No Docker dependency .deb packages were downloaded" >&2
  apt-cache policy "${DOCKER_PKGS[@]}" || true
  exit 1
fi
EOF

  chmod +x "$closure_script"

  if ! docker run --rm --platform "linux/${TARGET_ARCH}" \
    -e TARGET_CODENAME="$codename" \
    -v "$target_dir/pkgs/python:/out/python" \
    -v "$deps_tmp_dir:/out/docker-deps" \
    -v "$target_dir/manifests:/out/manifests" \
    -v "$closure_script:/tmp/dependency-closure.sh:ro" \
    "ubuntu:${ubuntu_tag}" bash /tmp/dependency-closure.sh >>"$closure_log" 2>&1
  then
    echo "[debug] dependency closure container failed; log tail:" >&2
    tail -n 120 "$closure_log" >&2 || true
    fail "Dependency closure step failed for $codename (see $closure_log)"
  fi

  if [[ ! -f "$target_dir/manifests/apt-candidates.txt" ]]; then
    echo "[debug] apt-candidates.txt missing; closure log tail:" >&2
    tail -n 120 "$closure_log" >&2 || true
    fail "Dependency closure did not produce apt-candidates.txt for $codename"
  fi

  local source_dir
  local -a deb_files
  for source_dir in "$target_dir/pkgs/docker" "$target_dir/pkgs/python" "$deps_tmp_dir"; do
    shopt -s nullglob
    deb_files=("$source_dir"/*.deb)
    shopt -u nullglob

    if [[ ${#deb_files[@]} -eq 0 ]]; then
      if [[ "$source_dir" == "$target_dir/pkgs/python" ]]; then
        echo "[debug] dependency closure log tail:" >&2
        tail -n 80 "$closure_log" >&2 || true
        echo "[debug] manifests dir listing:" >&2
        ls -lah "$target_dir/manifests" >&2 || true
        echo "[debug] python dir listing:" >&2
        ls -lah "$target_dir/pkgs/python" >&2 || true
        echo "[debug] docker deps temp dir listing:" >&2
        ls -lah "$deps_tmp_dir" >&2 || true
        fail "No python .deb packages were collected for $codename (see $closure_log)"
      fi
      continue
    fi

    cp "${deb_files[@]}" "$target_dir/pkgs/all/"
  done

  find "$target_dir/pkgs/python" -maxdepth 1 -type f -name "*.deb" -exec basename {} \; | sort -u > "$target_dir/manifests/python-packages.txt"
  find "$target_dir/pkgs/all" -maxdepth 1 -type f -name "*.deb" -exec basename {} \; | sort -u > "$target_dir/manifests/all-packages.txt"
}

run_offline_install_smoke() {
  local ubuntu_tag="$1"
  local target_dir="$2"

  docker run --rm --platform "linux/${TARGET_ARCH}" \
    -v "$target_dir/pkgs/all:/pkgs:ro" \
    "ubuntu:${ubuntu_tag}" bash -s > "$target_dir/manifests/offline-install-smoke.txt" <<'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
chmod +x /usr/sbin/policy-rc.d

cp /pkgs/*.deb /var/cache/apt/archives/
dpkg -i /pkgs/*.deb || true
apt-get install -y --no-download -f
echo "offline-install-smoke=ok"
EOF
}

generate_checksums_and_manifests() {
  local target_id="$1"
  local codename="$2"
  local target_dir="$OUTPUT_ROOT/$target_id"
  local bundle_size_mb

  bundle_size_mb="$(du -m "$target_dir/hush-offline-bundle.tar" | cut -f1)"

  cat > "$target_dir/bundle-manifest.txt" <<EOF
bundle_created_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
target_distro=${codename}
target_arch=${TARGET_ARCH}
bundle_size_mb=${bundle_size_mb}
image_count=$(wc -l < "$target_dir/manifests/images.txt" | tr -d ' ')
docker_package_count=$(wc -l < "$target_dir/manifests/docker-packages.txt" | tr -d ' ')
python_package_count=$(wc -l < "$target_dir/manifests/python-packages.txt" | tr -d ' ')
all_package_count=$(wc -l < "$target_dir/manifests/all-packages.txt" | tr -d ' ')
env_policy=OPTIONAL_TRANSFER_OR_LOCAL_GENERATION
env_generation=PROMPTED_DURING_DEPLOY_AIRGAPPED
EOF

  cat > "$target_dir/TRANSFER-CHECKLIST.txt" <<EOF
HUSH offline transfer checklist for ${target_id}

1) Copy the full project directory to the air-gapped machine.
2) Ensure this bundle exists at: offline/bundles/${target_id}
3) Optional: copy .env if you want to reuse existing secrets.
4) On the air-gapped machine run:
   bash ./offline/deploy-airgapped.sh

The deploy script will prompt you to either:
  - use existing .env
  - or create a new .env locally

Example SCP (copy full repository):
  scp -r /path/to/hush user@AIRGAP_HOST:/opt/

Example SCP (optional existing .env only):
  scp /path/to/hush/.env user@AIRGAP_HOST:/opt/hush/
EOF

  (
    cd "$target_dir"
    {
      sha256sum "hush-offline-bundle.tar"
      while IFS= read -r file; do sha256sum "$file"; done < <(find "pkgs" -type f -name "*.deb" -print | sort)
      sha256sum "docker-compose.yml"
      if [[ -f "docker-compose.override.yml" ]]; then
        sha256sum "docker-compose.override.yml"
      fi
      sha256sum "install-system-deps.sh"
      sha256sum "deploy-offline.sh"
      sha256sum "init-airgap-env.sh"
      sha256sum "deploy-airgapped.sh"
      sha256sum "generate_secrets.py"
      sha256sum "bundle-manifest.txt"
      sha256sum "TRANSFER-CHECKLIST.txt"
      while IFS= read -r file; do sha256sum "$file"; done < <(find "manifests" -type f -name "*.txt" -print | sort)
      while IFS= read -r file; do sha256sum "$file"; done < <(find "nginx" -type f -print | sort)
    } > "SHA256SUMS"
  )
}

build_target() {
  local codename="$1"
  local target_id="${codename}-${TARGET_ARCH}"
  local ubuntu_tag
  local target_dir

  ubuntu_tag="$(ubuntu_tag_for "$codename")"
  target_dir="$OUTPUT_ROOT/$target_id"

  echo ""
  echo "[Target: $target_id] Preparing layout..."
  prepare_target_layout "$target_id"

  echo "[Target: $target_id] Downloading Docker packages..."
  download_docker_packages "$codename" "$target_dir"

  echo "[Target: $target_id] Resolving dependency closure..."
  collect_dependency_closure "$codename" "$ubuntu_tag" "$target_dir"

  echo "[Target: $target_id] Running offline install smoke test..."
  run_offline_install_smoke "$ubuntu_tag" "$target_dir"

  echo "[Target: $target_id] Generating manifests/checksums..."
  generate_checksums_and_manifests "$target_id" "$codename"

  echo "[Target: $target_id] Complete"
}

print_summary() {
  local targets="$1"
  echo ""
  echo "============================================"
  echo "  Offline bundles are ready"
  echo "============================================"
  for codename in $targets; do
    echo "  - offline/bundles/${codename}-${TARGET_ARCH}"
  done
  echo ""
  echo "Important: .env is NOT bundled. You may transfer an existing .env if desired,"
  echo "or create a new one on the air-gapped host during deployment."
  echo ""
  echo "SCP transfer examples:"
  echo "  scp -r /path/to/hush user@AIRGAP_HOST:/opt/"
  echo "  scp /path/to/hush/.env user@AIRGAP_HOST:/opt/hush/   # optional"
  echo ""
  echo "On the air-gapped machine:" 
  echo "  bash ./offline/deploy-airgapped.sh"
  echo ""
}

main() {
  parse_args "$@"
  validate_target
  print_header
  validate_prerequisites

  local targets
  targets="$(resolve_targets)"

  cd "$PROJECT_ROOT"
  prepare_dirs

  echo "[1/2] Building Docker images and image bundle..."
  build_image_bundle
  echo "[OK] Common image bundle created"

  echo ""
  echo "[2/2] Building target-specific package bundles..."
  for codename in $targets; do
    build_target "$codename"
  done

  print_summary "$targets"
}

main "$@"
