# HUSH Offline Deployment Script
# Run this on an AIR-GAPPED machine (no internet required)
# Prerequisites: .env file must already exist (generated during build phase)
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

Set-Location $ProjectRoot

# Step 1: Verify all required files exist
Write-Host "[1/3] Verifying required files..." -ForegroundColor Yellow

$requiredFiles = @{
    ".env" = "secrets (generated during build)"
    "docker-compose.yml" = "service definitions"
    "nginx/nginx.conf" = "nginx configuration"
    "nginx/ssl/cert.pem" = "SSL certificate"
    "nginx/ssl/key.pem" = "SSL private key"
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
    Write-Host ""
    Write-Host "These files must be copied from the build machine:" -ForegroundColor Yellow
    foreach ($file in $missing) {
        Write-Host "  - $file" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "Run build-bundle.ps1 on a machine with internet first." -ForegroundColor Yellow
    exit 1
}

# Step 2: Load Docker images from bundle
Write-Host ""
Write-Host "[2/3] Loading Docker images from bundle..." -ForegroundColor Yellow

$BundlePath = Join-Path $ScriptDir "hush-offline-bundle.tar"

if (-not (Test-Path $BundlePath)) {
    Write-Host "[ERROR] Bundle not found: $BundlePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Copy hush-offline-bundle.tar to the offline/ directory" -ForegroundColor Yellow
    exit 1
}

$SizeMB = [math]::Round((Get-Item $BundlePath).Length / 1MB, 1)
Write-Host "  Loading $SizeMB MB bundle (this may take a few minutes)..." -ForegroundColor Gray

docker load -i $BundlePath

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to load images from bundle" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Images loaded successfully" -ForegroundColor Green

# Step 3: Start services
Write-Host ""
Write-Host "[3/3] Starting HUSH services..." -ForegroundColor Yellow

# Stop any existing containers
docker-compose down 2>$null

# Start services
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to start services" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check logs with: docker-compose logs" -ForegroundColor Yellow
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
    $status = docker-compose ps $svc --format "{{.Status}}" 2>$null
    if ($status -match "Up|running|healthy") {
        Write-Host "  [OK] $svc" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] $svc - $status" -ForegroundColor Yellow
        $healthy = $false
    }
}

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
Write-Host "    View logs:     docker-compose logs -f" -ForegroundColor White
Write-Host "    Stop:          docker-compose down" -ForegroundColor White
Write-Host "    Restart:       docker-compose restart" -ForegroundColor White
Write-Host "    Check status:  docker-compose ps" -ForegroundColor White
Write-Host ""
