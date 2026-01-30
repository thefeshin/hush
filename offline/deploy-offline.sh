#!/bin/bash
# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required)
# Prerequisites:
#   - Docker installed and running
#   - Python 3 installed (for secret generation)
#   - hush-offline-bundle.tar in project root

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

# Check Python is available
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] Python is not installed (needed for secret generation)"
    exit 1
fi

cd "$PROJECT_ROOT"

# Step 1: Check for tarball in project root
echo "[1/5] Checking for Docker image bundle..."

BUNDLE_PATH="$PROJECT_ROOT/hush-offline-bundle.tar"

if [[ ! -f "$BUNDLE_PATH" ]]; then
    echo ""
    echo "[ERROR] Docker image bundle not found!"
    echo ""
    echo "  Expected location: $BUNDLE_PATH"
    echo ""
    echo "  You need to create this file on a machine WITH internet access:"
    echo ""
    echo "    1. On internet-connected machine, run:"
    echo "       docker compose build --no-cache"
    echo "       docker pull postgres:16-alpine"
    echo "       docker pull nginx:alpine"
    echo "       docker save hush-backend hush-frontend postgres:16-alpine nginx:alpine -o hush-offline-bundle.tar"
    echo ""
    echo "    2. Copy hush-offline-bundle.tar to this machine's project root"
    echo ""
    exit 1
fi

SIZE_MB=$(du -m "$BUNDLE_PATH" | cut -f1)
echo "[OK] Found bundle: ${SIZE_MB} MB"

# Step 2: Verify required files
echo ""
echo "[2/5] Verifying required files..."

check_file() {
    local file=$1
    local desc=$2
    if [[ -f "$PROJECT_ROOT/$file" ]]; then
        echo "  [OK] $file"
        return 0
    else
        echo "  [MISSING] $file - $desc"
        return 1
    fi
}

MISSING=()
check_file "docker-compose.yml" "service definitions" || MISSING+=("docker-compose.yml")
check_file "nginx/nginx.conf" "nginx configuration" || MISSING+=("nginx/nginx.conf")
check_file "offline/generate_secrets.py" "secret generator" || MISSING+=("offline/generate_secrets.py")

if [[ ${#MISSING[@]} -gt 0 ]]; then
    echo ""
    echo "[ERROR] Missing required files!"
    echo "Copy these from the source repository."
    exit 1
fi

# Step 3: Generate SSL certificates if missing
echo ""
echo "[3/5] Checking SSL certificates..."

SSL_DIR="$PROJECT_ROOT/nginx/ssl"
CERT_PATH="$SSL_DIR/cert.pem"
KEY_PATH="$SSL_DIR/key.pem"

mkdir -p "$SSL_DIR"

if [[ ! -f "$CERT_PATH" ]] || [[ ! -f "$KEY_PATH" ]]; then
    if command -v openssl &> /dev/null; then
        echo "  Generating self-signed certificate..."
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout "$KEY_PATH" \
            -out "$CERT_PATH" \
            -subj "/CN=localhost/O=HUSH/C=US" 2>/dev/null
        echo "[OK] SSL certificates generated (valid 10 years)"
    else
        echo "[ERROR] openssl not found - cannot generate SSL certificates"
        echo "  Install openssl or copy cert.pem and key.pem to nginx/ssl/"
        exit 1
    fi
else
    echo "[OK] SSL certificates already exist"
fi

# Step 4: Generate secrets and .env file
echo ""
echo "[4/5] Generating cryptographic secrets..."

if [[ -f "$PROJECT_ROOT/.env" ]]; then
    echo "  [WARN] .env already exists - backing up to .env.backup"
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"
fi

# Run the embedded secret generator (no pip dependencies)
WORDS=$($PYTHON_CMD "$SCRIPT_DIR/generate_secrets.py")

if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to generate secrets"
    echo "$WORDS"
    exit 1
fi

# Convert to array
readarray -t WORD_ARRAY <<< "$WORDS"
echo "[OK] Secrets generated (using CSPRNG + BIP39 wordlist)"

# Step 5: Load Docker images and start services
echo ""
echo "[5/5] Loading Docker images and starting services..."

echo "  Loading images from bundle (this may take a few minutes)..."
docker load -i "$BUNDLE_PATH"
echo "[OK] Images loaded"

# Stop any existing containers
docker compose down 2>/dev/null || true

# Start services
echo "  Starting services..."
docker compose up -d

# Wait for services to initialize
echo "  Waiting for services to initialize..."
sleep 8

# Check health
echo "  Checking service health..."

HEALTHY=true

for svc in postgres backend nginx; do
    STATUS=$(docker compose ps "$svc" --format "{{.Status}}" 2>/dev/null || echo "unknown")
    if [[ "$STATUS" =~ Up|running|healthy ]]; then
        echo "  [OK] $svc"
    else
        echo "  [WARN] $svc - $STATUS"
        HEALTHY=false
    fi
done

# Display the passphrase
echo ""
echo ""
echo "================================================================"
echo "================================================================"
echo ""
echo "         YOUR 12-WORD VAULT PASSPHRASE"
echo ""
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
echo ""
echo "  WRITE THESE DOWN NOW. THEY WILL NOT BE SHOWN AGAIN."
echo "  Without these words, your vault data is UNRECOVERABLE."
echo ""
echo "================================================================"
echo "================================================================"
echo ""
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
echo "    View logs:     docker compose logs -f"
echo "    Stop:          docker compose down"
echo "    Restart:       docker compose restart"
echo "    Check status:  docker compose ps"
echo ""
