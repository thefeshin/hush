#!/bin/bash
# HUSH Offline Bundle Builder
# Run this on a machine WITH internet access to create the offline bundle
# This script will:
#   1. Build all Docker images
#   2. Generate cryptographically secure secrets (.env)
#   3. Create the image tarball
#   4. Display your 12-word passphrase (SAVE IT!)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "============================================"
echo "  HUSH Offline Bundle Builder"
echo "============================================"
echo ""

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed or not in PATH"
    exit 1
fi

# Check Python is available
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo "[ERROR] Python is not installed (needed for secure secret generation)"
    exit 1
fi

PYTHON_CMD="python3"
if ! command -v python3 &> /dev/null; then
    PYTHON_CMD="python"
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    echo "[ERROR] Docker daemon is not running"
    exit 1
fi

cd "$PROJECT_ROOT"

# Step 1: Generate SSL certificates if missing
echo "[1/5] Generating SSL certificates..."

SSL_DIR="$PROJECT_ROOT/nginx/ssl"
CERT_PATH="$SSL_DIR/cert.pem"
KEY_PATH="$SSL_DIR/key.pem"

mkdir -p "$SSL_DIR"

if [[ ! -f "$CERT_PATH" ]] || [[ ! -f "$KEY_PATH" ]]; then
    if command -v openssl &> /dev/null; then
        # OpenSSL uses local entropy - works offline
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
            -keyout "$KEY_PATH" \
            -out "$CERT_PATH" \
            -subj "/CN=localhost/O=HUSH/C=US" 2>/dev/null
        echo "[OK] SSL certificates generated (valid 10 years)"
    else
        echo "[WARN] openssl not found - you'll need to add certificates manually"
    fi
else
    echo "[OK] SSL certificates already exist"
fi

# Step 2: Generate secrets using the secure CLI tool
echo ""
echo "[2/5] Generating cryptographically secure secrets..."

# Use the existing CLI secret generator (uses Python's secrets module with BIP39 wordlist)
WORDS=$($PYTHON_CMD -c "
import sys
sys.path.insert(0, 'cli')
from secret_generator import SecretGenerator
from config import ConfigManager

generator = SecretGenerator()
secrets = generator.generate_all()

# Create config for docker deployment
config = {
    'deployment_mode': 'docker',
    'max_auth_failures': 5,
    'failure_mode': 'ip_temp',
    'ip_block_minutes': 5,
    'panic_mode': False,
    'persist_vault': True
}

# Write .env file
manager = ConfigManager()
manager.write_env(config, secrets)

# Output words for display (one per line)
for word in secrets['words']:
    print(word)
")

if [[ $? -ne 0 ]]; then
    echo "[ERROR] Failed to generate secrets"
    echo "$WORDS"
    exit 1
fi

# Convert to array
readarray -t WORD_ARRAY <<< "$WORDS"
echo "[OK] Secrets generated (using CSPRNG + BIP39 wordlist)"

# Step 3: Build application images
echo ""
echo "[3/5] Building Docker images..."
docker-compose build --no-cache
echo "[OK] Application images built"

# Step 4: Pull base images
echo ""
echo "[4/5] Pulling base images..."
docker pull postgres:16-alpine
docker pull nginx:alpine
echo "[OK] Base images pulled"

# Step 5: Save all images to tarball
echo ""
echo "[5/5] Creating offline bundle tarball..."

# Get the project name (directory name)
PROJECT_NAME=$(basename "$PROJECT_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
BACKEND_IMAGE="${PROJECT_NAME}-backend"
FRONTEND_IMAGE="${PROJECT_NAME}-frontend"

BUNDLE_PATH="$SCRIPT_DIR/hush-offline-bundle.tar"

# Remove old bundle if exists
rm -f "$BUNDLE_PATH"

echo "  Saving images (this may take a few minutes)..."
docker save "$BACKEND_IMAGE" "$FRONTEND_IMAGE" postgres:16-alpine nginx:alpine -o "$BUNDLE_PATH"

SIZE_MB=$(du -m "$BUNDLE_PATH" | cut -f1)
echo "[OK] Bundle created: ${SIZE_MB} MB"

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

# Display words in 3 columns
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

# Summary
echo "============================================"
echo "  Bundle Complete!"
echo "============================================"
echo ""
echo "Copy these to your air-gapped machine:"
echo ""
echo "  offline/hush-offline-bundle.tar  (${SIZE_MB} MB)"
echo "  .env                             (secrets)"
echo "  docker-compose.yml"
echo "  nginx/                           (config + SSL certs)"
echo "  offline/deploy-offline.sh        (deployment script)"
echo ""
echo "On the air-gapped machine, run:"
echo "  ./offline/deploy-offline.sh"
echo ""
