# Workflow Index - HUSH

**Purpose:** Master catalog of all documented workflows
**Load First:** Always load this file before debugging/implementing
**Size:** ~15k tokens (7.5% of 200k context budget)
**Last Updated:** 2026-01-18

---

## Quick Navigation

| # | Workflow | Complexity | Entry Point | Use When |
|---|----------|------------|-------------|----------|
| 1 | [Authentication](./workflows/authentication.md) | MEDIUM | `backend/app/routers/auth.py:21` | Login, auth issues, JWT problems |
| 2 | [Vault Key Derivation](./workflows/vault_key_derivation.md) | HIGH | `frontend/src/crypto/kdf.ts:15` | Key derivation, Argon2 issues |
| 3 | [Thread Encryption](./workflows/thread_encryption.md) | HIGH | `frontend/src/crypto/thread-key.ts:8` | Thread key issues, message encryption |
| 4 | [Message Flow](./workflows/message_flow.md) | HIGH | `frontend/src/services/api.ts:45` | Sending/receiving messages |
| 5 | [Identity Setup](./workflows/identity_setup.md) | MEDIUM | `frontend/src/components/IdentitySetup.tsx:15` | UUID creation, identity issues |
| 6 | [Real-time Communication](./workflows/realtime_communication.md) | HIGH | `frontend/src/services/websocket.ts:12` | WebSocket, live updates |
| 7 | [Defense System](./workflows/defense_system.md) | HIGH | `backend/app/services/defense.py:18` | IP blocking, rate limiting, panic mode |
| 8 | [Deployment](./workflows/deployment.md) | MEDIUM | `cli/main.py:25` | Deploying, CLI issues |
| 9 | [PWA Lifecycle](./workflows/pwa_lifecycle.md) | MEDIUM | `frontend/src/main.tsx:8` | Offline mode, install prompts |
| 10 | [Client Storage](./workflows/client_storage.md) | MEDIUM | `frontend/src/services/storage.ts:10` | IndexedDB, local data |

---

## Workflow Categories

### Category 1: Security & Cryptography

**Workflows:** 4
**Total Lines:** ~600 lines
**Primary Agent:** `core-architect`

| Workflow | Lines | Purpose |
|----------|-------|---------|
| [authentication.md](./workflows/authentication.md) | ~100 | 12-word passphrase validation, JWT issuance |
| [vault_key_derivation.md](./workflows/vault_key_derivation.md) | ~150 | Argon2id key derivation from passphrase |
| [thread_encryption.md](./workflows/thread_encryption.md) | ~200 | HKDF thread keys, AES-256-GCM encryption |
| [defense_system.md](./workflows/defense_system.md) | ~150 | IP blocking, rate limiting, panic mode |

**Use This Category For:**
- Authentication failures or issues
- Encryption/decryption problems
- Key derivation changes
- Security policy modifications

---

### Category 2: Messaging & Communication

**Workflows:** 2
**Total Lines:** ~300 lines
**Primary Agent:** `integration-hub`

| Workflow | Lines | Purpose |
|----------|-------|---------|
| [message_flow.md](./workflows/message_flow.md) | ~200 | Send/receive encrypted messages via API |
| [realtime_communication.md](./workflows/realtime_communication.md) | ~100 | WebSocket connections and relay |

**Use This Category For:**
- Message sending/receiving issues
- Real-time update problems
- WebSocket connection issues
- Thread CRUD operations

---

### Category 3: User Experience & Frontend

**Workflows:** 3
**Total Lines:** ~250 lines
**Primary Agent:** `api-developer`

| Workflow | Lines | Purpose |
|----------|-------|---------|
| [identity_setup.md](./workflows/identity_setup.md) | ~100 | UUID generation, display name setup |
| [pwa_lifecycle.md](./workflows/pwa_lifecycle.md) | ~80 | Service worker, offline, install prompts |
| [client_storage.md](./workflows/client_storage.md) | ~70 | IndexedDB encrypted storage |

**Use This Category For:**
- Identity/UUID issues
- PWA installation problems
- Offline mode issues
- Local storage problems

---

### Category 4: Infrastructure & Deployment

**Workflows:** 1
**Total Lines:** ~150 lines
**Primary Agent:** `deployment-ops`

| Workflow | Lines | Purpose |
|----------|-------|---------|
| [deployment.md](./workflows/deployment.md) | ~150 | CLI deployment, Docker orchestration |

**Use This Category For:**
- Deployment issues
- Docker problems
- Configuration management
- Secret generation

---

## Cross-Reference Tables

### Crypto Libraries × Workflows

| Library | Used By Workflows |
|---------|-------------------|
| `argon2-browser` | vault_key_derivation |
| Web Crypto API (HKDF) | thread_encryption |
| Web Crypto API (AES-GCM) | thread_encryption, message_flow |
| `idb` (IndexedDB) | client_storage, identity_setup |

### Database Tables × Workflows

| Table | Used By Workflows |
|-------|-------------------|
| `threads` | message_flow, thread_encryption |
| `messages` | message_flow, realtime_communication |
| `blocked_ips` | defense_system, authentication |
| `auth_failures` | defense_system, authentication |

### Test Files × Workflows

| Test File | Covers Workflows |
|-----------|------------------|
| (No tests yet) | - |

---

## Issue Triage Quick Reference

| Symptom | Check Workflow | Key File:Line |
|---------|---------------|---------------|
| "Invalid passphrase" error | authentication | `backend/app/routers/auth.py:35` |
| Messages not decrypting | thread_encryption | `frontend/src/crypto/aes.ts:25` |
| WebSocket disconnects | realtime_communication | `frontend/src/services/websocket.ts:45` |
| IP blocked unexpectedly | defense_system | `backend/app/services/defense.py:55` |
| PWA not installing | pwa_lifecycle | `frontend/vite.config.ts:15` |
| Local data lost | client_storage | `frontend/src/services/storage.ts:30` |
| Deployment fails | deployment | `cli/main.py:80` |
| UUID not generated | identity_setup | `frontend/src/components/IdentitySetup.tsx:40` |
| Slow key derivation | vault_key_derivation | `frontend/src/crypto/kdf.ts:20` |
| Message not sending | message_flow | `frontend/src/services/api.ts:65` |

---

## Context Engineering Usage

### Loading Strategy

```
Step 1: Load this file (~15k tokens)
Step 2: Identify relevant workflow(s)
Step 3: Load specific workflow file (~10-20k tokens each)
Step 4: Read specific code sections as needed

Total: ~30-50k tokens (15-25% of budget)
```

### When to Load Full Workflow

- **Debugging:** Load the affected workflow immediately
- **Feature:** Load 2-3 related workflows
- **Refactoring:** Load primary + dependent workflows

### When NOT to Load Full Workflow

- **Simple fix:** Use this index + grep
- **Configuration change:** Direct file edit
- **Documentation update:** Direct doc edit

---

## Maintenance Schedule

| Task | Frequency |
|------|-----------|
| Spot-check 5 line numbers | Monthly |
| Re-run discovery agents | Quarterly |
| Full documentation audit | Annually |

**Last Verification:** 2026-01-18
**Next Verification:** 2026-02-18

---

## See Also

- **Detailed workflows:** [./workflows/](./workflows/)
- **Code organization:** [../indexes/code/CATEGORY_INDEX.md](../indexes/code/CATEGORY_INDEX.md)
- **Agent selection:** [../indexes/agents/CATEGORY_INDEX.md](../indexes/agents/CATEGORY_INDEX.md)
- **Reverse lookup:** [./CODE_TO_WORKFLOW_MAP.md](./CODE_TO_WORKFLOW_MAP.md)

---

**Version:** 1.0
**Total Workflows:** 10
