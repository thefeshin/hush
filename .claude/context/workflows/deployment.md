# Workflow: Deployment

**Complexity:** MEDIUM
**Primary Agent:** `deployment-ops`
**Last Updated:** 2026-01-18

---

## Overview

Deployment is handled by the `./hush deploy` CLI command, which interactively configures security settings, generates secrets, and orchestrates Docker containers.

**Key Principle:** One command deployment with security prompts - `./hush deploy`

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| CLI entry | `hush` (root) | 1-20 | `./hush deploy` |
| Deploy orchestration | `cli/main.py` | 25-120 | Main deploy logic |
| Security prompts | `cli/prompts.py` | 10-80 | Interactive questions |
| Secret generation | `cli/secrets.py` | 15-70 | 12 words, JWT, salt |

---

## Call Chain: Deploy

```
hush (script)
└─ cli/main.py:deploy()
   ├─ print_banner() [cli/main.py:15]
   ├─ check_existing_env() [cli/config.py:20]
   │  └─ if .env exists: prompt for action
   ├─ prompts.security_questions() [cli/prompts.py:15]
   │  ├─ MAX_AUTH_FAILURES (default: 5)
   │  ├─ FAILURE_MODE (ip_temp, ip_perm, db_wipe, db_wipe_shutdown)
   │  ├─ IP_BLOCK_DURATION (if ip_temp)
   │  ├─ PANIC_MODE (true/false)
   │  └─ PERSIST_VAULT (reuse secrets or regenerate)
   ├─ secrets.generate_all() [cli/secrets.py:25]
   │  ├─ words = generate_12_words() [cli/wordlist.py:10]
   │  ├─ salt = generate_salt()
   │  ├─ auth_hash = sha256(normalize(words))
   │  └─ jwt_secret = generate_jwt_secret()
   ├─ config.write_env(settings) [cli/config.py:45]
   │  └─ write .env with 600 permissions
   ├─ print_secrets_once(words, ...) [cli/main.py:85]
   │  └─ Display to stdout (NEVER stored)
   ├─ docker_compose_build() [cli/main.py:95]
   │  └─ subprocess: docker-compose build
   └─ docker_compose_up() [cli/main.py:105]
      └─ subprocess: docker-compose up -d
```

---

## Configuration Generated

**.env file contents:**
```bash
# Security
AUTH_HASH=<sha256 of normalized 12 words>
JWT_SECRET=<random 32 bytes, base64>
KDF_SALT=<random 16-32 bytes, base64>

# Defense
MAX_AUTH_FAILURES=5
FAILURE_MODE=ip_temp
IP_BLOCK_DURATION=30
PANIC_MODE=false

# Persistence
PERSIST_VAULT=true

# Database
POSTGRES_USER=hush
POSTGRES_PASSWORD=<random>
POSTGRES_DB=hush

# URLs
FRONTEND_URL=https://localhost
BACKEND_URL=http://backend:8000
```

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `hush` | CLI entry point | Calls `cli/main.py` |
| `cli/main.py` | Deploy orchestration | `deploy()`, `docker_compose_*()` |
| `cli/prompts.py` | Interactive questions | `security_questions()` |
| `cli/secrets.py` | Secret generation | `generate_12_words()`, `generate_salt()` |
| `cli/config.py` | .env management | `write_env()`, `check_existing_env()` |
| `cli/wordlist.py` | 12-word vocabulary | Word list for passphrase |
| `docker-compose.yml` | Container orchestration | 4 services definition |

---

## Docker Services

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | postgres:16-alpine | Database |
| `backend` | Built from `backend/Dockerfile` | FastAPI API |
| `frontend` | Built from `frontend/Dockerfile` | React static files |
| `nginx` | nginx:alpine | TLS termination, routing |

---

## Persistence Options

### PERSIST_VAULT=true
- Reuse existing .env secrets on redeploy
- Existing data remains accessible
- Good for updates/maintenance

### PERSIST_VAULT=false
- Generate new secrets each deploy
- All existing data becomes unreadable
- Fresh start / security reset

---

## Security Considerations

1. **12 words shown once** - Never stored, user must save
2. **.env file permissions** - 600 (owner read/write only)
3. **Salt is critical** - Changing it invalidates all data
4. **Defense settings** - Review carefully before deploy

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| Docker not running | Docker daemon stopped | Start Docker |
| Port 443 in use | Another service | Stop conflicting service |
| Build fails | Dependency issues | Check Dockerfiles |
| .env permission denied | File locked | Check file permissions |

---

## Manual Operations

```bash
# Rebuild specific service
docker-compose build backend

# View logs
docker-compose logs -f backend

# Restart service
docker-compose restart backend

# Stop all
docker-compose down

# Stop and remove volumes (DATA LOSS)
docker-compose down -v
```

---

## Related Workflows

- [defense_system.md](./defense_system.md) - Configured at deploy
- [vault_key_derivation.md](./vault_key_derivation.md) - Uses generated salt

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test fresh deploy
- [ ] Test redeploy with PERSIST_VAULT=true
- [ ] Run /verify-docs-current
