# HUSH - Zero-Knowledge Encrypted Chat Vault
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Print-Banner {
    Write-Host ""
    Write-Host "+==========================================================+" -ForegroundColor Cyan
    Write-Host "|     H   H  U   U  SSSS  H   H                            |" -ForegroundColor Cyan
    Write-Host "|     H   H  U   U  S     H   H                            |" -ForegroundColor Cyan
    Write-Host "|     HHHHH  U   U  SSSS  HHHHH                            |" -ForegroundColor Cyan
    Write-Host "|     H   H  U   U     S  H   H                            |" -ForegroundColor Cyan
    Write-Host "|     H   H   UUU   SSSS  H   H                            |" -ForegroundColor Cyan
    Write-Host "|     Zero-Knowledge Encrypted Chat Vault                  |" -ForegroundColor Cyan
    Write-Host "+==========================================================+" -ForegroundColor Cyan
    Write-Host ""
}

function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

function Docker-Deploy {
    Write-Host ""
    Write-Host "[HUSH] Docker deployment selected" -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-Command "docker")) {
        Write-Host "[HUSH] ERROR: Docker is not installed" -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Command "docker-compose")) {
        # Check for docker compose (v2)
        $composeV2 = docker compose version 2>$null
        if (-not $composeV2) {
            Write-Host "[HUSH] ERROR: docker-compose is not installed" -ForegroundColor Red
            exit 1
        }
    }

    # UseExistingEnv: 0 = reconfigure, 1 = use existing
    if ($script:UseExistingEnv -eq 1) {
        Write-Host "[HUSH] Redeploying with existing configuration..."
        docker-compose down
        docker-compose build
        docker-compose up -d
        Write-Host ""
        Write-Host "[HUSH] Redeployment complete!" -ForegroundColor Green
        Write-Host "[HUSH] Access your vault at: https://localhost" -ForegroundColor Green
    } else {
        # Run Python CLI for fresh deployment (generate secrets)
        $env:PYTHONPATH = "$ScriptDir\cli;$env:PYTHONPATH"
        python -c @"
import sys
sys.path.insert(0, 'cli')
from main import main
sys.argv = ['hush', 'deploy', '--skip-env-check']
main()
"@
    }
}

function Local-Deploy {
    Write-Host ""
    Write-Host "[HUSH] Local development selected" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[HUSH] Checking prerequisites..."

    $missing = @()

    if (Test-Command "python") {
        Write-Host "[HUSH] + python" -ForegroundColor Green
    } else {
        Write-Host "[HUSH] x python not found" -ForegroundColor Red
        $missing += "Python"
    }

    if (Test-Command "node") {
        Write-Host "[HUSH] + node" -ForegroundColor Green
    } else {
        Write-Host "[HUSH] x node not found" -ForegroundColor Red
        $missing += "Node.js"
    }

    if (Test-Command "npm") {
        Write-Host "[HUSH] + npm" -ForegroundColor Green
    } else {
        Write-Host "[HUSH] x npm not found" -ForegroundColor Red
        $missing += "npm"
    }

    if (Test-Command "psql") {
        Write-Host "[HUSH] + psql" -ForegroundColor Green
    } else {
        Write-Host "[HUSH] x psql not found" -ForegroundColor Red
        $missing += "PostgreSQL"
    }

    if ($missing.Count -gt 0) {
        Write-Host ""
        Write-Host "[HUSH] Please install missing prerequisites and try again." -ForegroundColor Red
        exit 1
    }

    Write-Host ""

    # Setup PostgreSQL database
    Write-Host "[HUSH] Setting up PostgreSQL database..." -ForegroundColor Cyan

    # Check if database already exists by trying to connect (suppress password prompt with dummy password)
    $env:PGPASSWORD = "hush"
    $testResult = psql -U hush -d hush -c "SELECT 1;" 2>&1
    $dbExists = ($LASTEXITCODE -eq 0)
    $env:PGPASSWORD = ""

    if ($dbExists) {
        Write-Host "[HUSH] Database 'hush' already exists" -ForegroundColor Green
    } else {
        Write-Host "[HUSH] Database 'hush' not found. Creating..." -ForegroundColor Yellow
        Write-Host ""

        # Ask for postgres password with retry loop
        $postgresConnected = $false
        $retryCount = 0
        $maxRetries = 3

        while (-not $postgresConnected -and $retryCount -lt $maxRetries) {
            if ($retryCount -gt 0) {
                Write-Host ""
                Write-Host "[HUSH] Connection failed. Incorrect password or connection issue." -ForegroundColor Red
                Write-Host ""
            }

            Write-Host "[HUSH] Enter PostgreSQL 'postgres' user password:" -ForegroundColor Cyan
            Write-Host "[HUSH] (Press Enter if postgres user has no password)" -ForegroundColor Cyan
            $securePwd = Read-Host -AsSecureString
            $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd))

            Write-Host ""
            Write-Host "[HUSH] Testing postgres connection..."

            # Test connection
            $testConn = psql -U postgres -c "SELECT 1;" 2>&1
            if ($LASTEXITCODE -eq 0) {
                $postgresConnected = $true
                Write-Host "[HUSH] Connection successful" -ForegroundColor Green
            } else {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-Host "[HUSH] Attempts remaining: $($maxRetries - $retryCount)" -ForegroundColor Yellow
                }
            }
        }

        if (-not $postgresConnected) {
            Write-Host ""
            Write-Host "[HUSH] ERROR: Cannot connect to PostgreSQL as 'postgres' user after $maxRetries attempts!" -ForegroundColor Red
            Write-Host ""
            Write-Host "[HUSH] Common fixes:" -ForegroundColor Yellow
            Write-Host "  1. Verify postgres password is correct"
            Write-Host "  2. Ensure PostgreSQL is running: Get-Service postgresql*"
            Write-Host "  3. Check pg_hba.conf allows password auth for postgres user"
            Write-Host "  4. Try connecting manually: psql -U postgres"
            Write-Host ""
            Write-Host "[HUSH] Or create database manually:" -ForegroundColor Yellow
            Write-Host "  psql -U postgres"
            Write-Host "  CREATE USER hush WITH PASSWORD 'hush';"
            Write-Host "  CREATE DATABASE hush OWNER hush;"
            $env:PGPASSWORD = ""
            exit 1
        }

        # Create user
        Write-Host "[HUSH] Creating user 'hush'..."
        $userResult = psql -U postgres -c "CREATE USER hush WITH PASSWORD 'hush';" 2>&1
        if ($LASTEXITCODE -ne 0 -and $userResult -notmatch "already exists") {
            Write-Host "[HUSH] ERROR: Failed to create database user!" -ForegroundColor Red
            Write-Host $userResult -ForegroundColor Red
            $env:PGPASSWORD = ""
            exit 1
        }

        if ($userResult -match "already exists") {
            Write-Host "[HUSH] User 'hush' already exists" -ForegroundColor Yellow
        } else {
            Write-Host "[HUSH] User 'hush' created" -ForegroundColor Green
        }

        # Create database
        Write-Host "[HUSH] Creating database 'hush'..."
        $dbResult = psql -U postgres -c "CREATE DATABASE hush OWNER hush;" 2>&1
        if ($LASTEXITCODE -ne 0 -and $dbResult -notmatch "already exists") {
            Write-Host "[HUSH] ERROR: Failed to create database!" -ForegroundColor Red
            Write-Host $dbResult -ForegroundColor Red
            $env:PGPASSWORD = ""
            exit 1
        }

        if ($dbResult -match "already exists") {
            Write-Host "[HUSH] Database 'hush' already exists" -ForegroundColor Yellow
        } else {
            Write-Host "[HUSH] Database 'hush' created" -ForegroundColor Green
        }

        $env:PGPASSWORD = ""
        Write-Host "[HUSH] Database setup complete" -ForegroundColor Green
    }

    Write-Host ""

    # Install dependencies
    Write-Host "[HUSH] Installing CLI dependencies..."
    $pipResult = python -m pip install -r cli/requirements.txt -q 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[HUSH] Warning: CLI dependencies may have issues" -ForegroundColor Yellow
        Write-Host $pipResult
    }

    Write-Host "[HUSH] Installing backend dependencies..."
    $pipResult = python -m pip install -r backend/requirements.txt 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[HUSH] ERROR: Failed to install backend dependencies!" -ForegroundColor Red
        Write-Host $pipResult
        exit 1
    }
    Write-Host "[HUSH] Backend dependencies installed" -ForegroundColor Green

    Write-Host "[HUSH] Installing frontend dependencies..."
    Push-Location frontend
    $npmResult = npm install 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[HUSH] ERROR: Failed to install frontend dependencies!" -ForegroundColor Red
        Write-Host $npmResult
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "[HUSH] Frontend dependencies installed" -ForegroundColor Green

    Write-Host ""

    # Handle configuration based on earlier user choice
    # UseExistingEnv: 0 = reconfigure, 1 = use existing
    if ($script:UseExistingEnv -eq 0) {
        Write-Host ""
        Write-Host "[HUSH] Configuring security policy..." -ForegroundColor Cyan
        Write-Host ""
        Push-Location cli
        python -c @"
from secret_generator import SecretGenerator
from config import ConfigManager
from prompts import SecurityPrompts

# Collect security configuration via interactive prompts
prompts = SecurityPrompts()
config = prompts.collect_all()

# Add deployment mode
config['deployment_mode'] = 'local'

# Generate secrets
generator = SecretGenerator()
secrets = generator.generate_all()

# Write .env
manager = ConfigManager()
manager.write_env(config, secrets)

print()
print('=' * 60)
print('         HUSH VAULT INITIALIZED')
print('=' * 60)
print()
print('LOGIN WORDS (SAVE THESE - NOT RECOVERABLE):')
print()
words = secrets['words']
for i in range(0, 12, 3):
    print(f'  {i+1:2}. {words[i]:<12}  {i+2:2}. {words[i+1]:<12}  {i+3:2}. {words[i+2]:<12}')
print()
print('=' * 60)
print('  WRITE THESE WORDS DOWN. THEY WILL NOT BE SHOWN AGAIN.')
print('=' * 60)
"@
        Pop-Location
    }

    Write-Host ""
    Write-Host "[HUSH] Starting services..."
    Write-Host ""

    # Start backend as separate process
    Write-Host "[HUSH] Starting backend on http://localhost:8000" -ForegroundColor Cyan
    $backendProcess = Start-Process -FilePath "python" `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory "$ScriptDir\backend" `
        -PassThru -NoNewWindow

    # Wait and check if backend started successfully
    Start-Sleep -Seconds 3
    if ($backendProcess.HasExited) {
        Write-Host ""
        Write-Host "[HUSH] ERROR: Backend failed to start!" -ForegroundColor Red
        Write-Host "[HUSH] Try running manually: cd backend && python -m uvicorn app.main:app" -ForegroundColor Yellow
        exit 1
    }

    # Start frontend as separate process (use cmd /c for npm on Windows)
    Write-Host "[HUSH] Starting frontend on http://localhost:3000" -ForegroundColor Cyan
    $frontendProcess = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm", "run", "dev" `
        -WorkingDirectory "$ScriptDir\frontend" `
        -PassThru -NoNewWindow

    # Wait and check if frontend started successfully
    Start-Sleep -Seconds 3
    if ($frontendProcess.HasExited) {
        Write-Host ""
        Write-Host "[HUSH] ERROR: Frontend failed to start!" -ForegroundColor Red
        Write-Host "[HUSH] Try running manually: cd frontend && npm run dev" -ForegroundColor Yellow
        # Kill backend since frontend failed
        if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue }
        exit 1
    }

    Write-Host ""
    Write-Host "+==========================================================+" -ForegroundColor Green
    Write-Host "|  HUSH is running!                                        |" -ForegroundColor Green
    Write-Host "|                                                          |" -ForegroundColor Green
    Write-Host "|  Frontend: http://localhost:3000                         |" -ForegroundColor Green
    Write-Host "|  Backend:  http://localhost:8000                         |" -ForegroundColor Green
    Write-Host "|                                                          |" -ForegroundColor Green
    Write-Host "|  Press Ctrl+C to stop all services                       |" -ForegroundColor Green
    Write-Host "+==========================================================+" -ForegroundColor Green
    Write-Host ""

    try {
        # Wait for either process to exit
        while (-not $backendProcess.HasExited -and -not $frontendProcess.HasExited) {
            Start-Sleep -Seconds 1
        }

        # If we get here, one of the processes exited unexpectedly
        if ($backendProcess.HasExited) {
            Write-Host "[HUSH] Backend stopped unexpectedly" -ForegroundColor Red
        }
        if ($frontendProcess.HasExited) {
            Write-Host "[HUSH] Frontend stopped unexpectedly" -ForegroundColor Red
        }
    } finally {
        Write-Host ""
        Write-Host "[HUSH] Shutting down..." -ForegroundColor Yellow
        if (-not $backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue }
        if (-not $frontendProcess.HasExited) { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue }
    }
}

function Check-ExistingEnv {
    # Returns: 0 = proceed with fresh/reconfigure, 1 = use existing, 2 = abort
    if (-not (Test-Path ".env")) {
        return 0
    }

    Write-Host ""
    Write-Host "[HUSH] Existing configuration found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[HUSH] What would you like to do?"
    Write-Host "       1. Use existing settings"
    Write-Host "       2. Reconfigure (will generate new secrets)"
    Write-Host ""
    $configChoice = Read-Host "       Select [1-2]"

    if ($configChoice -eq "1") {
        Write-Host "[HUSH] Using existing configuration" -ForegroundColor Green
        return 1
    } elseif ($configChoice -eq "2") {
        Write-Host "[HUSH] WARNING: This will generate new secrets!" -ForegroundColor Yellow
        Write-Host "[HUSH] Your old login words will no longer work." -ForegroundColor Yellow
        $confirm = Read-Host "[HUSH] Type 'CONFIRM' to proceed"
        if ($confirm -ne "CONFIRM") {
            Write-Host "[HUSH] Reconfiguration cancelled."
            return 2
        }
        return 0
    } else {
        Write-Host "[HUSH] Invalid selection." -ForegroundColor Red
        return 2
    }
}

# Main
Print-Banner

Write-Host "[HUSH] Deployment mode:"
Write-Host "       1. Docker (recommended) - requires Docker Desktop"
Write-Host "       2. Local development - requires PostgreSQL, Python, Node.js"
Write-Host ""
$mode = Read-Host "       Select [1-2]"

# Validate mode selection first
if ($mode -ne "1" -and $mode -ne "2") {
    Write-Host "[HUSH] Invalid selection. Please run again and select 1 or 2." -ForegroundColor Red
    exit 1
}

# Check for existing .env and get user choice
$script:UseExistingEnv = Check-ExistingEnv

if ($script:UseExistingEnv -eq 2) {
    Write-Host "[HUSH] Aborting."
    exit 0
}

switch ($mode) {
    "1" { Docker-Deploy }
    "2" { Local-Deploy }
}
