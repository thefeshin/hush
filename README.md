# HUSH - Zero-Knowledge Encrypted Chat Vault

Private, encrypted conversations with zero server knowledge.

---

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Python 3.7+
- OpenSSL (included with Git for Windows, pre-installed on Linux/macOS)

---

## Deployment

**Bash (Linux/macOS):**
```bash
chmod +x hush
./hush deploy
```

**PowerShell (Windows):**
```powershell
python hush deploy
```

This single command automatically:
1. Installs required Python packages
2. Generates SSL certificates (if missing)
3. Prompts for security configuration
4. Generates 12-word passphrase and secrets
5. Builds and starts all Docker containers

Access at: **https://localhost**

---

## Development Mode (Without Docker)

For local development/testing without the full stack.

### 1. Database (PostgreSQL via Docker)

**Bash:**
```bash
docker run -d --name hush-postgres \
  -e POSTGRES_USER=hush \
  -e POSTGRES_PASSWORD=hush \
  -e POSTGRES_DB=hush \
  -p 5432:5432 \
  postgres:16-alpine
```

**PowerShell:**
```powershell
docker run -d --name hush-postgres `
  -e POSTGRES_USER=hush `
  -e POSTGRES_PASSWORD=hush `
  -e POSTGRES_DB=hush `
  -p 5432:5432 `
  postgres:16-alpine
```

### 2. Backend

**Bash:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**PowerShell:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend at: **http://localhost:8000**

> **Note:** Requires `.env` file with `AUTH_HASH`, `KDF_SALT`, `JWT_SECRET`, `DATABASE_URL` (or run `./hush deploy` first to generate).

### 3. Frontend

**Bash & PowerShell (same):**
```bash
cd frontend
npm install
npm run dev
```

Frontend at: **http://localhost:5173**

---

## Troubleshooting

### View logs
```bash
docker-compose logs -f
```

### Check container health
```bash
docker-compose ps
```

### Restart a service
```bash
docker-compose restart backend
```

### Full reset (wipes all data)

**Bash:**
```bash
docker-compose down -v
rm .env
./hush deploy
```

**PowerShell:**
```powershell
docker-compose down -v
Remove-Item .env
python hush deploy
```
