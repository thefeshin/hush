# HUSH System Design

> Comprehensive Build & Deployment Architecture
>
> Single-vault, shared-secret, UUID-gated private chat

---

## Phase 1: Core Invariants (Non-negotiable Rules)

These rules define the system. Everything else conforms to them.

### Vault Properties

- **Exactly one vault**
- **Exactly one shared secret** (12 words)

### User Capabilities

Anyone with the 12 words:
- Can unlock the vault
- Can create their identity (UUID + display name)
- Can send messages ONLY to users whose UUID they possess
- Cannot see other registered users
- Cannot discover who else has access to the vault

### Message Properties

Messages are:
- Encrypted client-side
- Stored encrypted
- Never decrypted on the server

### Server Knowledge

Server does NOT know:
- Message content
- Thread titles
- Identities
- User lists or directories

### System Model

- Multiple users
- Private peer-to-peer chats (UUID-gated)
- No accounts
- No email
- No password resets
- No user discovery (UUIDs must be exchanged out-of-band)
- **Losing the 12 words = permanent data loss**
- Deployment via one command: `./hush deploy`

This is a sealed shared vault with private, UUID-gated conversations.

---

## Phase 2: Technology Stack (Locked)

Do not deviate from this unless accepting architectural changes.

### Frontend
- React SPA (Vite)
- PWA enabled
- Web Crypto API
- Argon2 via WASM

### Backend
- FastAPI
- JWT for session gating only
- WebSockets for real-time

### Database
- PostgreSQL
- Stores only encrypted blobs + UUIDs

### Edge
- Nginx
- TLS termination

### Deployment
- Docker
- Docker Compose
- CLI: `hush` (bash or python)

---

## Phase 3: One-Command Deployment Contract

There is exactly one entrypoint: `./hush deploy`

This command must:
1. Ask interactive security questions
2. Generate secrets
3. Write configuration
4. Build containers
5. Run containers
6. Print secrets once
7. Never store plaintext secrets

No flags. No env juggling. No second command.

---

## Phase 4: Interactive Deployment Prompts

When `./hush deploy` is run, the script blocks and asks:

### Prompt 1: Max Failed Unlock Attempts
```
[HUSH] Max failed unlock attempts before action? (default: 5)
```
Stored as: `MAX_AUTH_FAILURES`

### Prompt 2: Failure Action
```
[HUSH] Action after threshold exceeded:
1. Temporary IP block
2. Permanent IP block
3. Wipe database
4. Wipe database + shutdown
```
Stored as: `FAILURE_MODE=ip_temp | ip_perm | db_wipe | db_wipe_shutdown`

### Prompt 3: IP Block Duration (Conditional)
Only if `ip_temp` selected:
```
[HUSH] IP block duration (minutes)? (default: 60)
```
Stored as: `IP_BLOCK_MINUTES`

### Prompt 4: Panic Mode
```
[HUSH] Enable PANIC MODE?
(Any auth failure wipes DB + shuts down) [y/N]
```
Stored as: `PANIC_MODE=true|false`

### Prompt 5: Vault Persistence
```
[HUSH] Should this vault survive redeployments?
1. No - regenerate secrets every deploy
2. Yes - reuse secrets if present
```
Stored as: `PERSIST_VAULT=true|false`

These decisions are irrevocable for that deployment.

---

## Phase 5: Deployment-Time Secret Generation

Only after prompts are completed:

### Generate
- 12 random words (fixed wordlist, order matters)
- KDF salt (16-32 random bytes, base64)
- Auth hash = SHA-256(normalized words)

### Print ONCE to stdout
```
================ HUSH VAULT INITIALIZED ================
LOGIN WORDS (SAVE - NOT RECOVERABLE):

orbit velvet maple canyon lunar fossil anchor drift echo copper tide whisper

KDF SALT:
p9R0ZP0K2vK3+eTtK7X1NQ==

FAILURE POLICY:
- Max failures: 5
- Mode: db_wipe_shutdown
- Panic mode: false
```

### Write .env
```
AUTH_HASH=...
KDF_SALT=...
MAX_AUTH_FAILURES=5
FAILURE_MODE=db_wipe_shutdown
PANIC_MODE=false
PERSIST_VAULT=false
```

**Plaintext words are never written to disk. Ever.**

---

## Phase 6: Vault Key Derivation (Hierarchical Key Model)

There is one master vault key, with per-thread keys derived from it.

### Key Location
- Browser (authoritative)
- Server NEVER derives any keys

### Key Hierarchy
```
Vault key (master) -> derived from 12 words
    |
    +-> Thread keys -> derived from vault key + participant UUIDs
```

### Master Vault Key Derivation

1. Normalize 12 words:
   - lowercase
   - trimmed
   - single spaces

2. Argon2id KDF with fixed parameters:
   - memory: 64 MB
   - iterations: 3
   - parallelism: 2
   - output: 32 bytes

Result: 256-bit vault key

### Thread Key Derivation

For each private chat between two users:
```javascript
participant_ids = sort([uuid_a, uuid_b])  // alphabetical
thread_salt = SHA-256(participant_ids.join(":"))
thread_key = HKDF-SHA256(vault_key, thread_salt, info="hush-thread", 32 bytes)
```

Result: 256-bit thread key unique to that user pair

### Key Usage

**Vault key used for:**
- Local identity encryption
- Deriving thread keys

**Thread keys used for:**
- Message encryption within that thread
- Thread metadata encryption

### Security Properties
- Knowing vault key + one UUID -> cannot decrypt threads without the other UUID
- Each thread is cryptographically isolated
- Compromising one thread key does not compromise others

---

## Phase 7: Authentication (Knowledge Gate Only)

Authentication does not give access to plaintext. It only allows socket access.

### /auth Flow

1. Client submits 12 words
2. Server:
   - Normalizes
   - SHA-256 hashes
   - Compares with `AUTH_HASH`
3. If valid: Issues short-lived JWT
4. If invalid: Increments failure counter, triggers policy if threshold exceeded

### JWT Semantics
- JWT means: "This client may talk to the vault."
- JWT does NOT mean: "This client can decrypt anything."

---

## Phase 8: Client-Side Identity

Identity exists only after vault unlock and is client-owned.

### Identity Creation
After successful /auth:
- Client generates: `user_id` (UUID v4)
- User enters: `display_name` (string)
- No server validation. No uniqueness enforcement.

### Identity Properties
- Not trusted
- Not authoritative
- Can be duplicated or impersonated
- Treated as descriptive metadata only

This is intentional and consistent with a shared-secret system.

### UUID Sharing Requirement
- To chat with another user, you MUST have their UUID
- UUIDs are exchanged out-of-band (in person, secure channel, etc.)
- The server NEVER provides a list of registered users
- There is NO user directory, search, or discovery mechanism
- Your UUID is your chat address - share it only with intended contacts

### Optional Persistence
To avoid losing identity on refresh:
- Identity blob encrypted with vault key
- Stored in IndexedDB
- Encrypted payload: `{ "user_id": "...", "display_name": "Alice" }`

Server never sees identity creation or storage.

### UUID Export Feature
- Client provides UI to copy/share own UUID
- Format: raw UUID or QR code for in-person exchange
- Recipient uses this UUID to initiate a chat

---

## Phase 9: Thread Model (UUID-Gated Private Chats)

Threads are private conversations between exactly two users.

### Thread Rules
- All threads belong to the same vault
- A thread is created between two specific UUIDs (initiator + recipient)
- Only the two participants can see or access their thread
- Thread visibility is enforced cryptographically
- No global thread list - users only see threads they're part of
- No ownership hierarchy - both participants have equal access

### Thread Creation (Client-Side)
To start a chat, the initiator:
1. Enters the recipient's UUID (obtained out-of-band)
2. Client derives thread key:
   ```javascript
   participant_ids = sort([my_uuid, recipient_uuid])
   thread_salt = SHA-256(participant_ids.join(":"))
   thread_key = HKDF(vault_key, thread_salt, 32 bytes)
   ```
3. Creates thread metadata:
   ```json
   {
     "participants": [my_uuid, recipient_uuid],
     "created_by": { "user_id": "...", "display_name": "Alice" },
     "created_at": timestamp
   }
   ```
4. Encrypts with thread_key (AES-256-GCM)

### Thread Identifier
```
thread_id = SHA-256(sort(uuid_a, uuid_b))
```

This ensures:
- Same thread_id for both participants
- Deterministic - no duplicate threads between same users
- Server cannot determine participants from thread_id

### Thread Storage
```sql
threads (
    id UUID PRIMARY KEY,
    ciphertext BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    created_at TIMESTAMP
)
```

Server cannot read:
- Who the participants are
- Thread metadata

### Thread Discovery
- Users query threads by computing thread_id for each known contact UUID
- No server-side filtering by participant
- Client maintains local list of known contact UUIDs

---

## Phase 10: Message Encryption & Persistence

All message crypto is client-side.

### Message Send Flow
1. Client builds plaintext:
   ```json
   {
     "sender_id": "...",
     "sender_name": "Alice",
     "content": "hello",
     "timestamp": 1234567890
   }
   ```
2. Encrypt using:
   - AES-256-GCM
   - Thread key (NOT vault key)
   - Random 12-byte IV
3. Send to backend:
   ```json
   {
     "thread_id": "...",
     "ciphertext": "...",
     "iv": "..."
   }
   ```

### Message Storage
```sql
messages (
    id UUID PRIMARY KEY,
    thread_id UUID NOT NULL,
    ciphertext BYTEA NOT NULL,
    iv BYTEA NOT NULL,
    created_at TIMESTAMP
)
```

Server stores and relays blindly.

### Message Receive Flow
1. Client receives encrypted payload
2. Attempts decryption
3. If success -> render
4. If failure -> ignore or mark unreadable

This prevents decryption-oracle leaks.

---

## Phase 11: Real-Time Communication (WebSocket Relay)

Backend acts as stateless relay.

### WebSocket Rules
- JWT required to connect
- One global connection pool
- Messages broadcast by thread_id
- Backend does NOT inspect payloads

### Server Responsibilities
- Accept / reject socket
- Persist encrypted blobs
- Broadcast encrypted blobs
- Enforce auth failure policy
- No crypto. No identity checks.

---

## Phase 12: Progressive Web App (Offline-First)

Frontend is a PWA, not a toy SPA.

### PWA Behavior
- Installable
- Offline read support
- Online-only write support

### Offline Handling
Cached:
- App shell
- Encrypted thread list
- Encrypted messages
- Decryption still happens client-side
- If vault key unavailable -> nothing readable

### Storage Rules
- No plaintext stored unencrypted
- IndexedDB only
- Vault key never persisted

---

## Phase 13: Defense System

This phase enforces deployment-time policy.

### Auth Failure Tracking
- Count failures per IP
- Reset on success
- Stored in-memory + optional persistence

### Failure Actions

| Mode | Action |
|------|--------|
| `ip_temp` | Block IP for `IP_BLOCK_MINUTES`, auto-unblock |
| `ip_perm` | Persistently deny IP |
| `db_wipe` | Drop all tables, recreate schema, continue running |
| `db_wipe_shutdown` | Drop all tables, exit process immediately |

### PANIC MODE
If `PANIC_MODE=true`:
- Any auth failure triggers DB wipe + immediate shutdown
- No thresholds

### Dead-Man Behavior (Optional Extension)
- No successful unlock for N days: Auto-wipe DB

---

## Phase 14: Docker, TLS, Lifecycle & Redeploy

### TLS
- IP-based HTTPS
- mkcert or self-signed
- Nginx terminates TLS
- WebSocket over WSS only

### Docker Compose Services
- postgres
- backend
- nginx

### Volumes
- DB volume
- Optional .env persistence

### Redeploy Behavior

**If PERSIST_VAULT=false:**
- New secrets generated
- Old DB unreadable
- Clean vault

**If PERSIST_VAULT=true:**
- Existing .env detected
- Explicit confirmation required
- No silent reuse

---

## Final Invariants (Reasserted)

1. One command
2. One vault
3. One secret (12 words)
4. Multiple users (hidden from each other)
5. Private UUID-gated threads
6. UUID required to initiate chat - no user discovery
7. Hierarchical key model (vault key -> thread keys)
8. Client-side encryption
9. Zero server knowledge
10. Self-destruct capable
