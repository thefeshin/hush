# Workflow: Thread Encryption

**Complexity:** HIGH
**Primary Agent:** `core-architect`
**Last Updated:** 2026-01-18

---

## Overview

Thread encryption derives a unique key for each conversation using HKDF. Messages are encrypted with AES-256-GCM. Both parties derive the same key independently.

**Key Principle:** Thread key = HKDF(vault_key, sorted([my_uuid, peer_uuid]))

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Thread key derivation | `frontend/src/crypto/thread-key.ts` | 8-35 | Opening a thread |
| AES encryption | `frontend/src/crypto/aes.ts` | 10-40 | Sending message |
| AES decryption | `frontend/src/crypto/aes.ts` | 45-75 | Receiving message |

---

## Call Chain

```
ThreadView.tsx:loadThread()
├─ deriveThreadKey(vaultKey, myUuid, peerUuid) [crypto/thread-key.ts:8]
│  ├─ sortedUuids = [myUuid, peerUuid].sort().join(':')
│  ├─ crypto.subtle.importKey('raw', vaultKey, 'HKDF', false, ['deriveKey'])
│  └─ crypto.subtle.deriveKey(
│        { name: 'HKDF', salt: new Uint8Array(0), info: encode(sortedUuids), hash: 'SHA-256' },
│        baseKey,
│        { name: 'AES-GCM', length: 256 },
│        false,
│        ['encrypt', 'decrypt']
│     )
└─ setThreadKey(derivedKey) [stores/threadStore.ts:45]

MessageComposer.tsx:sendMessage()
├─ encrypt(plaintext, threadKey) [crypto/aes.ts:10]
│  ├─ iv = crypto.getRandomValues(new Uint8Array(12))
│  ├─ ciphertext = crypto.subtle.encrypt({ name: 'AES-GCM', iv }, threadKey, encode(plaintext))
│  └─ return { ciphertext, iv }
└─ api.sendMessage(threadId, ciphertext, iv) [services/api.ts:65]

MessageList.tsx:displayMessage()
├─ decrypt(ciphertext, iv, threadKey) [crypto/aes.ts:45]
│  └─ plaintext = crypto.subtle.decrypt({ name: 'AES-GCM', iv }, threadKey, ciphertext)
└─ render(plaintext)
```

---

## Cryptographic Details

| Component | Algorithm | Parameters |
|-----------|-----------|------------|
| Key Derivation | HKDF-SHA256 | No salt, info = sorted UUIDs |
| Encryption | AES-256-GCM | 12-byte random IV |
| Authentication | GCM tag | 128-bit (built into AES-GCM) |

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/crypto/thread-key.ts` | Thread key derivation | `deriveThreadKey()` |
| `frontend/src/crypto/aes.ts` | AES operations | `encrypt()`, `decrypt()` |
| `frontend/src/crypto/encoding.ts` | Data encoding | `encode()`, `decode()` |

---

## UUID Sorting Logic

```typescript
// Both parties derive the SAME key
const sortedUuids = [myUuid, peerUuid].sort().join(':');
// Example: "abc-123:xyz-789" (alphabetically sorted)
```

This ensures:
- Both parties get identical thread keys
- No key exchange needed
- Key is deterministic from vault key + UUIDs

---

## Security Considerations

1. **Random IV per message** - Never reuse IVs
2. **GCM provides authentication** - Tamper detection built-in
3. **Thread key isolation** - Compromising one thread doesn't affect others
4. **UUID sorting** - Deterministic for both parties

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| Decryption failed | Wrong thread key | Verify UUIDs match |
| Invalid IV | IV length != 12 | Check IV generation |
| OperationError | Corrupted ciphertext | Data integrity issue |

---

## Related Workflows

- [vault_key_derivation.md](./vault_key_derivation.md) - Provides vault key
- [message_flow.md](./message_flow.md) - Uses encryption

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Verify IV is random per message
- [ ] Test cross-party decryption
- [ ] Run /verify-docs-current
