# HUSH - Zero-Knowledge Encrypted Chat Vault

Private, encrypted conversations with zero server knowledge.

---

## Production Deployment (Docker) - Recommended

**Bash (Linux/Mac):**
```bash
chmod +x hush
./hush deploy
```

**PowerShell (Windows):**
```powershell
python hush deploy
```

This will:
1. Prompt for security configuration (max failures, failure mode, etc.)
2. Generate 12-word passphrase and secrets
3. Build all Docker containers
4. Start PostgreSQL, backend, frontend, and Nginx

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
