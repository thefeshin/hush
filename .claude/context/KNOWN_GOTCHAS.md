# Known Gotchas - HUSH

**Purpose:** Documented pitfalls, edge cases, and lessons learned
**Use:** Before implementing features or debugging issues
**Last Updated:** 2026-01-18

---

## Critical Gotchas

### GOTCHA-CRYPTO-001: Passphrase Normalization is MANDATORY

**Severity:** CRITICAL
**Discovered:** 2026-01-18
**Workflow Impact:** [authentication](./workflows/authentication.md), [vault_key_derivation](./workflows/vault_key_derivation.md)

**Symptom:**
"Invalid passphrase" error even when words are correct, or vault key doesn't match.

**Root Cause:**
Passphrase must be normalized (lowercase, trimmed, single spaces) before hashing or key derivation.

**Fix:**
```typescript
// WRONG
const hash = sha256(passphrase);

// CORRECT
const normalized = normalize(passphrase);
const hash = sha256(normalized);
```

**Prevention:**
- Always call `normalize()` before any crypto operation
- Server stores hash of normalized passphrase

---

### GOTCHA-CRYPTO-002: NEVER Change Argon2 Parameters

**Severity:** CRITICAL
**Discovered:** 2026-01-18
**Workflow Impact:** [vault_key_derivation](./workflows/vault_key_derivation.md)

**Symptom:**
All data becomes unreadable after parameter change.

**Root Cause:**
Different Argon2 parameters produce different vault keys.

**Current Parameters (DO NOT CHANGE):**
```typescript
{
  type: Argon2id,
  memory: 65536,    // 64 MB
  iterations: 3,
  parallelism: 2,
  hashLen: 32
}
```

**Prevention:**
- Treat these parameters as immutable constants
- Any change requires full data migration (impossible in zero-knowledge)

---

### GOTCHA-DEPLOY-001: Salt Change = Total Data Loss

**Severity:** CRITICAL
**Discovered:** 2026-01-18
**Workflow Impact:** [deployment](./workflows/deployment.md), [vault_key_derivation](./workflows/vault_key_derivation.md)

**Symptom:**
All encrypted data becomes unreadable after redeployment.

**Root Cause:**
KDF_SALT is used in vault key derivation. Different salt = different key.

**Prevention:**
- Use `PERSIST_VAULT=true` to keep existing salt
- Never manually edit KDF_SALT in .env
- Backup .env before any changes

---

### GOTCHA-CRYPTO-003: UUID Sorting for Thread Keys

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [thread_encryption](./workflows/thread_encryption.md)

**Symptom:**
Messages don't decrypt for one party in a conversation.

**Root Cause:**
Thread key derivation must use sorted UUIDs so both parties derive the same key.

**Fix:**
```typescript
// WRONG - order matters
deriveThreadKey(vaultKey, myUuid, peerUuid);

// CORRECT - always sort
const sortedUuids = [myUuid, peerUuid].sort().join(':');
deriveThreadKey(vaultKey, sortedUuids);
```

**Prevention:**
- Always sort UUID pair before key derivation
- Both parties get identical keys

---

### GOTCHA-DEFENSE-001: PANIC_MODE Wipes EVERYTHING

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [defense_system](./workflows/defense_system.md)

**Symptom:**
Database wiped after single wrong passphrase attempt.

**Root Cause:**
PANIC_MODE=true wipes database on ANY auth failure, not just after threshold.

**Prevention:**
- Only enable for extreme security requirements
- Test thoroughly in development first
- Understand: one typo = all data gone

---

## Encryption Gotchas

### GOTCHA-CRYPTO-004: Random IV Per Message

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [thread_encryption](./workflows/thread_encryption.md), [message_flow](./workflows/message_flow.md)

**Symptom:**
Security vulnerability - potential IV reuse attack.

**Root Cause:**
AES-GCM requires unique IV per encryption operation.

**Fix:**
```typescript
// Always generate fresh IV
const iv = crypto.getRandomValues(new Uint8Array(12));
```

**Prevention:**
- Never reuse IV values
- Generate new random IV for each encrypt() call

---

### GOTCHA-CRYPTO-005: Vault Key Lives in Memory Only

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [vault_key_derivation](./workflows/vault_key_derivation.md)

**Symptom:**
Key persisted to storage, creating security vulnerability.

**Root Cause:**
Vault key should only exist in React state/context, never persisted.

**Prevention:**
- Never store vault key in localStorage, IndexedDB, or cookies
- Derive fresh on each session
- Key disappears on logout/page close

---

## WebSocket Gotchas

### GOTCHA-WS-001: JWT Required for WebSocket

**Severity:** MEDIUM
**Discovered:** 2026-01-18
**Workflow Impact:** [realtime_communication](./workflows/realtime_communication.md)

**Symptom:**
WebSocket connection rejected with 1008 Policy Violation.

**Root Cause:**
WebSocket doesn't support Authorization header; token must be in query string.

**Fix:**
```typescript
new WebSocket(`wss://host/ws?token=${jwt}`);
```

**Prevention:**
- Always pass JWT in query string for WebSocket
- Validate token server-side before accepting connection

---

### GOTCHA-WS-002: Thread Subscription Required

**Severity:** MEDIUM
**Discovered:** 2026-01-18
**Workflow Impact:** [realtime_communication](./workflows/realtime_communication.md)

**Symptom:**
No messages received even though WebSocket is connected.

**Root Cause:**
Must explicitly subscribe to thread to receive its messages.

**Fix:**
```typescript
websocket.subscribe(threadId);
```

**Prevention:**
- Subscribe when opening a thread
- Unsubscribe when leaving

---

## Defense Gotchas

### GOTCHA-DEFENSE-002: Constant-Time Comparison Required

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [authentication](./workflows/authentication.md)

**Symptom:**
Potential timing attack vulnerability.

**Root Cause:**
Standard string comparison leaks timing information.

**Fix:**
```python
# WRONG
if hash == stored_hash:

# CORRECT
import hmac
if hmac.compare_digest(hash, stored_hash):
```

**Prevention:**
- Always use constant-time comparison for secrets
- Use `hmac.compare_digest()` in Python

---

## PWA Gotchas

### GOTCHA-PWA-001: Service Worker HTTPS Only

**Severity:** LOW
**Discovered:** 2026-01-18
**Workflow Impact:** [pwa_lifecycle](./workflows/pwa_lifecycle.md)

**Symptom:**
Service worker doesn't register in production.

**Root Cause:**
Service workers require secure context (HTTPS or localhost).

**Prevention:**
- Always use HTTPS in production
- Development works on localhost

---

### GOTCHA-PWA-002: IndexedDB Private Browsing Limits

**Severity:** MEDIUM
**Discovered:** 2026-01-18
**Workflow Impact:** [client_storage](./workflows/client_storage.md)

**Symptom:**
Storage operations fail silently in private/incognito mode.

**Root Cause:**
Some browsers limit or disable IndexedDB in private browsing.

**Prevention:**
- Detect storage availability on init
- Inform user of limitations

---

## Deployment Gotchas

### GOTCHA-DEPLOY-002: 12 Words Shown Once Only

**Severity:** CRITICAL
**Discovered:** 2026-01-18
**Workflow Impact:** [deployment](./workflows/deployment.md)

**Symptom:**
Lost access to vault after deployment.

**Root Cause:**
12-word passphrase is displayed once during `./hush deploy` and never stored.

**Prevention:**
- Screenshot or write down immediately during deploy
- No recovery possible if lost

---

### GOTCHA-DEPLOY-003: .env File Permissions

**Severity:** HIGH
**Discovered:** 2026-01-18
**Workflow Impact:** [deployment](./workflows/deployment.md)

**Symptom:**
Secrets exposed to other users on system.

**Root Cause:**
.env contains AUTH_HASH, JWT_SECRET, and other secrets.

**Fix:**
```bash
chmod 600 .env
```

**Prevention:**
- CLI sets 600 permissions automatically
- Verify permissions if manually editing

---

## Architecture Gotchas

### GOTCHA-ARCH-001: No Users Table

**Severity:** INFO
**Discovered:** 2026-01-18
**Workflow Impact:** ALL

**Symptom:**
Cannot query users, reset passwords, or manage access.

**Root Cause:**
Intentional design - zero-knowledge means server cannot identify users.

**Implications:**
- Cannot enumerate users
- Cannot reset passwords
- Cannot revoke individual access
- All vault users share same access level

---

### GOTCHA-ARCH-002: Schema Applied on Startup

**Severity:** MEDIUM
**Discovered:** 2026-01-18
**Workflow Impact:** [deployment](./workflows/deployment.md)

**Symptom:**
Schema changes not applied.

**Root Cause:**
Schema is applied when backend container starts, not via migrations.

**Fix:**
```bash
docker-compose restart backend
```

**Prevention:**
- Restart backend after schema.sql changes
- Or full `docker-compose down && up`

---

## Quick Reference Table

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| CRYPTO-001 | Passphrase Normalization | CRITICAL | Encryption |
| CRYPTO-002 | Argon2 Parameters | CRITICAL | Encryption |
| DEPLOY-001 | Salt Change | CRITICAL | Deployment |
| CRYPTO-003 | UUID Sorting | HIGH | Encryption |
| DEFENSE-001 | PANIC_MODE | HIGH | Defense |
| CRYPTO-004 | Random IV | HIGH | Encryption |
| CRYPTO-005 | Vault Key Storage | HIGH | Encryption |
| WS-001 | JWT for WebSocket | MEDIUM | WebSocket |
| WS-002 | Thread Subscription | MEDIUM | WebSocket |
| DEFENSE-002 | Constant-Time Compare | HIGH | Defense |
| PWA-001 | HTTPS Required | LOW | PWA |
| PWA-002 | IndexedDB Limits | MEDIUM | PWA |
| DEPLOY-002 | 12 Words Once | CRITICAL | Deployment |
| DEPLOY-003 | .env Permissions | HIGH | Deployment |
| ARCH-001 | No Users Table | INFO | Architecture |
| ARCH-002 | Schema Startup | MEDIUM | Architecture |

---

## Statistics

- **Total Active Gotchas:** 16
- **Critical:** 4
- **High:** 6
- **Medium:** 4
- **Low:** 1
- **Info:** 1
- **Last Added:** 2026-01-18

---

**Version:** 1.0
