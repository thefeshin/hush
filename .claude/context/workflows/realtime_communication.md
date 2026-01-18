# Workflow: Real-time Communication

**Complexity:** HIGH
**Primary Agent:** `integration-hub`
**Last Updated:** 2026-01-18

---

## Overview

Real-time communication handles WebSocket connections for instant message delivery. The server acts as a blind relay - it broadcasts encrypted payloads without understanding content.

**Key Principle:** WebSocket is a relay only - server broadcasts encrypted blobs by thread_id.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| WebSocket hook | `frontend/src/hooks/useWebSocket.ts` | 12-60 | App initialization |
| WebSocket service | `frontend/src/services/websocket.ts` | 12-80 | Connection management |
| Server endpoint | `backend/app/routers/websocket.py` | 25-90 | WS /ws connection |
| Connection manager | `backend/app/services/websocket.py` | 15-70 | Client tracking |

---

## Call Chain: Connection

```
App.tsx:useEffect()
├─ useWebSocket() [hooks/useWebSocket.ts:12]
│  ├─ websocket.connect(token) [services/websocket.ts:20]
│  │  └─ new WebSocket(`wss://host/ws?token=${jwt}`)
│  │     └─ websocket.py:websocket_endpoint()
│  │        ├─ validate_jwt(token) [dependencies/auth.py:15]
│  │        ├─ manager.connect(websocket) [services/websocket.py:25]
│  │        └─ await receive_loop()
│  └─ websocket.onOpen → set connected status
```

---

## Call Chain: Message Relay

```
# When a new message is created:
messages.py:create_message()
├─ INSERT INTO messages
└─ manager.broadcast(thread_id, message_data) [services/websocket.py:45]
   └─ for connection in connections:
      └─ if connection.subscribed(thread_id):
         └─ connection.send_json(message_data)

# Client receives:
websocket.ts:onMessage(event)
├─ data = JSON.parse(event.data)
├─ if data.type == 'message':
│  └─ messageStore.addMessage(data) [stores/messageStore.ts:35]
└─ trigger UI update
```

---

## Call Chain: Thread Subscription

```
ThreadView.tsx:useEffect([threadId])
├─ useThreadSubscription(threadId) [hooks/useThreadSubscription.ts:8]
│  └─ websocket.subscribe(threadId) [services/websocket.ts:55]
│     └─ send({ type: 'subscribe', thread_id: threadId })
│        └─ websocket.py:handle_subscribe()
│           └─ manager.add_subscription(ws, thread_id)
```

---

## WebSocket Messages

**Client → Server:**
```json
{ "type": "subscribe", "thread_id": "uuid" }
{ "type": "unsubscribe", "thread_id": "uuid" }
{ "type": "ping" }
```

**Server → Client:**
```json
{ "type": "message", "thread_id": "uuid", "ciphertext": "...", "iv": "..." }
{ "type": "pong" }
{ "type": "error", "message": "..." }
```

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/services/websocket.ts` | WebSocket client | `connect()`, `subscribe()`, `send()` |
| `frontend/src/hooks/useWebSocket.ts` | React hook | `useWebSocket()` |
| `frontend/src/hooks/useThreadSubscription.ts` | Thread subscription | `useThreadSubscription()` |
| `backend/app/routers/websocket.py` | WS endpoint | `websocket_endpoint()` |
| `backend/app/services/websocket.py` | Connection manager | `ConnectionManager` |

---

## Connection States

| State | Description | UI Indicator |
|-------|-------------|--------------|
| Connecting | WebSocket handshake | Yellow dot |
| Connected | Active connection | Green dot |
| Disconnected | Connection lost | Red dot |
| Reconnecting | Auto-reconnect in progress | Pulsing yellow |

---

## Reconnection Logic

```
websocket.ts:onClose()
├─ if !intentionalClose:
│  ├─ wait(backoff) // 1s, 2s, 4s, 8s, max 30s
│  └─ connect() // retry
└─ resubscribe to active threads
```

---

## Security Considerations

1. **JWT required** - Connection rejected without valid token
2. **Thread isolation** - Only receive messages for subscribed threads
3. **No plaintext** - Server relays encrypted blobs only
4. **TLS required** - WSS only in production

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| Connection refused | JWT expired | Re-authenticate |
| Disconnected frequently | Network instability | Check network, increase timeouts |
| Messages not arriving | Not subscribed | Call subscribe(threadId) |
| 1008 Policy Violation | JWT invalid | Re-authenticate |

---

## Related Workflows

- [message_flow.md](./message_flow.md) - Message delivery trigger
- [authentication.md](./authentication.md) - JWT for connection auth

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test reconnection behavior
- [ ] Verify subscription filtering
- [ ] Run /verify-docs-current
