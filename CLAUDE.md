# CLAUDE.md - HUSH

This file provides guidance to Claude Code when working with code in this repository.

---

## Project Identity

**Platform:** Zero-Knowledge Encrypted Chat Vault - Private peer-to-peer messaging with client-side encryption
**Domain:** https://localhost (self-hosted)
**Tech Stack:** FastAPI 0.109 (Python 3.12) + React 18 (TypeScript) + PostgreSQL 16 + Docker Compose
**Status:** Initial Development

**Quick Reference:**
- **API:** /api/* (proxied via Nginx)
- **Repo:** Local repository
- **Deploy:** Docker Compose with `./hush deploy`

---

## Essential Commands

### Development
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install
npm run dev
```

### Testing
```bash
pytest                              # All tests (when added)
npm run lint                        # Frontend linting
npm run build                       # Build validation
```

### Database
```bash
# Schema is in backend/app/models/schema.sql
# Auto-applied on container startup via database.py
docker-compose exec postgres psql -U hush -d hush
```

### Deployment
```bash
./hush deploy                       # Full interactive deployment
docker-compose up -d --build        # Manual rebuild
docker-compose logs -f              # Watch logs
```

---

## Navigation Rules

### High-Level Task (Refactoring a Flow)
**Example:** "Refactor the thread encryption to use a different key derivation"

**Chain:**
1. Start: [.claude/indexes/workflows/CATEGORY_INDEX.md](./.claude/indexes/workflows/CATEGORY_INDEX.md)
2. Find: Relevant category (encryption, messaging)
3. Load: Domain index
4. Detail: Workflow file
5. Code: [.claude/indexes/code/CATEGORY_INDEX.md](./.claude/indexes/code/CATEGORY_INDEX.md)
6. Implement: Use appropriate specialized agent

**Context Budget:** ~40k tokens (20% of 200k window)

---

### Low-Level Task (Fix Hardcoded Value)
**Example:** "Change the Argon2 memory parameter from 64MB to 128MB"

**Chain:**
1. Start: Search Patterns section below
2. Pattern: Use grep for `MEMORY` or `65536`
3. Verify: Check `frontend/src/crypto/kdf.ts`
4. Fix: Direct file edits
5. Validate: Run build

**Context Budget:** ~15k tokens (7.5% of 200k window)

---

### Feature Task (Add New Feature)
**Example:** "Add message read receipts"

**Chain:**
1. Start: [.claude/indexes/routing/CATEGORY_INDEX.md](./.claude/indexes/routing/CATEGORY_INDEX.md)
2. Route: [.claude/indexes/routing/HIGH_LEVEL_ROUTER.md](./.claude/indexes/routing/HIGH_LEVEL_ROUTER.md)
3. Research: /rpi-research
4. Plan: /rpi-plan
5. Implement: /rpi-implement

**Context Budget:** ~50k tokens (25% of 200k window)

---

## Search Patterns

### Finding Configuration Values

**Environment variables:**
```bash
grep -r "os.getenv\|process.env\|Settings" backend/ frontend/
```

**Hardcoded URLs/domains:**
```bash
grep -r "localhost\|https://\|http://" --include="*.py" --include="*.ts" --include="*.tsx"
```

---

### Finding Business Logic

**Core Files:**
- `backend/app/routers/auth.py` - Authentication endpoint
- `backend/app/services/defense.py` - IP blocking, panic mode
- `frontend/src/crypto/kdf.ts` - Vault key derivation (Argon2id)
- `frontend/src/crypto/aes.ts` - AES-256-GCM encryption
- `frontend/src/crypto/thread-key.ts` - Thread key derivation (HKDF)
- `frontend/src/services/websocket.ts` - Real-time messaging
- `frontend/src/stores/` - Zustand state management

---

### Finding Database Schema

**Models:** `backend/app/models/schema.sql`
**Migrations:** N/A (schema applied on startup)

---

### Finding External Integrations

- **No external APIs** - Zero-knowledge design means no external services
- **Web Crypto API** - Browser-native cryptography
- **Argon2 WASM** - `argon2-browser` for key derivation

---

## System Architecture Mini-Map

```
Browser Client                           Server (Zero Knowledge)
┌─────────────────────────────────┐     ┌─────────────────────────────┐
│ 12-word passphrase              │     │                             │
│        ↓                        │     │  Nginx (TLS termination)    │
│ Argon2id → Vault Key (256-bit)  │     │        ↓                    │
│        ↓                        │     │  FastAPI Backend            │
│ HKDF → Thread Keys              │     │  - /api/auth (hash check)   │
│        ↓                        │     │  - /api/threads (CRUD)      │
│ AES-256-GCM → Encrypted Data    │────▶│  - /api/messages (store)    │
│        ↓                        │     │  - /ws (relay only)         │
│ IndexedDB (encrypted storage)   │     │        ↓                    │
│ Service Worker (PWA/offline)    │     │  PostgreSQL                 │
└─────────────────────────────────┘     │  (encrypted blobs only)     │
                                        └─────────────────────────────┘
```

---

## Index Directory

**3-Level Chain:** CLAUDE.md → Category (5) → Domain (4) → Detail (10)

**Level 1 - Categories:** [.claude/indexes/*/CATEGORY_INDEX.md](./.claude/indexes/)
- Workflows, Code, Search, Agents, Routing

**Level 2 - Domains:** [.claude/indexes/workflows/*.md](./.claude/indexes/workflows/)
- 4 workflow domains, 4 code domains

**Level 3 - Details:** [.claude/context/workflows/](./.claude/context/workflows/), [.claude/agents/](./.claude/agents/), [.claude/commands/](./.claude/commands/)
- 10 workflows, 6 agents, 5 commands

---

## Critical Constants

### Domain & URLs
- **Default URL:** `https://localhost`
- **API Prefix:** `/api`
- **WebSocket:** `/ws`
- **Health Check:** `/health`

### Business Constants
- **Argon2 Memory:** 65536 KB (64 MB)
- **Argon2 Iterations:** 3
- **Argon2 Parallelism:** 2
- **AES Key Size:** 256 bits
- **JWT Expiration:** 24 hours
- **Default Max Auth Failures:** 5

---

## Quick Reference

**Understanding:** [ARCHITECTURE_SNAPSHOT.md](./.claude/context/ARCHITECTURE_SNAPSHOT.md), [workflows/CATEGORY_INDEX.md](./.claude/indexes/workflows/CATEGORY_INDEX.md), [KNOWN_GOTCHAS.md](./.claude/context/KNOWN_GOTCHAS.md)

**Implementing:** [workflows/*.md](./.claude/context/workflows/), [CODE_TO_WORKFLOW_MAP.md](./.claude/context/CODE_TO_WORKFLOW_MAP.md)

**Debugging:** Check `backend/app/logging_config.py`, `docker-compose logs -f`

---

## Agent & Command Routing

**Agents:**
| Agent | Use For |
|-------|---------|
| `core-architect` | Authentication, encryption architecture |
| `api-developer` | FastAPI endpoints, schemas |
| `database-ops` | PostgreSQL, schema changes |
| `deployment-ops` | Docker, CLI, infrastructure |
| `integration-hub` | WebSocket, real-time features |

**Full matrix:** [.claude/indexes/agents/CATEGORY_INDEX.md](./.claude/indexes/agents/CATEGORY_INDEX.md)

**Commands:** `/rpi-research`, `/rpi-plan`, `/rpi-implement`, `/validate-all`, `/verify-docs-current`
**All commands:** [.claude/commands/](./.claude/commands/)

---

## Gotcha Quick Reference

### Encryption & Keys
- **12 words MUST be normalized** (lowercase, trimmed, single spaces) before hashing
- **Thread keys are deterministic** - HKDF(vault_key, sorted([uuid1, uuid2]))
- **Salt is per-deployment** - stored in .env, never regenerate without accepting data loss
- **IndexedDB stores encrypted data** - clearing browser data loses local cache (not server data)

### Security & Defense
- **PANIC_MODE=true** wipes DB on ANY auth failure - use carefully
- **IP blocking is in-memory** - restarts clear temporary blocks
- **JWT tokens have no refresh** - 24h hard expiry
- **CORS is restrictive** - only frontend origin allowed

**Full gotchas:** [.claude/context/KNOWN_GOTCHAS.md](./.claude/context/KNOWN_GOTCHAS.md)

---

## Documentation System

**Navigation:** 3-level chain (CLAUDE.md → Category → Domain → Detail)
**Self-maintaining:** CODE_TO_WORKFLOW_MAP.md guides updates after code changes
**Validation:** Run /verify-docs-current [file_path] after modifications
**RPI Workflow:** /rpi-research → /rpi-plan → /rpi-implement

**See:** [.claude/RPI_WORKFLOW_PLAN.md](./.claude/RPI_WORKFLOW_PLAN.md), [.claude/README.md](./.claude/README.md)

---

## Production

**Platform:** Docker Compose (self-hosted)
**Services:** PostgreSQL, FastAPI (Uvicorn), React (Nginx static), Nginx (reverse proxy)
**Monitoring:** `docker-compose logs -f`, `docker-compose ps`, `/health` endpoint

---

## Key Constraints

**Migrations:** Schema auto-applied on startup; for changes, update `schema.sql` and redeploy
**Testing:** Test infrastructure not yet implemented; validate with `npm run build` and manual testing
**Security:** All encryption client-side only; server NEVER decrypts; 12-word passphrase is single point of trust

---

## Maintenance

**After changes:** Check CODE_TO_WORKFLOW_MAP.md → Update workflows → Run /verify-docs-current
**Docs hub:** [.claude/README.md](./.claude/README.md)
**RPI:** [.claude/RPI_WORKFLOW_PLAN.md](./.claude/RPI_WORKFLOW_PLAN.md)

---

## Contact

Self-hosted deployment - no external support

---

**Version:** 1.0 | **Last Updated:** 2026-01-18 | **Context Target:** 200k
**Architecture:** 3-Level Chain-of-Index | **Index Files:** 10
