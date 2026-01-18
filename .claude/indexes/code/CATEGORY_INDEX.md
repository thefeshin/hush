# Code Category Index - HUSH

## Purpose
Entry point for code organization and domain × layer overview

## Domains & Layers Available

| Domain | Location | Description | When to Use |
|--------|----------|-------------|-------------|
| **Backend API** | `backend/app/routers/` | FastAPI endpoints | When implementing or debugging API endpoints |
| **Backend Services** | `backend/app/services/` | Business logic | When working with defense, WebSocket, or core logic |
| **Backend Config** | `backend/app/` | App setup, config | When configuring app settings |
| **Frontend Crypto** | `frontend/src/crypto/` | Client-side encryption | When working with encryption (CRITICAL - handle carefully) |
| **Frontend Components** | `frontend/src/components/` | React UI components | When building or modifying UI |
| **Frontend Services** | `frontend/src/services/` | API client, WebSocket | When working with backend communication |
| **Frontend Stores** | `frontend/src/stores/` | Zustand state | When managing application state |
| **CLI** | `cli/` | Deployment CLI | When modifying deployment process |
| **Infrastructure** | Root level | Docker, Nginx | When working with containers or proxy |

## Key File Quick Reference

### Backend (Python/FastAPI)
| File | Purpose | Related Workflows |
|------|---------|-------------------|
| `backend/app/routers/auth.py` | Authentication endpoint | authentication |
| `backend/app/routers/messages.py` | Message CRUD | message_flow |
| `backend/app/routers/websocket.py` | WebSocket relay | realtime_communication |
| `backend/app/services/defense.py` | IP blocking, panic mode | defense_system |
| `backend/app/models/schema.sql` | Database schema | ALL |

### Frontend (React/TypeScript)
| File | Purpose | Related Workflows |
|------|---------|-------------------|
| `frontend/src/crypto/kdf.ts` | Argon2id key derivation | vault_key_derivation |
| `frontend/src/crypto/aes.ts` | AES-256-GCM encryption | thread_encryption, message_flow |
| `frontend/src/crypto/thread-key.ts` | Thread key derivation | thread_encryption |
| `frontend/src/services/websocket.ts` | WebSocket client | realtime_communication |
| `frontend/src/services/storage.ts` | IndexedDB wrapper | client_storage |

### CLI (Python)
| File | Purpose | Related Workflows |
|------|---------|-------------------|
| `cli/main.py` | Deploy orchestration | deployment |
| `cli/secrets.py` | Secret generation | deployment, vault_key_derivation |

## Quick Start

1. Load this category index first (~5k tokens)
2. Identify relevant domain and layer
3. Load specific code files as needed
4. Check CODE_TO_WORKFLOW_MAP.md after changes

## Context Budget
- Category Index: ~5k tokens (2.5% of context window)
- Code Files: ~10-20k tokens (5-10% of context window)

## Getting Started

```bash
# Load category index first
Read: .claude/indexes/code/CATEGORY_INDEX.md

# Then load specific code file
Read: [code_file_path]

# After changes, check mapping
Read: .claude/context/CODE_TO_WORKFLOW_MAP.md
```

## See Also

- [CODE_TO_WORKFLOW_MAP.md](../../context/CODE_TO_WORKFLOW_MAP.md) - File → workflow reverse lookup
- [ARCHITECTURE_SNAPSHOT.md](../../context/ARCHITECTURE_SNAPSHOT.md) - System overview
