# Implementation Plan: Docker-Optional Deployment

**Date:** 2026-01-18
**Based on:** `.claude/research/active/docker-optional-deployment_research.md`
**Status:** AWAITING_APPROVAL
**Estimated Changes:** 2 new files, 1 deleted file, 1 modified file

---

## Summary

Replace the existing `./hush` Python entry point with two platform-native scripts (`hush.sh` for Linux/macOS, `hush.ps1` for Windows). Each script prompts the user to choose between Docker or Local deployment mode.

---

## Scope Definition

### In Scope
- [x] Delete existing `hush` Python entry point
- [x] Create `hush.sh` - Bash script with Docker/Local prompt
- [x] Create `hush.ps1` - PowerShell script with Docker/Local prompt
- [x] Docker mode: Run existing docker-compose flow via Python CLI
- [x] Local mode: Check prerequisites, setup DB, install deps, start services
- [x] Modify `cli/config.py` to support localhost DATABASE_URL

### Out of Scope
- Modifying existing `cli/` Python modules beyond config.py
- SSL certificates for local dev (use HTTP via Vite proxy)
- Interactive security prompts for local mode (use sensible defaults)

---

## Files to Create/Modify/Delete

| # | File | Action | Risk |
|---|------|--------|------|
| 1 | `hush` | DELETE | LOW |
| 2 | `cli/config.py` | MODIFY (lines 33-56) | LOW |
| 3 | `hush.sh` | CREATE | LOW |
| 4 | `hush.ps1` | CREATE | LOW |

---

## Step-by-Step Implementation

### Step 1: Delete existing hush file

**Action:** DELETE
**File:** `hush`
**Command:**
```bash
rm hush
```

**Rationale:** Replace Python entry point with platform-native scripts.

---

### Step 2: Modify cli/config.py for dynamic DATABASE_URL

**Action:** MODIFY
**File:** `cli/config.py`
**Lines:** 33-56

**Current Code:**
```python
    def write_env(self, config, secrets):
        """Write .env file with all configuration"""
        content = f"""# HUSH Vault Configuration
# Generated at deployment - DO NOT EDIT MANUALLY

# Authentication (server-side only)
AUTH_HASH={secrets['auth_hash']}
KDF_SALT={secrets['kdf_salt']}
JWT_SECRET={secrets['jwt_secret']}

# Security Policy
MAX_AUTH_FAILURES={config['max_auth_failures']}
FAILURE_MODE={config['failure_mode']}
IP_BLOCK_MINUTES={config['ip_block_minutes']}
PANIC_MODE={str(config['panic_mode']).lower()}
PERSIST_VAULT={str(config['persist_vault']).lower()}

# Database
DATABASE_URL=postgresql://hush:hush@postgres:5432/hush

# Application
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
"""
```

**New Code:**
```python
    def write_env(self, config, secrets):
        """Write .env file with all configuration"""
        # Determine DATABASE_URL based on deployment mode
        if config.get('deployment_mode') == 'local':
            database_url = "postgresql://hush:hush@localhost:5432/hush"
        else:
            database_url = "postgresql://hush:hush@postgres:5432/hush"

        content = f"""# HUSH Vault Configuration
# Generated at deployment - DO NOT EDIT MANUALLY

# Authentication (server-side only)
AUTH_HASH={secrets['auth_hash']}
KDF_SALT={secrets['kdf_salt']}
JWT_SECRET={secrets['jwt_secret']}

# Security Policy
MAX_AUTH_FAILURES={config['max_auth_failures']}
FAILURE_MODE={config['failure_mode']}
IP_BLOCK_MINUTES={config['ip_block_minutes']}
PANIC_MODE={str(config['panic_mode']).lower()}
PERSIST_VAULT={str(config['persist_vault']).lower()}

# Database
DATABASE_URL={database_url}

# Application
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
"""
```

**Rationale:** Local mode needs `localhost` instead of Docker's internal `postgres` hostname.

---

### Step 3: Create hush.sh (Bash Script)

**Action:** CREATE
**File:** `hush.sh`

**Full Content:**
```bash
#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_banner() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║     ██╗  ██╗██╗   ██╗███████╗██╗  ██╗                    ║${NC}"
    echo -e "${CYAN}║     ██║  ██║██║   ██║██╔════╝██║  ██║                    ║${NC}"
    echo -e "${CYAN}║     ███████║██║   ██║███████╗███████║                    ║${NC}"
    echo -e "${CYAN}║     ██╔══██║██║   ██║╚════██║██╔══██║                    ║${NC}"
    echo -e "${CYAN}║     ██║  ██║╚██████╔╝███████║██║  ██║                    ║${NC}"
    echo -e "${CYAN}║     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝                    ║${NC}"
    echo -e "${CYAN}║     Zero-Knowledge Encrypted Chat Vault                   ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}[HUSH] ✗ $1 not found${NC}"
        return 1
    fi
    echo -e "${GREEN}[HUSH] ✓ $1${NC}"
    return 0
}

docker_deploy() {
    echo ""
    echo -e "${CYAN}[HUSH] Docker deployment selected${NC}"
    echo ""

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[HUSH] ERROR: Docker is not installed${NC}"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}[HUSH] ERROR: docker-compose is not installed${NC}"
        exit 1
    fi

    # Run existing Python CLI for Docker deployment
    export PYTHONPATH="$SCRIPT_DIR/cli:$PYTHONPATH"
    python3 -c "
import sys
sys.path.insert(0, 'cli')
from main import main
sys.argv = ['hush', 'deploy']
main()
"
}

local_deploy() {
    echo ""
    echo -e "${CYAN}[HUSH] Local development selected${NC}"
    echo ""
    echo "[HUSH] Checking prerequisites..."

    MISSING=0
    check_command "python3" || MISSING=1
    check_command "node" || MISSING=1
    check_command "npm" || MISSING=1
    check_command "psql" || MISSING=1

    if [ $MISSING -eq 1 ]; then
        echo ""
        echo -e "${RED}[HUSH] Please install missing prerequisites and try again.${NC}"
        exit 1
    fi

    echo ""

    # Setup PostgreSQL
    echo "[HUSH] Setting up PostgreSQL database..."
    if psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw hush; then
        echo -e "${YELLOW}[HUSH] Database 'hush' already exists${NC}"
    else
        echo "[HUSH] Creating database (you may be prompted for postgres password)..."
        psql -U postgres -c "CREATE USER hush WITH PASSWORD 'hush';" 2>/dev/null || true
        psql -U postgres -c "CREATE DATABASE hush OWNER hush;" 2>/dev/null || true
        echo -e "${GREEN}[HUSH] Database 'hush' created${NC}"
    fi

    echo ""

    # Install CLI dependencies
    echo "[HUSH] Installing CLI dependencies..."
    pip3 install -r cli/requirements.txt -q 2>/dev/null || pip install -r cli/requirements.txt -q

    # Install backend dependencies
    echo "[HUSH] Installing backend dependencies..."
    pip3 install -r backend/requirements.txt -q 2>/dev/null || pip install -r backend/requirements.txt -q
    echo -e "${GREEN}[HUSH] Backend dependencies installed${NC}"

    # Install frontend dependencies
    echo "[HUSH] Installing frontend dependencies..."
    cd frontend && npm install --silent && cd ..
    echo -e "${GREEN}[HUSH] Frontend dependencies installed${NC}"

    echo ""

    # Generate secrets if needed
    if [ ! -f .env ]; then
        echo "[HUSH] Generating secrets..."
        cd cli
        python3 << 'PYTHON_SCRIPT'
from secret_generator import SecretGenerator
from config import ConfigManager

generator = SecretGenerator()
secrets = generator.generate_all()

config = {
    'max_auth_failures': 5,
    'failure_mode': 'ip_temp',
    'ip_block_minutes': 60,
    'panic_mode': False,
    'persist_vault': True,
    'deployment_mode': 'local'
}

manager = ConfigManager()
manager.write_env(config, secrets)

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
PYTHON_SCRIPT
        cd ..
    else
        echo -e "${YELLOW}[HUSH] Using existing .env file${NC}"
    fi

    echo ""
    echo "[HUSH] Starting services..."
    echo ""

    # Start backend
    echo -e "${CYAN}[HUSH] Starting backend on http://localhost:8000${NC}"
    cd backend
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    cd ..

    sleep 2

    # Start frontend
    echo -e "${CYAN}[HUSH] Starting frontend on http://localhost:5173${NC}"
    cd frontend
    npm run dev &
    FRONTEND_PID=$!
    cd ..

    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  HUSH is running!                                         ║${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}║  Frontend: http://localhost:5173                          ║${NC}"
    echo -e "${GREEN}║  Backend:  http://localhost:8000                          ║${NC}"
    echo -e "${GREEN}║                                                           ║${NC}"
    echo -e "${GREEN}║  Press Ctrl+C to stop all services                        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    trap "echo ''; echo '[HUSH] Shutting down...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
    wait
}

# Main
print_banner

echo "[HUSH] Deployment mode:"
echo "       1. Docker (recommended) - requires Docker Desktop"
echo "       2. Local development - requires PostgreSQL, Python, Node.js"
echo ""
read -p "       Select [1-2]: " MODE

case $MODE in
    1) docker_deploy ;;
    2) local_deploy ;;
    *)
        echo -e "${RED}[HUSH] Invalid selection. Please run again and select 1 or 2.${NC}"
        exit 1
        ;;
esac
```

**Rationale:** Bash script for Linux/macOS users with Docker/Local choice.

---

### Step 4: Create hush.ps1 (PowerShell Script)

**Action:** CREATE
**File:** `hush.ps1`

**Full Content:**
```powershell
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

    # Run existing Python CLI
    $env:PYTHONPATH = "$ScriptDir\cli;$env:PYTHONPATH"
    python -c @"
import sys
sys.path.insert(0, 'cli')
from main import main
sys.argv = ['hush', 'deploy']
main()
"@
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

    # Setup PostgreSQL
    Write-Host "[HUSH] Setting up PostgreSQL database..."
    try {
        $dbCheck = psql -U postgres -lqt 2>$null
        if ($dbCheck -match "\bhush\b") {
            Write-Host "[HUSH] Database 'hush' already exists" -ForegroundColor Yellow
        } else {
            Write-Host "[HUSH] Creating database (you may be prompted for postgres password)..."
            psql -U postgres -c "CREATE USER hush WITH PASSWORD 'hush';" 2>$null
            psql -U postgres -c "CREATE DATABASE hush OWNER hush;" 2>$null
            Write-Host "[HUSH] Database 'hush' created" -ForegroundColor Green
        }
    } catch {
        Write-Host "[HUSH] Warning: Could not auto-create database." -ForegroundColor Yellow
        Write-Host "       Please create manually with:"
        Write-Host "       CREATE USER hush WITH PASSWORD 'hush';"
        Write-Host "       CREATE DATABASE hush OWNER hush;"
    }

    Write-Host ""

    # Install dependencies
    Write-Host "[HUSH] Installing CLI dependencies..."
    python -m pip install -r cli/requirements.txt -q 2>$null

    Write-Host "[HUSH] Installing backend dependencies..."
    python -m pip install -r backend/requirements.txt -q 2>$null
    Write-Host "[HUSH] Backend dependencies installed" -ForegroundColor Green

    Write-Host "[HUSH] Installing frontend dependencies..."
    Push-Location frontend
    npm install --silent 2>$null
    Pop-Location
    Write-Host "[HUSH] Frontend dependencies installed" -ForegroundColor Green

    Write-Host ""

    # Generate secrets if needed
    if (-not (Test-Path ".env")) {
        Write-Host "[HUSH] Generating secrets..."
        Push-Location cli
        python -c @"
from secret_generator import SecretGenerator
from config import ConfigManager

generator = SecretGenerator()
secrets = generator.generate_all()

config = {
    'max_auth_failures': 5,
    'failure_mode': 'ip_temp',
    'ip_block_minutes': 60,
    'panic_mode': False,
    'persist_vault': True,
    'deployment_mode': 'local'
}

manager = ConfigManager()
manager.write_env(config, secrets)

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
    } else {
        Write-Host "[HUSH] Using existing .env file" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "[HUSH] Starting services..."
    Write-Host ""

    # Start backend
    Write-Host "[HUSH] Starting backend on http://localhost:8000" -ForegroundColor Cyan
    $backendJob = Start-Job -ScriptBlock {
        Set-Location $using:ScriptDir\backend
        python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
    }

    Start-Sleep -Seconds 3

    # Start frontend
    Write-Host "[HUSH] Starting frontend on http://localhost:5173" -ForegroundColor Cyan
    $frontendJob = Start-Job -ScriptBlock {
        Set-Location $using:ScriptDir\frontend
        npm run dev
    }

    Write-Host ""
    Write-Host "+==========================================================+" -ForegroundColor Green
    Write-Host "|  HUSH is running!                                        |" -ForegroundColor Green
    Write-Host "|                                                          |" -ForegroundColor Green
    Write-Host "|  Frontend: http://localhost:5173                         |" -ForegroundColor Green
    Write-Host "|  Backend:  http://localhost:8000                         |" -ForegroundColor Green
    Write-Host "|                                                          |" -ForegroundColor Green
    Write-Host "|  Press Ctrl+C to stop all services                       |" -ForegroundColor Green
    Write-Host "+==========================================================+" -ForegroundColor Green
    Write-Host ""

    try {
        while ($true) {
            Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
            Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    } finally {
        Write-Host ""
        Write-Host "[HUSH] Shutting down..." -ForegroundColor Yellow
        Stop-Job -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
        Remove-Job -Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    }
}

# Main
Print-Banner

Write-Host "[HUSH] Deployment mode:"
Write-Host "       1. Docker (recommended) - requires Docker Desktop"
Write-Host "       2. Local development - requires PostgreSQL, Python, Node.js"
Write-Host ""
$mode = Read-Host "       Select [1-2]"

switch ($mode) {
    "1" { Docker-Deploy }
    "2" { Local-Deploy }
    default {
        Write-Host "[HUSH] Invalid selection. Please run again and select 1 or 2." -ForegroundColor Red
        exit 1
    }
}
```

**Rationale:** PowerShell script for Windows users with Docker/Local choice.

---

## Verification Checklist

### After Implementation
- [ ] `hush` file deleted
- [ ] `cli/config.py` updated with deployment_mode check
- [ ] `hush.sh` created and executable (`chmod +x hush.sh`)
- [ ] `hush.ps1` created
- [ ] Docker mode: `./hush.sh` → select 1 → containers build and start
- [ ] Local mode: `./hush.sh` → select 2 → services start on localhost
- [ ] Windows: `.\hush.ps1` works for both modes

---

## Rollback Plan

```bash
# Restore original hush file
git checkout HEAD -- hush cli/config.py

# Remove new scripts
rm -f hush.sh hush.ps1
```

**Safe Commit:** `00d18df`

---

## Documentation Updates

After implementation, update:
- [ ] `CLAUDE.md` - Change `./hush deploy` to `./hush.sh` or `.\hush.ps1`
- [ ] `.claude/context/workflows/deployment.md` - Add local deployment section

---

## Human Review Required

**Verify:**
1. Two entry points (bash + PowerShell) acceptable?
2. Auto-creating PostgreSQL user/database OK?
3. Local mode uses sensible security defaults (no interactive prompts)?
4. Docker mode reuses existing Python CLI unchanged?

**Approved:** [ ] Yes / [ ] No / [ ] With modifications

---

**Plan Version:** 3.0
**Last Updated:** 2026-01-18
