# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required)
# Prerequisites:
#   - Docker installed and running
#   - Python 3 installed (for secret generation)
#   - hush-offline-bundle.tar in project root

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HUSH Offline Deployment" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker is available
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check Docker is running
$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker daemon is not running" -ForegroundColor Red
    exit 1
}

# Check Python is available
if (-not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed (needed for secret generation)" -ForegroundColor Red
    exit 1
}

Set-Location $ProjectRoot

# Step 1: Check for tarball in project root
Write-Host "[1/5] Checking for Docker image bundle..." -ForegroundColor Yellow

$BundlePath = Join-Path $ProjectRoot "hush-offline-bundle.tar"

if (-not (Test-Path $BundlePath)) {
    Write-Host ""
    Write-Host "[ERROR] Docker image bundle not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Expected location: $BundlePath" -ForegroundColor White
    Write-Host ""
    Write-Host "  You need to create this file on a machine WITH internet access:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    1. On internet-connected machine, run:" -ForegroundColor Gray
    Write-Host "       docker compose build --no-cache" -ForegroundColor White
    Write-Host "       docker pull postgres:16-alpine" -ForegroundColor White
    Write-Host "       docker pull nginx:alpine" -ForegroundColor White
    Write-Host "       docker save hush-backend hush-frontend postgres:16-alpine nginx:alpine -o hush-offline-bundle.tar" -ForegroundColor White
    Write-Host ""
    Write-Host "    2. Copy hush-offline-bundle.tar to this machine's project root" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

$SizeMB = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
Write-Host "[OK] Found bundle: $SizeMB MB" -ForegroundColor Green

# Step 2: Verify required files
Write-Host ""
Write-Host "[2/5] Verifying required files..." -ForegroundColor Yellow

$requiredFiles = @{
    "docker-compose.yml" = "service definitions"
    "nginx/nginx.conf" = "nginx configuration"
    "offline/generate_secrets.py" = "secret generator"
}

$missing = @()
foreach ($file in $requiredFiles.Keys) {
    $fullPath = Join-Path $ProjectRoot $file
    if (Test-Path $fullPath) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $file - $($requiredFiles[$file])" -ForegroundColor Red
        $missing += $file
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] Missing required files!" -ForegroundColor Red
    Write-Host "Copy these from the source repository." -ForegroundColor Yellow
    exit 1
}

# Step 3: Generate SSL certificates if missing
Write-Host ""
Write-Host "[3/5] Checking SSL certificates..." -ForegroundColor Yellow

$sslDir = Join-Path $ProjectRoot "nginx/ssl"
$certPath = Join-Path $sslDir "cert.pem"
$keyPath = Join-Path $sslDir "key.pem"

if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force | Out-Null
}

if (-not (Test-Path $certPath) -or -not (Test-Path $keyPath)) {
    if (Get-Command "openssl" -ErrorAction SilentlyContinue) {
        Write-Host "  Generating self-signed certificate..." -ForegroundColor Gray
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 `
            -keyout $keyPath `
            -out $certPath `
            -subj "/CN=localhost/O=HUSH/C=US" 2>$null
        Write-Host "[OK] SSL certificates generated (valid 10 years)" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] openssl not found - cannot generate SSL certificates" -ForegroundColor Red
        Write-Host "  Install openssl or copy cert.pem and key.pem to nginx/ssl/" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[OK] SSL certificates already exist" -ForegroundColor Green
}

# Step 4: Generate secrets and .env file
Write-Host ""
Write-Host "[4/5] Generating cryptographic secrets..." -ForegroundColor Yellow

$envPath = Join-Path $ProjectRoot ".env"
if (Test-Path $envPath) {
    Write-Host "  [WARN] .env already exists - backing up to .env.backup" -ForegroundColor Yellow
    Copy-Item $envPath "$envPath.backup" -Force
}

# Run the embedded secret generator (no pip dependencies)
$secretOutput = python (Join-Path $ScriptDir "generate_secrets.py") 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to generate secrets" -ForegroundColor Red
    Write-Host $secretOutput -ForegroundColor Red
    exit 1
}

# Parse the 12 words from output
$words = $secretOutput -split "`n" | Where-Object { $_.Trim() -ne "" } | Select-Object -Last 12
Write-Host "[OK] Secrets generated (using CSPRNG + BIP39 wordlist)" -ForegroundColor Green

# Step 5: Load Docker images and start services
Write-Host ""
Write-Host "[5/5] Loading Docker images and starting services..." -ForegroundColor Yellow

Write-Host "  Loading images from bundle (this may take a few minutes)..." -ForegroundColor Gray
docker load -i $BundlePath

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to load images from bundle" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Images loaded" -ForegroundColor Green

# Stop any existing containers
docker compose down 2>$null

# Start services
Write-Host "  Starting services..." -ForegroundColor Gray
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start services" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check logs with: docker compose logs" -ForegroundColor Yellow
    exit 1
}

# Wait for services to initialize
Write-Host "  Waiting for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Check health
Write-Host "  Checking service health..." -ForegroundColor Gray

$healthy = $true
$services = @("postgres", "backend", "nginx")

foreach ($svc in $services) {
    $status = docker compose ps $svc --format "{{.Status}}" 2>$null
    if ($status -match "Up|running|healthy") {
        Write-Host "  [OK] $svc" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] $svc - $status" -ForegroundColor Yellow
        $healthy = $false
    }
}

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

if ($healthy) {
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "  HUSH Deployed Successfully!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
} else {
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  HUSH Started (some services may need time)" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Access your vault at: https://localhost" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Commands:" -ForegroundColor Gray
Write-Host "    View logs:     docker compose logs -f" -ForegroundColor White
Write-Host "    Stop:          docker compose down" -ForegroundColor White
Write-Host "    Restart:       docker compose restart" -ForegroundColor White
Write-Host "    Check status:  docker compose ps" -ForegroundColor White
Write-Host ""
