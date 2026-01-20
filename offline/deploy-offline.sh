#!/bin/bash
# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required)
# Prerequisites: .env file must already exist (generated during build phase)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "============================================"
echo "  HUSH Offline Deployment"
echo "============================================"
echo ""

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed or not in PATH"
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    echo "[ERROR] Docker daemon is not running"
    exit 1
fi

cd "$PROJECT_ROOT"

# Step 1: Verify all required files exist
echo "[1/3] Verifying required files..."

MISSING=()

check_file() {
    local file=$1
    local desc=$2
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        echo "  [OK] $file"
    else
        echo "  [MISSING] $file - $desc"
        MISSING+=("$file")
    fi
}

check_file ".env" "secrets (generated during build)"
check_file "docker-compose.yml" "service definitions"
check_file "nginx/nginx.conf" "nginx configuration"
check_file "nginx/ssl/cert.pem" "SSL certificate"
check_file "nginx/ssl/key.pem" "SSL private key"

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    echo "[ERROR] Missing required files!"
    echo ""
    echo "These files must be copied from the build machine:"
    for file in "${MISSING[@]}"; do
        echo "  - $file"
    done
    echo ""
    echo "Run build-bundle.sh on a machine with internet first."
    exit 1
fi

# Step 2: Load Docker images from bundle
echo ""
echo "[2/3] Loading Docker images from bundle..."

BUNDLE_PATH="$SCRIPT_DIR/hush-offline-bundle.tar"

if [[ ! -f "$BUNDLE_PATH" ]]; then
    echo "[ERROR] Bundle not found: $BUNDLE_PATH"
    echo ""
    echo "Copy hush-offline-bundle.tar to the offline/ directory"
    exit 1
fi

SIZE_MB=$(du -m "$BUNDLE_PATH" | cut -f1)
echo "  Loading ${SIZE_MB} MB bundle (this may take a few minutes)..."

docker load -i "$BUNDLE_PATH"

echo "[OK] Images loaded successfully"

# Step 3: Start services
echo ""
echo "[3/3] Starting HUSH services..."

# Stop any existing containers
docker-compose down 2>/dev/null || true

# Start services
docker-compose up -d

# Wait for services to initialize
echo "  Waiting for services to initialize..."
sleep 8

# Check health
echo "  Checking service health..."

HEALTHY=true

for svc in postgres backend nginx; do
    STATUS=$(docker-compose ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "unknown")
    if [[ "$STATUS" =~ Up|running|healthy ]]; then
        echo "  [OK] $svc"
    else
        echo "  [WARN] $svc - $STATUS"
        HEALTHY=false
    fi
done

echo ""
if $HEALTHY; then
    echo "============================================"
    echo "  HUSH Deployed Successfully!"
    echo "============================================"
else
    echo "============================================"
    echo "  HUSH Started (some services may need time)"
    echo "============================================"
fi

echo ""
echo "  Access your vault at: https://localhost"
echo ""
echo "  Commands:"
echo "    View logs:     docker-compose logs -f"
echo "    Stop:          docker-compose down"
echo "    Restart:       docker-compose restart"
echo "    Check status:  docker-compose ps"
echo ""
