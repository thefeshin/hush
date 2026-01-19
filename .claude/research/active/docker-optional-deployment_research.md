# Research: Docker-Optional Deployment

**Date:** 2026-01-18
**Researcher:** Claude Code
**Status:** COMPLETE
**Context Budget Used:** ~15% of 200k

---

## Objective

Add a user prompt to choose between Docker and local deployment modes, enabling users without Docker access to run HUSH directly on their machine.

---

## Relevant Files Explored

| File | Lines | Key Findings |
|------|-------|--------------|
| `cli/main.py` | 1-293 | Main deployment orchestration; Docker commands at lines 207-218, 241-243, 257 |
| `cli/prompts.py` | 1-124 | Interactive prompt framework; can extend for deployment mode |
| `cli/config.py` | 1-67 | Writes .env with hardcoded Docker DATABASE_URL at line 51 |
| `backend/app/config.py` | 1-47 | Settings with Docker-specific DATABASE_URL default at line 15 |
| `backend/app/database.py` | 1-99 | Uses asyncpg; no Docker dependency, just needs valid connection string |
| `docker-compose.yml` | 1-65 | Defines 4 services: postgres, backend, frontend, nginx |
| `nginx/nginx.conf` | 1-57 | Proxies /api/ to backend:8000; serves static frontend |
| `frontend/vite.config.ts` | 1-48 | Has dev proxy config; can serve frontend directly |

---

## Code Flow Analysis

**Entry Point → Exit Point Trace:**

```
main() [cli/main.py:166]
├─ run_setup() [cli/main.py:99-112]
│  ├─ ensure_dependencies() [cli/main.py:23-45]
│  └─ ensure_ssl_certificates() [cli/main.py:48-96]
├─ handle_existing_deployment() [cli/main.py:230-258] (if .env exists)
│  └─ subprocess: docker-compose down/build/up [lines 241-257]
├─ SecurityPrompts.collect_all() [cli/prompts.py:10-32]
├─ SecretGenerator.generate_all() [cli/secret_generator.py:15-27]
├─ ConfigManager.write_env() [cli/config.py:33-66]
│  └─ DATABASE_URL hardcoded: "postgresql://hush:hush@postgres:5432/hush"
├─ subprocess: docker-compose build [cli/main.py:207-213]
├─ subprocess: docker-compose up -d [cli/main.py:216-222]
└─ print success message [cli/main.py:224-227]
```

**Decision Points:**
- Line 184-186: Check if .env exists → handle_existing_deployment
- Line 211: Build failure → exit
- Line 220: Run failure → exit

**Docker Command Locations (to be made conditional):**
1. `cli/main.py:207-213` - `docker-compose build`
2. `cli/main.py:216-222` - `docker-compose up -d`
3. `cli/main.py:241` - `docker-compose down`
4. `cli/main.py:242` - `docker-compose build`
5. `cli/main.py:243` - `docker-compose up -d`
6. `cli/main.py:257` - `docker-compose down -v`

---

## Dependencies Identified

### External Dependencies

| Dependency | Type | Purpose | Docker Mode | Local Mode |
|------------|------|---------|-------------|------------|
| PostgreSQL 16 | Database | Data storage | Docker container | Local install required |
| Docker/Compose | Container runtime | Service orchestration | Required | Not needed |
| Node.js 20 | Runtime | Frontend build | Docker container | Local install required |
| Python 3.12 | Runtime | Backend | Docker container | Local install required |
| OpenSSL | CLI tool | SSL cert generation | Required | Required |

### Internal Dependencies

| File | Purpose |
|------|---------|
| `cli/prompts.py` | User input collection - extend for deployment mode |
| `cli/config.py` | ENV file generation - make DATABASE_URL dynamic |
| `backend/requirements.txt` | Backend Python dependencies |
| `frontend/package.json` | Frontend Node dependencies |

---

## Non-Docker Deployment Requirements

### Required User Prerequisites
1. **PostgreSQL 16** running locally
2. **Python 3.12** with pip
3. **Node.js 20** with npm
4. **OpenSSL** for certificate generation

### Configuration Changes Needed

**DATABASE_URL Options:**
- Docker: `postgresql://hush:hush@postgres:5432/hush`
- Local: `postgresql://hush:hush@localhost:5432/hush` (or user-provided)

**Service Management:**
- Backend: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Frontend Dev: `npm run dev` (Vite with proxy)
- Frontend Prod: `npm run build` + serve `dist/` via nginx or similar

---

## Proposed User Flow

```
[HUSH] Deployment mode:
       1. Docker (recommended) - requires Docker Desktop
       2. Local development - requires PostgreSQL, Python, Node.js
       Select [1-2]: _
```

**If Docker selected:** Current flow unchanged

**If Local selected:**
1. Check for local prerequisites (psql, python, node)
2. Prompt for PostgreSQL connection details (or use defaults)
3. Create Python venv and install backend deps
4. Install frontend deps
5. Generate .env with local DATABASE_URL
6. Print instructions to start services manually OR start them directly

---

## Test Files & Coverage

### Existing Tests
- None found (test infrastructure not implemented)

### Coverage Gaps
- No tests for CLI prompts
- No tests for config generation
- No integration tests for deployment

---

## Known Gotchas

**Relevant from KNOWN_GOTCHAS.md:**
- GOTCHA-DEPLOY-001: Salt change = total data loss (applies to both modes)
- GOTCHA-DEPLOY-002: 12 words shown once only (applies to both modes)
- GOTCHA-DEPLOY-003: .env file permissions (applies to both modes)

**New Gotchas to Document:**
- Local PostgreSQL must be running before backend starts
- Vite dev server proxy differs from nginx routing
- SSL certificates still needed for HTTPS in local mode (or use HTTP for dev)

---

## Open Questions

### Technical Questions
- [x] Can backend run without Docker? **Yes** - just needs valid DATABASE_URL
- [x] Can frontend run without Docker? **Yes** - `npm run dev` or `npm run build`
- [ ] Should local mode start services automatically or print instructions?
- [ ] Should we support HTTP-only for local development (skip SSL)?

### Business Logic Questions
- [ ] Is local mode "production ready" or "development only"?
- [ ] Should we prompt for custom PostgreSQL credentials?

---

## Summary (for Plan Phase)

Docker-optional deployment requires modifying `cli/main.py` and `cli/config.py` to conditionally handle two deployment paths.

**Entry Points:**
- `cli/main.py:166` - main() function
- `cli/prompts.py:7` - SecurityPrompts class

**Core Changes:**
Add deployment mode prompt, make DATABASE_URL configurable, replace subprocess Docker calls with conditional logic that either runs Docker or starts local services.

**Key Files:**
1. `cli/main.py` - Add deployment mode branching, local service management
2. `cli/prompts.py` - Add deployment mode prompt
3. `cli/config.py` - Dynamic DATABASE_URL based on mode

**Dependencies:**
- External: PostgreSQL, Python, Node.js (local mode)
- Internal: prompts.py, config.py, secret_generator.py

**Test Coverage:** Missing

**Recommended Approach:**
1. Add `_prompt_deployment_mode()` to prompts.py
2. Store mode in config dict
3. Branch main() based on mode
4. For local: check prerequisites, create venv, install deps, write .env with localhost DB, optionally start services

**Known Risks:**
Local mode adds complexity and support burden; users may have varying PostgreSQL setups.

---

## Architecture Decision

### Option A: Instructions-Only Local Mode
Print step-by-step instructions for manual setup. Simpler, less error-prone.

### Option B: Automated Local Mode
Auto-detect prerequisites, create venv, install deps, start services. More complex but better UX.

**Recommendation:** Start with Option A for v1, upgrade to Option B later.

---

## Next Steps

After research completes:
1. Research document saved in `.claude/research/active/`
2. Run `/rpi-plan docker-optional-deployment` to create implementation plan
3. Human reviews plan before `/rpi-implement`

---

**Context Usage Report:**
- Files read: 12
- Tokens used: ~30k (15% of 200k)
- Compaction needed: No
