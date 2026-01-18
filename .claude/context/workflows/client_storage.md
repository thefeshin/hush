# Workflow: Client Storage

**Complexity:** MEDIUM
**Primary Agent:** `api-developer`
**Last Updated:** 2026-01-18

---

## Overview

Client storage uses IndexedDB (via the `idb` library) to store encrypted data locally. This enables offline access and reduces server load while maintaining zero-knowledge principles.

**Key Principle:** All stored data is encrypted - IndexedDB contains only ciphertext.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Storage service | `frontend/src/services/storage.ts` | 10-100 | Any local data operation |
| Identity storage | `frontend/src/crypto/identity-key.ts` | 40-60 | Identity save/load |

---

## Call Chain: Initialize Database

```
storage.ts:initDB()
└─ openDB('hush-vault', 1, {
     upgrade(db) {
       db.createObjectStore('identity');
       db.createObjectStore('threads', { keyPath: 'id' });
       db.createObjectStore('messages', { keyPath: 'id' });
       db.createObjectStore('settings');
     }
   })
```

---

## Call Chain: Store Encrypted Data

```
storage.ts:saveIdentity(encryptedData)
├─ db = await initDB()
└─ db.put('identity', encryptedData, 'current')

storage.ts:saveThread(threadId, encryptedData)
├─ db = await initDB()
└─ db.put('threads', { id: threadId, ...encryptedData })

storage.ts:saveMessage(messageId, encryptedData)
├─ db = await initDB()
└─ db.put('messages', { id: messageId, ...encryptedData })
```

---

## Call Chain: Retrieve Encrypted Data

```
storage.ts:getIdentity()
├─ db = await initDB()
└─ return db.get('identity', 'current')

storage.ts:getThreads()
├─ db = await initDB()
└─ return db.getAll('threads')

storage.ts:getMessages(threadId)
├─ db = await initDB()
└─ return db.getAllFromIndex('messages', 'thread_id', threadId)
```

---

## IndexedDB Schema

**Database:** `hush-vault`
**Version:** 1

| Object Store | Key | Indexes | Purpose |
|--------------|-----|---------|---------|
| `identity` | manual ('current') | - | Encrypted user identity |
| `threads` | `id` (UUID) | - | Encrypted thread metadata |
| `messages` | `id` (UUID) | `thread_id` | Encrypted messages |
| `settings` | manual | - | App preferences |

---

## Data Format

All stored objects follow this pattern:
```typescript
interface EncryptedData {
  ciphertext: string;  // Base64-encoded encrypted data
  iv: string;          // Base64-encoded initialization vector
  timestamp?: string;  // ISO timestamp for sync purposes
}
```

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/services/storage.ts` | IndexedDB wrapper | `initDB()`, `save*()`, `get*()` |
| `frontend/src/crypto/identity-key.ts` | Identity encryption | `encryptIdentity()` |

---

## Sync Strategy

```
Online:
├─ Fetch from server
├─ Decrypt
├─ Re-encrypt for local storage (same key)
└─ Save to IndexedDB

Offline:
├─ Load from IndexedDB
├─ Decrypt
└─ Display

Back Online:
├─ Fetch new messages from server
├─ Merge with local cache
└─ Update IndexedDB
```

---

## Security Considerations

1. **All data encrypted** - No plaintext in IndexedDB
2. **Same vault key** - Local and server use same encryption
3. **Browser isolation** - IndexedDB isolated per origin
4. **Clear on logout** - Option to clear local data

---

## Storage Limits

| Browser | Limit | Notes |
|---------|-------|-------|
| Chrome | 60% of disk | Generous |
| Firefox | 50% of disk | Generous |
| Safari | 1GB | More restrictive |
| Mobile | Varies | Check navigator.storage |

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| QuotaExceededError | Storage full | Clear old messages |
| InvalidStateError | DB closed unexpectedly | Reinitialize DB |
| NotFoundError | Object store missing | Check DB version/upgrade |
| Private browsing | IndexedDB restricted | Inform user of limitation |

---

## Clearing Data

```typescript
// Clear specific store
storage.clearMessages();

// Clear all local data
storage.clearAll();
// or
indexedDB.deleteDatabase('hush-vault');
```

---

## Related Workflows

- [identity_setup.md](./identity_setup.md) - Stores identity
- [message_flow.md](./message_flow.md) - Caches messages
- [pwa_lifecycle.md](./pwa_lifecycle.md) - Offline access

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test storage limits
- [ ] Verify encryption before storage
- [ ] Test clear functionality
- [ ] Run /verify-docs-current
