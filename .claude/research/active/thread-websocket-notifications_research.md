# Research: Thread WebSocket Notifications

**Date:** 2026-01-20
**Researcher:** Claude Code
**Status:** COMPLETE
**Context Budget Used:** ~15% of 200k

---

## Objective

Enable real-time notifications for new threads and messages when someone sends a message to a thread that includes your UUID, even if you haven't explicitly subscribed to that thread yet.

---

## Relevant Files Explored

| File | Lines | Key Findings |
|------|-------|--------------|
| `backend/app/routers/websocket.py` | 1-229 | Main WS endpoint, handles subscribe/unsubscribe/message types |
| `backend/app/services/websocket.py` | 1-156 | WebSocketManager with thread subscriptions, no user subscriptions |
| `backend/app/routers/threads.py` | 1-163 | Thread CRUD, idempotent creation, no notifications |
| `backend/app/models/schema.sql` | 1-49 | Schema: threads(id,ciphertext,iv), messages(thread_id,...), NO users table |
| `frontend/src/services/websocket.ts` | 1-417 | WebSocketService class, subscribe/unsubscribe to threads |
| `frontend/src/hooks/useWebSocket.ts` | 1-158 | React hook, handles incoming messages, updates stores |
| `frontend/src/hooks/useThreadSubscription.ts` | 1-25 | Subscribes when thread view opens |
| `frontend/src/stores/threadStore.ts` | 1-163 | Thread state, createThread, loadAllThreads |
| `frontend/src/crypto/thread-key.ts` | 1-105 | computeThreadId = SHA-256(sort(uuid_a, uuid_b)) |
| `frontend/src/stores/authStore.ts` | 1-102 | Identity with userId (UUID), no server-side user tracking |

---

## Code Flow Analysis

### Current Message Flow (Working)

```
User A sends message to User B [frontend]
├─ MessageComposer.tsx → sendMessage() [MessageComposer.tsx:~50]
│  ├─ useCrypto.encryptMessage() [CryptoContext.tsx]
│  └─ wsService.sendMessage(threadId, encrypted) [websocket.ts:187]
├─ Backend receives [websocket.py:81]
│  ├─ handle_message() [websocket.py:147]
│  │  ├─ validate fields [websocket.py:158-185]
│  │  ├─ INSERT INTO messages [websocket.py:203-207]
│  │  └─ broadcast_to_thread(thread_id, msg) [websocket.py:228]
└─ User B receives IF subscribed [websocket.py:96-115]
   └─ useWebSocket.handleIncomingMessage() [useWebSocket.ts:51-98]
```

### Current Thread Discovery Flow (Problem Area)

```
User A creates thread with User B [frontend]
├─ threadStore.createThread() [threadStore.ts:95]
│  ├─ computeThreadId(myUUID, otherUUID) [thread-key.ts:26]
│  ├─ encryptFn(metadata) → POST /api/threads [threads.py:19]
│  └─ saveThread(threadId, encrypted) [storage.ts]
└─ User B DOES NOT KNOW about thread until:
   ├─ User B adds User A as contact AND
   ├─ loadAllThreads() computes same threadId AND
   └─ queries POST /api/threads/query [threads.py:76]
```

**THE GAP:** If User A messages User B, User B won't see it in real-time because:
1. User B hasn't subscribed to that thread_id
2. No mechanism exists to notify User B that a new thread exists
3. User B only discovers threads by computing them from contacts list

---

## Current Architecture Constraints

### Zero-Knowledge Design
- **No users table** - Server doesn't track user identities
- **No user_id in connections** - WebSocket connections are anonymous
- **Thread IDs are opaque** - Server can't determine participants from thread_id
- **Encrypted everything** - Server can't inspect ciphertext to route messages

### Current Subscription Model
```
WebSocketManager
├─ _connections: Dict[WebSocket, Connection]
│  └─ Connection.subscribed_threads: Set[str]
└─ _thread_subscriptions: Dict[str, Set[WebSocket]]
   └─ thread_id → Set[WebSocket] (only thread-based)
```

---

## Proposed Solution Architecture

### Option 1: UUID-Based Subscription (Recommended)

**Concept:** Allow clients to subscribe to their own UUID. When threads/messages involve that UUID, notify them.

**Backend Changes:**

1. **Extend Connection dataclass** (`websocket.py:15-22`):
```python
@dataclass
class Connection:
    websocket: WebSocket
    connected_at: datetime
    subscribed_threads: Set[str]
    subscribed_uuids: Set[str]  # NEW: user UUIDs to listen for
    last_activity: datetime
```

2. **Add UUID subscription tracking** (`websocket.py`):
```python
_uuid_subscriptions: Dict[str, Set[WebSocket]] = {}
# uuid → Set[WebSocket] subscribed to that UUID
```

3. **New message types** (`websocket.py`):
```
Client → Server:
- {"type": "subscribe_uuid", "uuid": "..."}
- {"type": "unsubscribe_uuid", "uuid": "..."}

Server → Client:
- {"type": "uuid_subscribed", "uuid": "..."}
- {"type": "new_thread", "thread_id": "...", "ciphertext": "...", "iv": "..."}
- {"type": "thread_message", "thread_id": "...", "message": {...}}
```

4. **Modify thread creation** (`threads.py:19-73`):
- After creating thread, extract participant UUIDs from thread_id (NOT POSSIBLE - hash is one-way)
- **Alternative:** Add `participant_uuids` field to thread creation request (encrypted list)

5. **Broadcast on thread/message creation**:
- When thread created: notify all subscribers of participant UUIDs
- When message sent to thread: notify UUID subscribers even if not thread-subscribed

**Frontend Changes:**

1. **Extend WebSocketService** (`websocket.ts`):
- Add `subscribeToUUID(uuid: string)`
- Add `unsubscribeFromUUID(uuid: string)`
- Track `subscribedUUIDs: Set<string>`

2. **Auto-subscribe on connect** (`useWebSocket.ts`):
- On connection, call `wsService.subscribeToUUID(identity.userId)`

3. **Handle new_thread events** (`useWebSocket.ts`):
- On `new_thread` → add to threadStore, subscribe to thread

### Option 2: Participant-in-Thread Registration

**Concept:** Store participant UUIDs server-side (encrypted) and broadcast based on thread participants.

**Database Change:**
```sql
CREATE TABLE thread_participants (
    thread_id UUID NOT NULL,
    participant_uuid_hash BYTEA NOT NULL,  -- SHA-256(uuid) for lookup
    PRIMARY KEY (thread_id, participant_uuid_hash)
);
CREATE INDEX idx_participant_uuid ON thread_participants(participant_uuid_hash);
```

**Flow:**
1. Client creates thread with participant UUID hashes
2. Server stores hashes (cannot reverse to get UUIDs)
3. Client subscribes by UUID hash
4. Server broadcasts to all connections subscribed to matching hashes

---

## Database Schema Changes Required

### For Option 1 (Minimal - No DB changes)
- UUID subscriptions are in-memory only
- Thread participant list passed in each request

### For Option 2 (Persistent)
```sql
-- Thread participant lookup (hash-based for zero-knowledge)
CREATE TABLE IF NOT EXISTS thread_participants (
    thread_id UUID NOT NULL,
    participant_hash BYTEA NOT NULL,  -- SHA-256(participant_uuid)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (thread_id, participant_hash)
);

CREATE INDEX idx_thread_participants_hash ON thread_participants(participant_hash);
```

---

## Test Files & Coverage

### Existing Tests
| Test File | Coverage Area |
|-----------|---------------|
| None found | WebSocket functionality untested |

### Coverage Gaps
- No WebSocket integration tests
- No thread notification tests
- No subscription lifecycle tests
- No reconnection behavior tests

---

## Known Gotchas

From `.claude/context/KNOWN_GOTCHAS.md`:

1. **Thread keys are deterministic** - HKDF(vault_key, sorted([uuid1, uuid2]))
2. **Server NEVER decrypts** - Must maintain zero-knowledge
3. **JWT tokens have no refresh** - 24h hard expiry affects long-running WS

**New Gotchas for This Feature:**
1. **Thread ID is one-way hash** - Cannot extract participant UUIDs from thread_id
2. **Client must send participant info** - Server needs to know who to notify
3. **UUID subscription = privacy tradeoff** - Server learns which UUIDs are online

---

## Open Questions

### Technical Questions
- [x] Can server derive participants from thread_id? **NO** (SHA-256 is one-way)
- [ ] Accept privacy tradeoff of UUID subscriptions?
- [ ] Store participant hashes persistently or in-memory only?

### Business Logic Questions
- [ ] Should offline users get notifications when they reconnect?
- [ ] Should we rate-limit thread creation notifications?
- [ ] What about threads with 3+ participants (future)?

---

## Summary (for Plan Phase)

**Word Count: ~140**

Thread WebSocket Notifications requires extending the subscription model to support UUID-based subscriptions alongside existing thread subscriptions.

**Entry Points:**
- `backend/app/routers/websocket.py:20` - WebSocket endpoint
- `frontend/src/services/websocket.ts:55` - WebSocketService class

**Core Logic:**
Clients subscribe to their own UUID on connect. When threads are created or messages sent, server broadcasts to UUID subscribers who aren't already thread-subscribed.

**Key Files:**
1. `backend/app/services/websocket.py` - Add UUID subscription tracking
2. `backend/app/routers/websocket.py` - Handle subscribe_uuid, broadcast new_thread
3. `frontend/src/services/websocket.ts` - Add subscribeToUUID method
4. `frontend/src/hooks/useWebSocket.ts` - Auto-subscribe, handle new_thread

**Dependencies:**
- External: None
- Internal: WebSocketManager, threadStore, messageStore

**Test Coverage:** Missing (no existing tests)

**Recommended Approach:**
Option 1 (UUID subscription) with participant list passed in thread creation request.

**Known Risks:**
Privacy tradeoff - server learns which UUIDs are actively connected.

---

## Next Steps

After research completes:
1. Run `/rpi-plan thread-websocket-notifications` to create implementation plan
2. Human reviews plan before `/rpi-implement`
3. Consider adding WebSocket integration tests

---

**Context Usage Report:**
- Files read: 15
- Tokens used: ~30k (15% of 200k)
- Compaction needed: No
