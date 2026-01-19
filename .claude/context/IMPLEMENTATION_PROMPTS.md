# HUSH Implementation Prompts

Use these prompts with Claude Code to implement each phase. Run them in order.

---

## Phase 1: Project Structure & Deployment CLI

```
Implement Phase 1 of HUSH according to D:\projects\hush\implementation\PHASE-01-PROJECT-STRUCTURE-AND-CLI.md

Create the complete project structure and deployment CLI:

1. Create directory structure:
   - cli/ (Python CLI modules)
   - backend/app/ (FastAPI application)
   - frontend/src/ (React application)
   - nginx/ (Nginx configuration)

2. Implement the CLI:
   - hush (main executable entry point)
   - cli/main.py (orchestration)
   - cli/prompts.py (interactive security prompts)
   - cli/secrets.py (cryptographic secret generation)
   - cli/config.py (configuration management)
   - cli/wordlist.py (BIP39 2048 words)

3. The CLI must:
   - Display ASCII banner
   - Collect 5 security configuration prompts
   - Generate 12 random words from BIP39
   - Generate KDF salt (32 bytes, base64)
   - Compute auth hash (SHA-256 of normalized words)
   - Write .env file with configuration
   - Print secrets ONCE to stdout
   - Never store plaintext words

Make all files complete and production-ready.
```

---

## Phase 2: Database & Backend Core

```
Implement Phase 2 of HUSH according to D:\projects\hush\implementation\PHASE-02-DATABASE-AND-BACKEND-CORE.md

Create the database schema and FastAPI backend foundation:

1. Database schema (PostgreSQL):
   - threads table (id, ciphertext, iv, created_at)
   - messages table (id, thread_id, ciphertext, iv, created_at)
   - blocked_ips table (ip_address, blocked_at, expires_at, reason)
   - auth_failures table (ip_address, failure_count, timestamps)
   - NO users table (zero-knowledge)

2. Backend structure:
   - backend/app/main.py (FastAPI app factory)
   - backend/app/config.py (pydantic settings)
   - backend/app/database.py (asyncpg connection pool)
   - backend/app/schemas/ (Pydantic models)
   - backend/app/routers/health.py (health endpoints)

3. Requirements:
   - backend/requirements.txt
   - backend/Dockerfile

4. The backend must:
   - Load config from .env
   - Initialize database on startup
   - Create tables if not exist
   - Run as non-root user
   - Have health check endpoints

Make all files complete and production-ready.
```

---

## Phase 3: Authentication & Defense System

```
Implement Phase 3 of HUSH according to D:\projects\hush\implementation\PHASE-03-AUTHENTICATION-AND-DEFENSE.md

Create the authentication endpoint and defense system:

1. Authentication router:
   - backend/app/routers/auth.py
   - POST /api/auth (validate 12 words, return JWT)
   - GET /api/auth/salt (return KDF salt)
   - Normalize words (lowercase, trim, single spaces)
   - SHA-256 hash comparison (constant-time)
   - JWT issuance on success

2. Defense service:
   - backend/app/services/defense.py
   - Per-IP failure tracking
   - Temporary IP blocking (ip_temp)
   - Permanent IP blocking (ip_perm)
   - Database wipe (db_wipe)
   - Database wipe + shutdown (db_wipe_shutdown)
   - Panic mode (any failure = wipe + shutdown)

3. Security middleware:
   - backend/app/middleware/security.py
   - Check IP blocks before requests
   - Add security headers

4. JWT verification:
   - backend/app/dependencies/auth.py
   - Token verification for protected routes
   - WebSocket token verification

5. Utilities:
   - backend/app/utils/crypto.py (constant-time comparison)

Make all files complete with proper error handling and logging.
```

---

## Phase 4: WebSocket & Message Relay

```
Implement Phase 4 of HUSH according to D:\projects\hush\implementation\PHASE-04-WEBSOCKET-AND-MESSAGE-RELAY.md

Create the WebSocket relay and REST endpoints:

1. WebSocket manager:
   - backend/app/services/websocket.py
   - Connection pool management
   - Thread subscription (subscribe/unsubscribe)
   - Message broadcasting by thread_id
   - Heartbeat and cleanup

2. WebSocket router:
   - backend/app/routers/websocket.py
   - JWT authentication on connect
   - Handle subscribe/unsubscribe/message types
   - Persist messages to database
   - Broadcast to thread subscribers

3. Thread router:
   - backend/app/routers/threads.py
   - POST /api/threads (create thread)
   - POST /api/threads/query (query by IDs)
   - GET /api/threads/{id} (get single thread)
   - All data is encrypted blobs

4. Message router:
   - backend/app/routers/messages.py
   - POST /api/messages (create message)
   - GET /api/messages/{thread_id} (get messages with pagination)
   - All data is encrypted blobs

5. Register routers in main.py

Make all files complete with proper WebSocket handling.
```

---

## Phase 5: Frontend Core & Crypto Module

```
Implement Phase 5 of HUSH according to D:\projects\hush\implementation\PHASE-05-FRONTEND-CRYPTO-MODULE.md

Create the React/Vite project and crypto module:

1. Project setup:
   - frontend/package.json (React, Vite, TypeScript, argon2-browser, zustand, idb)
   - frontend/vite.config.ts (PWA plugin, proxy config)
   - frontend/tsconfig.json

2. Type definitions:
   - frontend/src/types/crypto.ts

3. Crypto utilities:
   - frontend/src/crypto/encoding.ts (base64, bytes, random)
   - frontend/src/crypto/normalize.ts (word normalization)
   - frontend/src/crypto/kdf.ts (Argon2id key derivation)
   - frontend/src/crypto/thread-key.ts (HKDF thread key derivation)
   - frontend/src/crypto/aes.ts (AES-256-GCM encrypt/decrypt)
   - frontend/src/crypto/identity-key.ts (identity encryption key)
   - frontend/src/crypto/CryptoContext.tsx (React context)

4. Key derivation must:
   - Use Argon2id (64MB, 3 iterations, parallelism 2)
   - Derive 256-bit vault key from words + salt
   - Derive thread keys using HKDF from vault key + sorted UUIDs
   - Compute thread_id as SHA-256(sort(uuid_a:uuid_b))

5. Encryption must:
   - Use AES-256-GCM with random 12-byte IV
   - Support JSON serialization

Make all files complete with TypeScript types.
```

---

## Phase 6: Frontend Authentication & Identity

```
Implement Phase 6 of HUSH according to D:\projects\hush\implementation\PHASE-06-FRONTEND-AUTH-AND-IDENTITY.md

Create authentication UI and identity management:

1. Storage service:
   - frontend/src/services/storage.ts (IndexedDB with idb)
   - Identity, contacts, threads, messages stores
   - All data encrypted before storage

2. API service:
   - frontend/src/services/api.ts
   - authenticate(words) function
   - getSalt() function
   - AuthenticationError class

3. Auth store:
   - frontend/src/stores/authStore.ts (Zustand)
   - login, logout, setIdentity actions
   - Token and identity state

4. Components:
   - frontend/src/components/Login.tsx (12-word input)
   - frontend/src/components/IdentitySetup.tsx (create UUID + name)
   - frontend/src/components/UUIDShare.tsx (copy/QR code)

5. App entry:
   - frontend/src/App.tsx (auth flow: login -> setup -> chat)
   - frontend/src/main.tsx

6. Styles:
   - frontend/src/styles/main.css

The login must:
- Hide words by default (toggle visibility)
- Show word count
- Display remaining attempts on failure
- Clear input after successful auth

Make all files complete with proper error handling.
```

---

## Phase 7: Frontend Chat UI

```
Implement Phase 7 of HUSH according to D:\projects\hush\implementation\PHASE-07-FRONTEND-CHAT-UI.md

Create the chat interface:

1. Stores:
   - frontend/src/stores/contactStore.ts (contacts with encrypted metadata)
   - frontend/src/stores/threadStore.ts (threads with participants)
   - frontend/src/stores/messageStore.ts (messages by thread)

2. Components:
   - frontend/src/components/Chat.tsx (main layout)
   - frontend/src/components/Sidebar.tsx (tabs, thread list, contact list)
   - frontend/src/components/AddContactModal.tsx (add by UUID)
   - frontend/src/components/ThreadView.tsx (header, messages, composer)
   - frontend/src/components/MessageList.tsx (message display)
   - frontend/src/components/MessageComposer.tsx (input + send)
   - frontend/src/components/EmptyState.tsx

3. Styles:
   - frontend/src/styles/chat.css

4. Features:
   - Add contact by UUID (validate format)
   - Start chat with contact (creates thread)
   - Display messages (own on right, others on left)
   - Send messages (optimistic UI)
   - Thread list sorted by last message

Make all files complete with proper state management.
```

---

## Phase 8: WebSocket Client

```
Implement Phase 8 of HUSH according to D:\projects\hush\implementation\PHASE-08-WEBSOCKET-CLIENT.md

Create the real-time WebSocket client:

1. WebSocket service:
   - frontend/src/services/websocket.ts
   - Connection with JWT authentication
   - Automatic reconnection (exponential backoff)
   - Thread subscription management
   - Message sending with promise resolution
   - Heartbeat handling
   - Connection state enum

2. Hooks:
   - frontend/src/hooks/useWebSocket.ts (React hook for WS)
   - frontend/src/hooks/useThreadSubscription.ts (auto-subscribe)
   - frontend/src/hooks/useOnlineStatus.ts (online/offline detection)

3. Components:
   - frontend/src/components/ConnectionStatus.tsx

4. Message queue:
   - frontend/src/services/messageQueue.ts (offline message queue)

5. Sync service:
   - frontend/src/services/sync.ts (REST fallback)

6. Styles:
   - frontend/src/styles/connection.css

The WebSocket must:
- Reconnect automatically with backoff
- Resubscribe to threads after reconnect
- Handle incoming messages and decrypt
- Queue messages when offline

Make all files complete with proper error handling.
```

---

## Phase 9: PWA & Offline Support

```
Implement Phase 9 of HUSH according to D:\projects\hush\implementation\PHASE-09-PWA-OFFLINE-SUPPORT.md

Create PWA functionality:

1. Service worker:
   - frontend/public/sw.js
   - Cache static assets on install
   - Cache-first for static, network-first for API
   - Background sync support

2. Manifest:
   - frontend/public/manifest.json
   - App icons, theme colors, display mode

3. Service worker registration:
   - frontend/src/services/serviceWorker.ts
   - Update detection and handling
   - Background sync registration

4. Hooks:
   - frontend/src/hooks/useInstallPrompt.ts

5. Components:
   - frontend/src/components/InstallBanner.tsx
   - frontend/src/components/UpdateBanner.tsx
   - frontend/src/components/OfflineIndicator.tsx

6. HTML:
   - frontend/index.html (meta tags, CSP, manifest link)

7. Styles:
   - frontend/src/styles/pwa.css

8. Update App.tsx to include PWA components

Make all files complete for installable PWA.
```

---

## Phase 10: Docker & Nginx Deployment

```
Implement Phase 10 of HUSH according to D:\projects\hush\implementation\PHASE-10-DOCKER-NGINX-DEPLOYMENT.md

Create the complete deployment configuration:

1. Backend Dockerfile:
   - backend/Dockerfile (multi-stage, non-root user)

2. Frontend Dockerfile:
   - frontend/Dockerfile (multi-stage build)
   - frontend/nginx.conf (SPA routing)

3. Main Nginx config:
   - nginx/nginx.conf
   - HTTPS with TLS 1.2/1.3
   - Rate limiting (10r/s API, 1r/s auth)
   - WebSocket upgrade
   - Security headers (HSTS, CSP, etc.)
   - HTTP -> HTTPS redirect

4. Docker Compose:
   - docker-compose.yml
   - postgres, backend, frontend, nginx services
   - Health checks for all services
   - Internal network only
   - Volume for database persistence

5. SSL generation:
   - cli/ssl.py (OpenSSL self-signed)

6. Update CLI:
   - Add SSL generation to deployment flow
   - Add container build and start

7. Utility files:
   - .gitignore
   - backend/.dockerignore
   - frontend/.dockerignore

After implementation, verify:
- ./hush deploy runs completely
- All containers become healthy
- https://localhost works
- Full end-to-end flow works

Make all files complete for production deployment.
```

---

## Final Integration Test

```
After all phases are implemented, run a full integration test:

1. Reset everything:
   docker-compose down -v
   rm -f .env

2. Deploy:
   ./hush deploy
   (Answer prompts, save 12 words)

3. Test authentication:
   - Open https://localhost
   - Enter wrong words (verify failure count)
   - Enter correct words (verify success)

4. Test identity:
   - Create identity with display name
   - Verify UUID is generated
   - Copy UUID

5. Test contacts:
   - Open in second browser/incognito
   - Login with same 12 words
   - Create different identity
   - Add first user as contact using their UUID

6. Test messaging:
   - Start chat with contact
   - Send message from user 1
   - Verify appears in user 2
   - Send reply
   - Verify real-time delivery

7. Test offline:
   - Disable network
   - Verify app still loads
   - Verify cached messages display

8. Test security:
   - Exceed failure threshold
   - Verify IP block/db wipe based on policy

Report any issues found.
```

---

## Quick Reference

| Phase | File | Description |
|-------|------|-------------|
| 1 | PHASE-01-PROJECT-STRUCTURE-AND-CLI.md | CLI & project structure |
| 2 | PHASE-02-DATABASE-AND-BACKEND-CORE.md | Database & FastAPI core |
| 3 | PHASE-03-AUTHENTICATION-AND-DEFENSE.md | Auth & security |
| 4 | PHASE-04-WEBSOCKET-AND-MESSAGE-RELAY.md | WebSocket & REST |
| 5 | PHASE-05-FRONTEND-CRYPTO-MODULE.md | Frontend crypto |
| 6 | PHASE-06-FRONTEND-AUTH-AND-IDENTITY.md | Frontend auth UI |
| 7 | PHASE-07-FRONTEND-CHAT-UI.md | Chat interface |
| 8 | PHASE-08-WEBSOCKET-CLIENT.md | WebSocket client |
| 9 | PHASE-09-PWA-OFFLINE-SUPPORT.md | PWA & offline |
| 10 | PHASE-10-DOCKER-NGINX-DEPLOYMENT.md | Docker & deployment |
