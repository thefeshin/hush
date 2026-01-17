HUSH — COMPREHENSIVE BUILD & DEPLOYMENT GUIDE

(Single-vault, shared-secret, UUID-gated private chat)

PHASE 1 — Core invariants (non-negotiable rules)

These rules define the system. Everything else conforms to them.

Exactly one vault

Exactly one shared secret (12 words)

Anyone with the 12 words:

Can unlock the vault

Can create their identity (UUID + display name)

Can send messages ONLY to users whose UUID they possess

Cannot see other registered users

Cannot discover who else has access to the vault

Messages are:

Encrypted client-side

Stored encrypted

Never decrypted on the server

Server:

Does not know message content

Does not know thread titles

Does not know identities

Does not expose user lists or directories

Multiple users

Private peer-to-peer chats (UUID-gated)

No accounts

No email

No password resets

No user discovery — UUIDs must be exchanged out-of-band

Losing the 12 words = permanent data loss

Deployment happens via one command: ./hush deploy

This is a sealed shared vault with private, UUID-gated conversations.

PHASE 2 — Technology stack (locked)

You do not deviate from this unless you accept architectural changes.

Frontend

React SPA (Vite)

PWA enabled

Web Crypto API

Argon2 via WASM

Backend

FastAPI

JWT for session gating only

WebSockets for real-time

Database

PostgreSQL

Stores only encrypted blobs + UUIDs

Edge

Nginx

TLS termination

Deployment

Docker

Docker Compose

CLI

hush (bash or python)

PHASE 3 — One-command deployment contract (./hush deploy)

There is exactly one entrypoint.

./hush deploy

This command must:

Ask interactive security questions

Generate secrets

Write configuration

Build containers

Run containers

Print secrets once

Never store plaintext secrets

No flags. No env juggling. No second command.

PHASE 4 — Interactive deployment prompts (policy locked at birth)

When ./hush deploy is run, the script must block and ask:

Prompt 1 — Max failed unlock attempts
[HUSH] Max failed unlock attempts before action? (default: 5)

Stored as:

MAX_AUTH_FAILURES

Prompt 2 — Failure action
[HUSH] Action after threshold exceeded:

1. Temporary IP block
2. Permanent IP block
3. Wipe database
4. Wipe database + shutdown

Stored as:

FAILURE_MODE=ip_temp | ip_perm | db_wipe | db_wipe_shutdown

Prompt 3 — IP block duration (conditional)

Only if ip_temp selected.

[HUSH] IP block duration (minutes)? (default: 60)

Stored as:

IP_BLOCK_MINUTES

Prompt 4 — Panic mode
[HUSH] Enable PANIC MODE?
(Any auth failure wipes DB + shuts down) [y/N]

Stored as:

PANIC_MODE=true|false

Prompt 5 — Vault persistence
[HUSH] Should this vault survive redeployments?

1. No — regenerate secrets every deploy
2. Yes — reuse secrets if present

Stored as:

PERSIST_VAULT=true|false

These decisions are irrevocable for that deployment.

PHASE 5 — Deployment-time secret generation (vault birth)

Only after prompts are completed:

Generate

12 random words (fixed wordlist, order matters)

KDF salt (16–32 random bytes, base64)

Auth hash = SHA-256(normalized words)

Print ONCE to stdout
================ HUSH VAULT INITIALIZED ================
LOGIN WORDS (SAVE — NOT RECOVERABLE):

orbit velvet maple canyon lunar fossil anchor drift echo copper tide whisper

KDF SALT:
p9R0ZP0K2vK3+eTtK7X1NQ==

FAILURE POLICY:

- Max failures: 5
- Mode: db_wipe_shutdown
- # Panic mode: false

Write .env
AUTH_HASH=...
KDF_SALT=...
MAX_AUTH_FAILURES=5
FAILURE_MODE=db_wipe_shutdown
PANIC_MODE=false
PERSIST_VAULT=false

Plaintext words are never written to disk. Ever.

PHASE 6 — Vault key derivation (hierarchical key model)

There is one master vault key, with per-thread keys derived from it.

Where

Browser (authoritative)

Server NEVER derives any keys

Key hierarchy

Vault key (master) → derived from 12 words

Thread keys → derived from vault key + participant UUIDs

Master vault key derivation

Normalize 12 words:

lowercase

trimmed

single spaces

Argon2id KDF

Parameters (fixed, global)
memory: 64 MB
iterations: 3
parallelism: 2
output: 32 bytes

Result: 256-bit vault key

Thread key derivation

For each private chat between two users:

participant_ids = sort([uuid_a, uuid_b])  // alphabetical
thread_salt = SHA-256(participant_ids.join(":"))
thread_key = HKDF-SHA256(vault_key, thread_salt, info="hush-thread", 32 bytes)

Result: 256-bit thread key unique to that user pair

Vault key used for:

Local identity encryption

Deriving thread keys

Thread keys used for:

Message encryption within that thread

Thread metadata encryption

Security properties:

Knowing vault key + one UUID → cannot decrypt threads without the other UUID

Each thread is cryptographically isolated

Compromising one thread key does not compromise others

PHASE 7 — Authentication (knowledge gate only)

Authentication does not give access to plaintext.
It only allows socket access.

/auth flow

Client submits 12 words

Server:

Normalizes

SHA-256 hashes

Compares with AUTH_HASH

If valid:

Issues short-lived JWT

If invalid:

Increments failure counter

Triggers policy if threshold exceeded

JWT means:

“This client may talk to the vault.”

It does not mean:

“This client can decrypt anything.”

PHASE 8 — Client-side identity (user name + UUID)

Identity exists only after vault unlock and is client-owned.

Identity creation

After successful /auth:

Client generates:

user_id → UUID v4

User enters:

display_name (string)

No server validation. No uniqueness enforcement.

Identity properties

Not trusted

Not authoritative

Can be duplicated or impersonated

Treated as descriptive metadata only

This is intentional and consistent with a shared-secret system.

UUID sharing requirement

To chat with another user, you MUST have their UUID

UUIDs are exchanged out-of-band (in person, secure channel, etc.)

The server NEVER provides a list of registered users

There is NO user directory, search, or discovery mechanism

Your UUID is your chat address — share it only with intended contacts

Optional persistence

To avoid losing identity on refresh:

Identity blob encrypted with vault key

Stored in IndexedDB

Encrypted payload:

{
"user_id": "...",
"display_name": "Alice"
}

Server never sees identity creation or storage.

UUID export feature

Client provides UI to copy/share own UUID

Format: raw UUID or QR code for in-person exchange

Recipient uses this UUID to initiate a chat

PHASE 9 — Thread model (UUID-gated private chats)

Threads are private conversations between exactly two users.

Thread rules

All threads belong to the same vault

A thread is created between two specific UUIDs (initiator + recipient)

Only the two participants can see or access their thread

Thread visibility is enforced cryptographically:

Thread key = HKDF(vault_key, sort(uuid_a, uuid_b))

Only users possessing both UUIDs + vault key can derive thread key

No global thread list — users only see threads they're part of

No ownership hierarchy — both participants have equal access

Thread creation (client-side)

To start a chat, the initiator:

Enters the recipient's UUID (obtained out-of-band)

Client derives thread key:

participant_ids = sort([my_uuid, recipient_uuid])
thread_salt = SHA-256(participant_ids.join(":"))
thread_key = HKDF(vault_key, thread_salt, 32 bytes)

Creates thread metadata:

{
"participants": [my_uuid, recipient_uuid],
"created_by": {
"user_id": "...",
"display_name": "Alice"
},
"created_at": timestamp
}

Encrypts with thread_key (AES-256-GCM)

Thread identifier

thread_id = SHA-256(sort(uuid_a, uuid_b))

This ensures:

Same thread_id for both participants

Deterministic — no duplicate threads between same users

Server cannot determine participants from thread_id

Thread storage
threads (
id UUID PRIMARY KEY,
ciphertext BYTEA NOT NULL,
iv BYTEA NOT NULL,
created_at TIMESTAMP
)

Server cannot read:

Who the participants are

Thread metadata

Thread discovery

Users query threads by computing thread_id for each known contact UUID

No server-side filtering by participant

Client maintains local list of known contact UUIDs

PHASE 10 — Message encryption & persistence (zero-knowledge server)

All message crypto is client-side.

Message send flow

Client builds plaintext:

{
"sender_id": "...",
"sender_name": "Alice",
"content": "hello",
"timestamp": 1234567890
}

Encrypt using:

AES-256-GCM

Thread key (NOT vault key) — derived from vault_key + both participant UUIDs

Random 12-byte IV

This ensures only the two thread participants can decrypt messages.

Send to backend:

{
"thread_id": "...",
"ciphertext": "...",
"iv": "..."
}

Message storage
messages (
id UUID PRIMARY KEY,
thread_id UUID NOT NULL,
ciphertext BYTEA NOT NULL,
iv BYTEA NOT NULL,
created_at TIMESTAMP
)

Server stores and relays blindly.

Message receive flow

Client receives encrypted payload

Attempts decryption

If success → render

If failure → ignore or mark unreadable

This prevents decryption-oracle leaks.

PHASE 11 — Real-time communication (WebSocket relay)

Backend acts as stateless relay.

WebSocket rules

JWT required to connect

One global connection pool

Messages broadcast by thread_id

Backend does NOT inspect payloads

Server responsibilities

Accept / reject socket

Persist encrypted blobs

Broadcast encrypted blobs

Enforce auth failure policy

No crypto. No identity checks.

PHASE 12 — Progressive Web App (offline-first)

Frontend is a PWA, not a toy SPA.

PWA behavior

Installable

Offline read support

Online-only write support

Offline handling

Cached:

App shell

Encrypted thread list

Encrypted messages

Decryption still happens client-side

If vault key unavailable → nothing readable

Storage rules

No plaintext stored unencrypted

IndexedDB only

Vault key never persisted

PHASE 13 — Defense system (retry limits, IP blocking, self-destruct)

This phase enforces deployment-time policy.

Auth failure tracking

Count failures per IP

Reset on success

Stored in-memory + optional persistence

Failure actions (exact)
ip_temp

Block IP for IP_BLOCK_MINUTES

Auto-unblock

ip_perm

Persistently deny IP

db_wipe

Drop all tables

Recreate schema

Continue running

db_wipe_shutdown

Drop all tables

Exit process immediately

PANIC MODE

If PANIC_MODE=true:

Any auth failure:

DB wipe

Immediate shutdown

No thresholds

Dead-man behavior (optional extension)

No successful unlock for N days:

Auto-wipe DB

PHASE 14 — Docker, TLS, lifecycle & redeploy semantics
TLS

IP-based HTTPS

mkcert or self-signed

Nginx terminates TLS

WebSocket over WSS only

Docker Compose services

postgres

backend

nginx

Volumes:

DB volume

Optional .env persistence

Redeploy behavior
If PERSIST_VAULT=false

New secrets generated

Old DB unreadable

Clean vault

If PERSIST_VAULT=true

Existing .env detected

Explicit confirmation required

No silent reuse

Final invariants (reasserted)

One command

One vault

One secret (12 words)

Multiple users (hidden from each other)

Private UUID-gated threads

UUID required to initiate chat — no user discovery

Hierarchical key model (vault key → thread keys)

Client-side encryption

Zero server knowledge

Self-destruct capable
