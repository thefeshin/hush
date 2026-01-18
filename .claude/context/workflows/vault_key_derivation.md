# Workflow: Vault Key Derivation

**Complexity:** HIGH
**Primary Agent:** `core-architect`
**Last Updated:** 2026-01-18

---

## Overview

After successful authentication, the client derives a 256-bit vault key using Argon2id. This key is the root of all encryption - it never leaves the browser.

**Key Principle:** Server never sees the vault key - only the passphrase hash for auth.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Crypto context | `frontend/src/crypto/CryptoContext.tsx` | 20-60 | After successful login |
| KDF function | `frontend/src/crypto/kdf.ts` | 15-45 | Called by CryptoContext |

---

## Call Chain

```
CryptoContext.tsx:initializeVault()
├─ normalize(passphrase) [crypto/normalize.ts:5]
├─ deriveVaultKey(normalized, salt) [crypto/kdf.ts:15]
│  ├─ argon2.hash({
│  │     pass: normalized,
│  │     salt: base64Decode(salt),
│  │     type: argon2.ArgonType.Argon2id,
│  │     mem: 65536,      // 64 MB
│  │     time: 3,         // 3 iterations
│  │     parallelism: 2,  // 2 lanes
│  │     hashLen: 32      // 256 bits
│  │  })
│  └─ return Uint8Array(hash)
└─ setVaultKey(key) [stores/authStore.ts:35]
```

---

## Argon2 Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Type | Argon2id | Hybrid (side-channel + GPU resistant) |
| Memory | 65536 KB (64 MB) | Memory-hard, prevents GPU attacks |
| Iterations | 3 | Time cost |
| Parallelism | 2 | Lanes for parallel computation |
| Hash Length | 32 bytes (256 bits) | AES-256 key size |

**Performance:** ~2 seconds on modern hardware

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/crypto/kdf.ts` | Key derivation | `deriveVaultKey()` |
| `frontend/src/crypto/normalize.ts` | Word normalization | `normalize()` |
| `frontend/src/crypto/CryptoContext.tsx` | React context | `initializeVault()` |
| `frontend/src/crypto/encoding.ts` | Base64 utilities | `base64Decode()` |

---

## Salt Management

- Salt is generated at deployment time (`cli/secrets.py`)
- Stored in `.env` as `KDF_SALT` (base64 encoded)
- Passed to frontend via API or build-time injection
- **CRITICAL:** Changing salt invalidates ALL existing data

---

## Security Considerations

1. **Vault key lives in memory only** - never persisted
2. **Salt is public** - security comes from passphrase entropy
3. **Parameters are fixed** - changing them invalidates data
4. **Argon2id chosen** - best hybrid protection

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| WASM load failure | argon2-browser not loaded | Check bundle, verify WASM support |
| Out of memory | 64MB allocation failed | Reduce memory param (breaks compatibility) |
| Slow derivation | Weak hardware | Expected on older devices |

---

## Related Workflows

- [authentication.md](./authentication.md) - Must succeed first
- [thread_encryption.md](./thread_encryption.md) - Uses vault key

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] NEVER change Argon2 parameters (breaks all data)
- [ ] Test on low-memory devices
- [ ] Run /verify-docs-current
