# Workflow: Message Flow

**Complexity:** HIGH
**Primary Agent:** `integration-hub`
**Last Updated:** 2026-01-18

---

## Overview

Message flow covers the complete lifecycle of sending and receiving encrypted messages, from composition through storage to real-time delivery.

**Key Principle:** Messages are encrypted client-side, stored as blobs, relayed via WebSocket.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Message composer | `frontend/src/components/MessageComposer.tsx` | 15-60 | User types message |
| Send API | `frontend/src/services/api.ts` | 45-70 | Submitting message |
| Messages endpoint | `backend/app/routers/messages.py` | 20-80 | POST/GET /api/messages |
| WebSocket relay | `backend/app/routers/websocket.py` | 25-70 | Real-time broadcast |

---

## Call Chain: Sending

```
MessageComposer.tsx:handleSend()
├─ encrypt(plaintext, threadKey) [crypto/aes.ts:10]
│  ├─ iv = crypto.getRandomValues(new Uint8Array(12))
│  └─ ciphertext = AES-256-GCM(plaintext, threadKey, iv)
├─ api.sendMessage(threadId, ciphertext, iv) [services/api.ts:65]
│  └─ POST /api/messages { thread_id, ciphertext, iv }
│     └─ messages.py:create_message()
│        ├─ INSERT INTO messages (thread_id, ciphertext, iv)
│        └─ websocket_manager.broadcast(thread_id, message)
└─ messageStore.addMessage(message) [stores/messageStore.ts:30]
```

---

## Call Chain: Receiving

```
websocket.ts:onMessage(event)
├─ parse(event.data) → { thread_id, ciphertext, iv }
├─ if thread_id == currentThread:
│  ├─ decrypt(ciphertext, iv, threadKey) [crypto/aes.ts:45]
│  │  └─ plaintext = AES-256-GCM.decrypt(ciphertext, threadKey, iv)
│  └─ messageStore.addMessage({ plaintext, ... })
└─ trigger re-render
```

---

## Call Chain: Loading History

```
ThreadView.tsx:useEffect([threadId])
├─ api.getMessages(threadId) [services/api.ts:75]
│  └─ GET /api/messages?thread_id={id}
│     └─ messages.py:get_messages()
│        └─ SELECT FROM messages WHERE thread_id = $1 ORDER BY created_at
├─ for each message:
│  └─ decrypt(ciphertext, iv, threadKey)
└─ messageStore.setMessages(decrypted)
```

---

## Database Operations

| Table | Operation | Purpose |
|-------|-----------|---------|
| `messages` | INSERT | Store new encrypted message |
| `messages` | SELECT | Fetch message history |
| `threads` | SELECT | Verify thread exists |

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/components/MessageComposer.tsx` | Message input UI | `handleSend()` |
| `frontend/src/components/MessageList.tsx` | Message display | `renderMessages()` |
| `frontend/src/services/api.ts` | API client | `sendMessage()`, `getMessages()` |
| `frontend/src/crypto/aes.ts` | Encryption | `encrypt()`, `decrypt()` |
| `backend/app/routers/messages.py` | API endpoints | `create_message()`, `get_messages()` |
| `backend/app/services/websocket.py` | WebSocket manager | `broadcast()` |

---

## Message Schema

**Client → Server:**
```json
{
  "thread_id": "uuid",
  "ciphertext": "base64-encoded",
  "iv": "base64-encoded"
}
```

**Server → Client (WebSocket):**
```json
{
  "type": "message",
  "thread_id": "uuid",
  "message_id": "uuid",
  "ciphertext": "base64-encoded",
  "iv": "base64-encoded",
  "created_at": "ISO timestamp"
}
```

---

## Security Considerations

1. **Encryption before network** - Plaintext never leaves browser
2. **Random IV per message** - Critical for AES-GCM security
3. **Server is blind relay** - Cannot read message content
4. **No message editing** - Append-only design

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | JWT expired | Re-authenticate |
| Decryption failed | Wrong thread key | Verify thread membership |
| Message not appearing | WebSocket disconnected | Check connection status |
| Slow loading | Many messages | Consider pagination |

---

## Related Workflows

- [thread_encryption.md](./thread_encryption.md) - Provides thread key
- [realtime_communication.md](./realtime_communication.md) - WebSocket delivery

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test send/receive cycle
- [ ] Verify WebSocket broadcast
- [ ] Run /verify-docs-current
