# HUSH Offline Bundle Builder
# Run this on a machine WITH internet access to create the offline bundle
# This script will:
#   1. Build all Docker images
#   2. Generate cryptographically secure secrets (.env)
#   3. Create the image tarball
#   4. Display your 12-word passphrase (SAVE IT!)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HUSH Offline Bundle Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker is available
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check Python is available (needed for secret generation)
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed (needed for secure secret generation)" -ForegroundColor Red
    exit 1
}

# Check Docker is running
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker daemon is not running" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

# Step 1: Generate SSL certificates if missing
Write-Host "[1/5] Generating SSL certificates..." -ForegroundColor Yellow

$sslDir = Join-Path $ProjectRoot "nginx/ssl"
$certPath = Join-Path $sslDir "cert.pem"
$keyPath = Join-Path $sslDir "key.pem"

if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force | Out-Null
}

if (-not (Test-Path $certPath) -or -not (Test-Path $keyPath)) {
    if (Get-Command "openssl" -ErrorAction SilentlyContinue) {
        # OpenSSL uses local entropy - works offline
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 `
            -keyout $keyPath `
            -out $certPath `
            -subj "/CN=localhost/O=HUSH/C=US" 2>$null
        Write-Host "[OK] SSL certificates generated (valid 10 years)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] openssl not found - you'll need to add certificates manually" -ForegroundColor Yellow
    }
} else {
    Write-Host "[OK] SSL certificates already exist" -ForegroundColor Green
}

# Step 2: Generate secrets using the secure CLI tool
Write-Host ""
Write-Host "[2/5] Generating cryptographically secure secrets..." -ForegroundColor Yellow

# Use the existing CLI secret generator (uses Python's secrets module with BIP39 wordlist)
$secretOutput = python -c @"
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

# Output words for display (one per line for easy parsing)
for word in secrets['words']:
    print(word)
"@ 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to generate secrets" -ForegroundColor Red
    Write-Host $secretOutput -ForegroundColor Red
    exit 1
}

# Parse the 12 words from output
$words = $secretOutput -split "`n" | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 12
Write-Host "[OK] Secrets generated (using CSPRNG + BIP39 wordlist)" -ForegroundColor Green

# Step 3: Build application images
Write-Host ""
Write-Host "[3/5] Building Docker images..." -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to build images" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Application images built" -ForegroundColor Green

# Step 4: Pull base images
Write-Host ""
Write-Host "[4/5] Pulling base images..." -ForegroundColor Yellow
docker pull postgres:16-alpine
docker pull nginx:alpine
Write-Host "[OK] Base images pulled" -ForegroundColor Green

# Step 5: Save all images to tarball
Write-Host ""
Write-Host "[5/5] Creating offline bundle tarball..." -ForegroundColor Yellow

# Get the project name (directory name)
$ProjectName = (Get-Item $ProjectRoot).Name.ToLower() -replace '[^a-z0-9]', ''
$BackendImage = "${ProjectName}-backend"
$FrontendImage = "${ProjectName}-frontend"

$BundlePath = Join-Path $ScriptDir "hush-offline-bundle.tar"

# Remove old bundle if exists
if (Test-Path $BundlePath) { Remove-Item $BundlePath -Force }

Write-Host "  Saving images (this may take a few minutes)..." -ForegroundColor Gray
docker save $BackendImage $FrontendImage postgres:16-alpine nginx:alpine -o $BundlePath

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to save images" -ForegroundColor Red
    exit 1
}

$SizeMB = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
Write-Host "[OK] Bundle created: $SizeMB MB" -ForegroundColor Green

# Display the passphrase
Write-Host ""
Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "         YOUR 12-WORD VAULT PASSPHRASE" -ForegroundColor White
Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""

# Display words in 3 columns
for ($i = 0; $i -lt 12; $i += 3) {
    $line = "   {0,2}. {1,-12}  {2,2}. {3,-12}  {4,2}. {5,-12}" -f `
        ($i+1), $words[$i], ($i+2), $words[$i+1], ($i+3), $words[$i+2]
    Write-Host $line -ForegroundColor Cyan
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  WRITE THESE DOWN NOW. THEY WILL NOT BE SHOWN AGAIN." -ForegroundColor Red
Write-Host "  Without these words, your vault data is UNRECOVERABLE." -ForegroundColor Red
Write-Host ""
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host "================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host ""

# Summary
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Bundle Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Copy these to your air-gapped machine:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  offline/hush-offline-bundle.tar  ($SizeMB MB)" -ForegroundColor White
Write-Host "  .env                             (secrets)" -ForegroundColor White
Write-Host "  docker-compose.yml" -ForegroundColor White
Write-Host "  nginx/                           (config + SSL certs)" -ForegroundColor White
Write-Host "  offline/deploy-offline.ps1       (deployment script)" -ForegroundColor White
Write-Host ""
Write-Host "On the air-gapped machine, run:" -ForegroundColor Cyan
Write-Host "  .\offline\deploy-offline.ps1" -ForegroundColor White
Write-Host ""
