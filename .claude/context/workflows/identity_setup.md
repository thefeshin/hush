# Workflow: Identity Setup

**Complexity:** MEDIUM
**Primary Agent:** `api-developer`
**Last Updated:** 2026-01-18

---

## Overview

Identity setup creates a unique UUID and display name for each user. This identity is encrypted and stored locally in IndexedDB - the server never knows user identities.

**Key Principle:** Identity is client-local only - UUIDs exchanged out-of-band.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Identity setup component | `frontend/src/components/IdentitySetup.tsx` | 15-80 | First login (no identity) |
| Identity key encryption | `frontend/src/crypto/identity-key.ts` | 10-50 | Storing identity |
| Auth store | `frontend/src/stores/authStore.ts` | 40-70 | Identity state |

---

## Call Chain: Creating Identity

```
IdentitySetup.tsx:handleSubmit()
├─ uuid = crypto.randomUUID()
├─ identity = { uuid, displayName, createdAt }
├─ encryptIdentity(identity, vaultKey) [crypto/identity-key.ts:15]
│  ├─ plaintext = JSON.stringify(identity)
│  └─ encrypt(plaintext, vaultKey) [crypto/aes.ts:10]
├─ storage.saveIdentity(encryptedIdentity) [services/storage.ts:25]
│  └─ IndexedDB.put('identity', encryptedData)
└─ authStore.setIdentity(identity) [stores/authStore.ts:50]
```

---

## Call Chain: Loading Identity

```
App.tsx:useEffect() // on vault key available
├─ storage.getIdentity() [services/storage.ts:35]
│  └─ IndexedDB.get('identity')
├─ if exists:
│  ├─ decryptIdentity(encrypted, vaultKey) [crypto/identity-key.ts:30]
│  └─ authStore.setIdentity(decrypted)
└─ else:
   └─ navigate('/identity-setup')
```

---

## Identity Schema

```typescript
interface Identity {
  uuid: string;          // crypto.randomUUID()
  displayName: string;   // User-chosen name
  createdAt: string;     // ISO timestamp
}
```

**Stored Format (IndexedDB):**
```json
{
  "ciphertext": "base64-encoded",
  "iv": "base64-encoded"
}
```

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/components/IdentitySetup.tsx` | Setup UI | `handleSubmit()` |
| `frontend/src/crypto/identity-key.ts` | Identity encryption | `encryptIdentity()`, `decryptIdentity()` |
| `frontend/src/services/storage.ts` | IndexedDB wrapper | `saveIdentity()`, `getIdentity()` |
| `frontend/src/stores/authStore.ts` | Identity state | `setIdentity()` |
| `frontend/src/components/UUIDShare.tsx` | Share UUID | QR code, copy button |

---

## UUID Sharing

Users share UUIDs out-of-band to start conversations:

```
UUIDShare.tsx
├─ QR code display (qrcode.react)
├─ Copy to clipboard button
└─ Display UUID as text
```

**Security Note:** UUID alone cannot decrypt messages - need vault key too.

---

## Security Considerations

1. **UUID is not secret** - But only useful with vault key
2. **Display name is private** - Encrypted in IndexedDB
3. **No server knowledge** - Server never sees identity
4. **Browser clear = identity lost** - But can recreate with same passphrase

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| IndexedDB unavailable | Browser restrictions | Check private browsing mode |
| Identity not loading | Decryption failed | Wrong vault key (wrong passphrase) |
| UUID collision | Extremely unlikely | UUID v4 has 122 bits of randomness |

---

## Related Workflows

- [vault_key_derivation.md](./vault_key_derivation.md) - Provides encryption key
- [client_storage.md](./client_storage.md) - IndexedDB operations
- [thread_encryption.md](./thread_encryption.md) - Uses UUID for thread keys

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test identity persistence across sessions
- [ ] Verify QR code generation
- [ ] Run /verify-docs-current
