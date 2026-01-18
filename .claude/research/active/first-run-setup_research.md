# Research: First-Run Setup Commands

**Date:** 2026-01-18
**Researcher:** Claude Code
**Status:** COMPLETE

---

## Objective

Document complete first-run setup commands for HUSH that work on both PowerShell (Windows) and Bash (Linux/macOS), including all build steps and package installations.

---

## Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Docker | 20.10+ | `docker --version` |
| Docker Compose | 2.0+ (or v3.8 compatible) | `docker-compose --version` |
| Python | 3.7+ | `python --version` or `python3 --version` |
| pip | Latest | `pip --version` |

---

## Critical Discovery: SSL Certificates Required

**Issue Found:** The nginx configuration expects SSL certificates at `nginx/ssl/cert.pem` and `nginx/ssl/key.pem`, but only a `.gitkeep` placeholder exists.

**Impact:** Deployment will fail without generating SSL certificates first.

---

## Complete First-Run Commands

### Option 1: Production Deployment (Docker) - Recommended

#### Bash (Linux/macOS)

```bash
# 1. Install CLI dependencies
pip install -r cli/requirements.txt

# 2. Generate self-signed SSL certificates
mkdir -p nginx/ssl
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -days 365 \
  -subj "/CN=localhost"

# 3. Make CLI executable
chmod +x hush

# 4. Deploy (interactive prompts)
./hush deploy
```

#### PowerShell (Windows)

```powershell
# 1. Install CLI dependencies
pip install -r cli/requirements.txt

# 2. Generate self-signed SSL certificates
# Option A: Using OpenSSL (if installed via Git for Windows or standalone)
New-Item -ItemType Directory -Force -Path nginx/ssl
openssl req -x509 -newkey rsa:4096 -nodes `
  -keyout nginx/ssl/key.pem `
  -out nginx/ssl/cert.pem `
  -days 365 `
  -subj "/CN=localhost"

# Option B: Using PowerShell (Windows 10+ with OpenSSL unavailable)
# See "SSL Certificate Generation Alternatives" section below

# 3. Deploy (interactive prompts)
python hush deploy
```

---

### Option 2: Development Mode (Without Full Docker Stack)

#### Bash (Linux/macOS)

```bash
# 1. Start PostgreSQL container
docker run -d --name hush-postgres \
  -e POSTGRES_USER=hush \
  -e POSTGRES_PASSWORD=hush \
  -e POSTGRES_DB=hush \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Wait for PostgreSQL to be ready
sleep 5

# 3. Set up backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Create minimal .env for development
cat > ../.env << 'EOF'
AUTH_HASH=test_hash_replace_me
KDF_SALT=test_salt_replace_me
JWT_SECRET=development_secret_key_change_in_production
MAX_AUTH_FAILURES=5
FAILURE_MODE=ip_temp
IP_BLOCK_MINUTES=60
PANIC_MODE=false
PERSIST_VAULT=false
DATABASE_URL=postgresql://hush:hush@localhost:5432/hush
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
EOF

# 5. Start backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &

# 6. Set up frontend (in new terminal)
cd ../frontend
npm install
npm run dev
```

#### PowerShell (Windows)

```powershell
# 1. Start PostgreSQL container
docker run -d --name hush-postgres `
  -e POSTGRES_USER=hush `
  -e POSTGRES_PASSWORD=hush `
  -e POSTGRES_DB=hush `
  -p 5432:5432 `
  postgres:16-alpine

# 2. Wait for PostgreSQL to be ready
Start-Sleep -Seconds 5

# 3. Set up backend
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. Create minimal .env for development
@"
AUTH_HASH=test_hash_replace_me
KDF_SALT=test_salt_replace_me
JWT_SECRET=development_secret_key_change_in_production
MAX_AUTH_FAILURES=5
FAILURE_MODE=ip_temp
IP_BLOCK_MINUTES=60
PANIC_MODE=false
PERSIST_VAULT=false
DATABASE_URL=postgresql://hush:hush@localhost:5432/hush
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
"@ | Out-File -FilePath ..\.env -Encoding utf8

# 5. Start backend (in this terminal)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 6. Set up frontend (in NEW PowerShell window)
cd ..\frontend
npm install
npm run dev
```

---

## SSL Certificate Generation Alternatives

### Using OpenSSL (Recommended)

Available on:
- Linux: Pre-installed or `apt install openssl`
- macOS: Pre-installed
- Windows: Via Git Bash, or download from slproweb.com

```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

### Using PowerShell (Windows 10+ Native)

```powershell
# Create self-signed certificate
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1)

# Export certificate
New-Item -ItemType Directory -Force -Path nginx/ssl
Export-Certificate -Cert $cert -FilePath nginx/ssl/cert.pem -Type CERT

# Export private key (requires OpenSSL for PEM conversion, or use PFX)
$pwd = ConvertTo-SecureString -String "temppassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath nginx/ssl/temp.pfx -Password $pwd

# Convert to PEM (requires OpenSSL)
openssl pkcs12 -in nginx/ssl/temp.pfx -nocerts -nodes -out nginx/ssl/key.pem -passin pass:temppassword
openssl pkcs12 -in nginx/ssl/temp.pfx -clcerts -nokeys -out nginx/ssl/cert.pem -passin pass:temppassword
Remove-Item nginx/ssl/temp.pfx
```

### Using mkcert (Cross-Platform, Easiest)

```bash
# Install mkcert (https://github.com/FiloSottile/mkcert)
# macOS: brew install mkcert
# Windows: choco install mkcert
# Linux: Follow GitHub instructions

mkcert -install
cd nginx/ssl
mkcert localhost
mv localhost.pem cert.pem
mv localhost-key.pem key.pem
```

---

## Dependency Summary

### CLI Dependencies (`cli/requirements.txt`)
```
mnemonic>=0.20
```

### Backend Dependencies (`backend/requirements.txt`)
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
asyncpg==0.29.0
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
websockets==12.0
python-multipart==0.0.6
```

### Frontend Dependencies (`frontend/package.json`)
```
react@^18.2.0
react-dom@^18.2.0
react-router-dom@^6.21.0
argon2-browser@^1.18.0
zustand@^4.4.7
idb@^8.0.0
qrcode.react@^3.1.0
```

---

## Deployment Flow Diagram

```
Prerequisites Check
        │
        ▼
Install CLI dependencies (pip install -r cli/requirements.txt)
        │
        ▼
Generate SSL certificates (openssl or mkcert)
        │
        ▼
Run deployment command (./hush deploy or python hush deploy)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  Interactive Prompts:                                     │
│  1. Max auth failures (default: 5)                        │
│  2. Failure mode (ip_temp/ip_perm/db_wipe/db_wipe_shutdown)│
│  3. IP block duration (if ip_temp)                        │
│  4. PANIC MODE (y/N)                                      │
│  5. Vault persistence (regenerate/reuse)                  │
└───────────────────────────────────────────────────────────┘
        │
        ▼
Generate secrets (12 words, salt, hash, JWT secret)
        │
        ▼
Write .env file (permissions: 600)
        │
        ▼
Print 12-word passphrase (SAVE THIS - shown ONCE)
        │
        ▼
docker-compose build (builds backend + frontend images)
        │
        ▼
docker-compose up -d (starts all 4 services)
        │
        ▼
Access at https://localhost
```

---

## Post-Deployment Verification

```bash
# Check all containers are running
docker-compose ps

# Expected output:
# hush-postgres   running (healthy)
# hush-backend    running (healthy)
# hush-frontend   running
# hush-nginx      running

# Check logs if issues
docker-compose logs -f

# Test health endpoint
curl -k https://localhost/api/health
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `mnemonic` not found | CLI deps not installed | `pip install -r cli/requirements.txt` |
| SSL certificate error | Missing certs | Generate with openssl/mkcert |
| Port 443 in use | Another service | Stop other service or change port |
| PostgreSQL connection refused | Container not healthy | Wait or check `docker-compose logs postgres` |
| Backend 500 errors | Missing .env variables | Ensure AUTH_HASH, KDF_SALT, JWT_SECRET set |

---

## Summary for Plan Phase (150 words)

HUSH requires specific first-run setup that the README partially documents but is missing a critical step: **SSL certificate generation**. The nginx configuration expects certificates at `nginx/ssl/cert.pem` and `nginx/ssl/key.pem`, but only a `.gitkeep` exists.

Complete first-run sequence:
1. Install Python CLI dependency: `pip install -r cli/requirements.txt`
2. Generate SSL certificates using openssl, mkcert, or PowerShell
3. Run deployment: `./hush deploy` (Bash) or `python hush deploy` (PowerShell)

The deployment CLI handles Docker builds, secret generation, and container orchestration. Users must save the 12-word passphrase shown during deployment - it cannot be recovered.

For development mode, PostgreSQL can be run standalone with manual .env configuration, and backend/frontend started separately.

---

**Files Analyzed:**
- `hush` (CLI entry point)
- `cli/main.py`, `cli/prompts.py`, `cli/secrets.py`, `cli/config.py`
- `cli/requirements.txt`
- `backend/requirements.txt`, `backend/Dockerfile`, `backend/app/main.py`
- `frontend/package.json`, `frontend/Dockerfile`, `frontend/vite.config.ts`
- `docker-compose.yml`, `nginx/nginx.conf`, `.env.example`
- `README.md`, `PLAN.md`
