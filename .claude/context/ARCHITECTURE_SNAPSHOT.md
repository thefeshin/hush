# Architecture Snapshot - HUSH

**Purpose:** High-level system map for rapid orientation
**Load:** When starting a new session or onboarding
**Size:** ~10k tokens (5% of 200k budget)
**Last Updated:** 2026-01-18

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HUSH ARCHITECTURE                               │
│                     Zero-Knowledge Encrypted Chat Vault                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────┐ │
│  │         BROWSER CLIENT          │    │           SERVER SIDE           │ │
│  │   (All crypto happens here)     │    │    (Zero-knowledge relay)       │ │
│  │                                 │    │                                 │ │
│  │  ┌─────────────────────────┐   │    │  ┌─────────────────────────┐   │ │
│  │  │    12-Word Passphrase   │   │    │  │   Nginx (TLS + Proxy)   │   │ │
│  │  └───────────┬─────────────┘   │    │  └───────────┬─────────────┘   │ │
│  │              ▼                 │    │              ▼                 │ │
│  │  ┌─────────────────────────┐   │    │  ┌─────────────────────────┐   │ │
│  │  │  Argon2id Key Derivation│   │    │  │    FastAPI Backend      │   │ │
│  │  │  (64MB, 3 iter, 2 par)  │   │    │  │    - Auth (hash check)  │   │ │
│  │  └───────────┬─────────────┘   │    │  │    - Threads CRUD       │   │ │
│  │              ▼                 │    │  │    - Messages store     │   │ │
│  │  ┌─────────────────────────┐   │    │  │    - WebSocket relay    │   │ │
│  │  │    256-bit Vault Key    │   │    │  │    - Defense service    │   │ │
│  │  └───────────┬─────────────┘   │    │  └───────────┬─────────────┘   │ │
│  │              ▼                 │    │              ▼                 │ │
│  │  ┌─────────────────────────┐   │    │  ┌─────────────────────────┐   │ │
│  │  │   HKDF Thread Keys      │   │    │  │    PostgreSQL 16        │   │ │
│  │  │   (sorted UUID pair)    │   │    │  │    - threads (blobs)    │   │ │
│  │  └───────────┬─────────────┘   │    │  │    - messages (blobs)   │   │ │
│  │              ▼                 │    │  │    - blocked_ips        │   │ │
│  │  ┌─────────────────────────┐   │    │  │    - auth_failures      │   │ │
│  │  │   AES-256-GCM Encrypt   │───┼────▶│  └─────────────────────────┘   │ │
│  │  └───────────┬─────────────┘   │    │                                 │ │
│  │              ▼                 │    │                                 │ │
│  │  ┌─────────────────────────┐   │    │                                 │ │
│  │  │   IndexedDB + PWA       │   │    │                                 │ │
│  │  │   (local encrypted)     │   │    │                                 │ │
│  │  └─────────────────────────┘   │    │                                 │ │
│  └─────────────────────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript + Vite | SPA with PWA support, client-side crypto |
| **Backend** | FastAPI 0.109 + Python 3.12 | Zero-knowledge API, WebSocket relay |
| **Database** | PostgreSQL 16 (Alpine) | Encrypted blob storage, defense tracking |
| **Proxy** | Nginx (Alpine) | TLS termination, routing, security headers |
| **Orchestration** | Docker Compose 3.8 | Container management, deployment |
| **CLI** | Python 3 script (`./hush`) | One-command deployment |

---

## Core Components

### Component 1: Client-Side Crypto Engine

**Purpose:** All encryption/decryption happens in browser - server never sees plaintext
**Key Files:**
- `frontend/src/crypto/kdf.ts` - Argon2id vault key derivation (64MB, 3 iter, 2 parallel)
- `frontend/src/crypto/thread-key.ts` - HKDF thread key derivation from sorted UUID pair
- `frontend/src/crypto/aes.ts` - AES-256-GCM encrypt/decrypt with random IV
- `frontend/src/crypto/identity-key.ts` - Identity encryption for IndexedDB storage
- `frontend/src/crypto/normalize.ts` - Word normalization (lowercase, trim, single spaces)
- `frontend/src/crypto/CryptoContext.tsx` - React context for crypto operations

**Related Workflows:**
- [vault_key_derivation.md](./workflows/vault_key_derivation.md)
- [thread_encryption.md](./workflows/thread_encryption.md)

---

### Component 2: Zero-Knowledge Backend

**Purpose:** Store and relay encrypted blobs without ability to decrypt
**Key Files:**
- `backend/app/main.py` - FastAPI app factory, lifespan events
- `backend/app/routers/auth.py` - SHA256 hash verification (no password stored)
- `backend/app/routers/threads.py` - CRUD for encrypted thread blobs
- `backend/app/routers/messages.py` - Store/fetch encrypted messages
- `backend/app/routers/websocket.py` - Real-time message relay by thread_id
- `backend/app/services/defense.py` - IP blocking, rate limiting, panic mode

**Related Workflows:**
- [authentication.md](./workflows/authentication.md)
- [message_flow.md](./workflows/message_flow.md)
- [defense_system.md](./workflows/defense_system.md)

---

### Component 3: React Frontend

**Purpose:** PWA-enabled chat interface with offline support
**Key Files:**
- `frontend/src/App.tsx` - Root component, auth routing
- `frontend/src/components/Login.tsx` - 12-word passphrase entry
- `frontend/src/components/Chat.tsx` - Main chat interface
- `frontend/src/components/IdentitySetup.tsx` - UUID + display name creation
- `frontend/src/stores/authStore.ts` - Zustand auth state
- `frontend/src/stores/threadStore.ts` - Thread list state
- `frontend/src/stores/messageStore.ts` - Message state by thread
- `frontend/src/services/api.ts` - Fetch API client

**Related Workflows:**
- [identity_setup.md](./workflows/identity_setup.md)
- [pwa_lifecycle.md](./workflows/pwa_lifecycle.md)

---

### Component 4: Deployment System

**Purpose:** One-command deployment with security prompts
**Key Files:**
- `hush` - CLI entry point (Python 3)
- `cli/main.py` - Deploy orchestration
- `cli/prompts.py` - Interactive security questions
- `cli/secrets.py` - 12-word generation, JWT secret, salt
- `cli/config.py` - .env file management
- `docker-compose.yml` - 4-service orchestration

**Related Workflows:**
- [deployment.md](./workflows/deployment.md)

---

## Data Flow

```
USER INPUT                    CLIENT PROCESSING                    SERVER STORAGE
─────────────────────────────────────────────────────────────────────────────────

12 words ──────────────────▶ normalize(words)
                             ─────────────────▶ SHA256(normalized)
                                               ─────────────────▶ Compare vs AUTH_HASH
                                                                  ─────────────────▶ JWT token
                             ◀────────────────────────────────────────────────────

                             Argon2id(normalized, salt)
                             ─────────────────▶ 256-bit Vault Key
                                               (stored in memory only)

Message text ─────────────▶ Get peer UUID
                            Sort [my_uuid, peer_uuid]
                            HKDF(vault_key, sorted_uuids)
                            ─────────────────▶ Thread Key
                                              AES-256-GCM(message, thread_key)
                                              ─────────────────▶ ciphertext + IV
                                                                ─────────────────▶ Store in DB
                                                                                   (encrypted blob)

WebSocket ◀────────────────────────────────────────────────────────────────────── Relay by thread_id
           AES-256-GCM decrypt
           ─────────────────▶ Plaintext message
```

---

## Database Schema Summary

**Total Tables:** 4

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `threads` | Encrypted thread metadata | Contains thread UUID, ciphertext, IV |
| `messages` | Encrypted message content | FK to threads via thread_id |
| `blocked_ips` | Defense - blocked IP addresses | Standalone, expires_at for temp blocks |
| `auth_failures` | Defense - failure tracking | Counts per IP for policy enforcement |

**Schema Details:** `backend/app/models/schema.sql`

**Important:** NO users table - zero-knowledge design means server cannot identify users

---

## External Integrations

| Integration | Type | Purpose | Docs |
|-------------|------|---------|------|
| Web Crypto API | Browser API | AES-256-GCM, HKDF | MDN Web Docs |
| Argon2-browser | WASM library | Argon2id key derivation | npm package |
| IndexedDB (idb) | Browser storage | Local encrypted cache | MDN Web Docs |

**Note:** No external APIs by design - all processing is local or self-hosted

---

## Key Architectural Decisions

### Decision 1: Zero-Knowledge Architecture

**Choice:** Server stores only encrypted blobs, never plaintext or keys
**Why:** Maximum privacy - even server compromise reveals nothing
**Trade-offs:** Lost passphrase = permanent data loss, no recovery possible

---

### Decision 2: Single Shared Secret

**Choice:** One 12-word passphrase for entire vault, no per-user accounts
**Why:** Simplifies architecture, eliminates user management complexity
**Trade-offs:** All users share access, cannot revoke individual access

---

### Decision 3: Deterministic Thread Keys

**Choice:** HKDF(vault_key, sorted([uuid1, uuid2])) for thread encryption
**Why:** Both parties derive same key independently, no key exchange needed
**Trade-offs:** Changing a UUID invalidates all associated threads

---

### Decision 4: Client-Side Encryption Only

**Choice:** All crypto operations in browser using Web Crypto API
**Why:** Server cannot be a point of compromise for data
**Trade-offs:** Requires modern browser, no server-side search/indexing

---

## Directory Structure

```
hush/
├── backend/                # Python FastAPI backend
│   ├── Dockerfile          # Multi-stage Python build
│   ├── requirements.txt    # Python dependencies
│   └── app/
│       ├── main.py         # App factory, lifespan
│       ├── config.py       # Pydantic settings
│       ├── database.py     # PostgreSQL connection
│       ├── routers/        # API endpoints (auth, threads, messages, ws)
│       ├── schemas/        # Pydantic models
│       ├── services/       # Business logic (defense, websocket)
│       ├── middleware/     # Security, rate limiting
│       └── models/         # schema.sql
├── frontend/               # React TypeScript SPA
│   ├── Dockerfile          # Node build + Nginx serve
│   ├── package.json        # npm dependencies
│   ├── vite.config.ts      # Vite + PWA config
│   └── src/
│       ├── components/     # React components
│       ├── crypto/         # Client-side encryption
│       ├── stores/         # Zustand state
│       ├── services/       # API client, websocket
│       └── hooks/          # Custom React hooks
├── cli/                    # Deployment CLI
│   ├── main.py             # Deploy orchestration
│   ├── prompts.py          # Security questions
│   └── secrets.py          # Secret generation
├── nginx/                  # Reverse proxy config
│   └── nginx.conf          # TLS, routing rules
├── docker-compose.yml      # Container orchestration
├── hush                    # CLI entry point
└── .claude/                # Context engineering
```

---

## Security Model

### Authentication
- 12-word passphrase hashed with SHA256 (normalized first)
- Server stores only the hash (AUTH_HASH in .env)
- JWT token issued on successful auth (24h expiry)
- No password reset - lost passphrase = lost data

### Authorization
- JWT required for all /api/* endpoints
- All authenticated users have equal access (no roles)
- Thread access controlled by knowing both UUIDs

### Data Protection
- AES-256-GCM for all message content
- Unique IV per encryption operation
- Vault key never leaves client memory
- IndexedDB stores only encrypted data

### Defense System
- Per-IP rate limiting
- Auth failure tracking with configurable policy
- IP blocking (temporary with expiry, or permanent)
- Database wipe on policy breach (optional)
- PANIC_MODE: immediate DB wipe on any auth failure

---

## Performance Characteristics

| Metric | Target | Current |
|--------|--------|---------|
| API Response Time | <100ms | TBD (initial development) |
| WebSocket Latency | <50ms | TBD |
| Argon2 Key Derivation | 1-3 seconds | ~2s on modern hardware |
| Message Encrypt/Decrypt | <10ms | <5ms (Web Crypto) |

---

## Deployment Architecture

```
                    Internet
                        │
                        ▼
        ┌───────────────────────────────┐
        │        Nginx Container         │
        │   (TLS termination, routing)   │
        │   Port 443 (HTTPS)             │
        │   Port 80 (redirect to 443)    │
        └───────────────┬───────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────────┐         ┌───────────────────┐
│  Frontend (Nginx) │         │  Backend (Uvicorn)│
│  Static files     │         │  Port 8000        │
│  /                │         │  /api/*, /ws      │
└───────────────────┘         └─────────┬─────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │  PostgreSQL 16    │
                              │  Port 5432        │
                              │  hush database    │
                              └───────────────────┘
```

**Environments:**
| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | http://localhost:5173 | Vite dev server with HMR |
| Production | https://localhost | Docker Compose deployment |

---

## See Also

- **Detailed workflows:** [WORKFLOW_INDEX.md](./WORKFLOW_INDEX.md)
- **Code mapping:** [CODE_TO_WORKFLOW_MAP.md](./CODE_TO_WORKFLOW_MAP.md)
- **Lessons learned:** [KNOWN_GOTCHAS.md](./KNOWN_GOTCHAS.md)

---

**Version:** 1.0
**Verified Against Commit:** 3bc28f6 (Initialize project)
