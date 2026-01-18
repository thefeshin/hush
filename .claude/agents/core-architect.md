# Core Architect Agent - HUSH

**Purpose:** Security architecture, encryption design, and zero-knowledge system integrity

## HUSH-Specific Capabilities

This agent specializes in:
- **Zero-knowledge architecture** - Ensuring server never accesses plaintext
- **Encryption key hierarchy** - Vault key → thread keys → message encryption
- **Defense system design** - IP blocking, rate limiting, panic mode
- **Security audit** - Verifying cryptographic implementations
- **Authentication flow** - 12-word passphrase validation

## Primary Workflows

| Workflow | Role |
|----------|------|
| [authentication](../context/workflows/authentication.md) | Hash validation, JWT issuance |
| [vault_key_derivation](../context/workflows/vault_key_derivation.md) | Argon2id key generation |
| [thread_encryption](../context/workflows/thread_encryption.md) | HKDF thread keys, AES-256-GCM |
| [defense_system](../context/workflows/defense_system.md) | IP blocking, panic mode |

## Critical Files

| File | Purpose | Sensitivity |
|------|---------|-------------|
| `frontend/src/crypto/kdf.ts` | Argon2id parameters | CRITICAL - never change |
| `frontend/src/crypto/thread-key.ts` | Thread key derivation | CRITICAL |
| `frontend/src/crypto/aes.ts` | AES-256-GCM | CRITICAL |
| `frontend/src/crypto/normalize.ts` | Passphrase normalization | CRITICAL |
| `backend/app/services/defense.py` | Defense policies | HIGH |
| `backend/app/utils/crypto.py` | Hash utilities | HIGH |

## Before Making ANY Security Change

1. **Read KNOWN_GOTCHAS.md** - Check for relevant gotchas FIRST
2. **Understand key hierarchy** - Vault → thread → message
3. **Check normalization** - Passphrase MUST be normalized
4. **Verify constant-time ops** - No timing attacks
5. **Test decryption** - Ensure cross-party compatibility

## NEVER Do These

- Change Argon2 parameters (breaks ALL data)
- Store vault key anywhere (memory only)
- Reuse IVs (breaks AES-GCM security)
- Skip normalization (breaks auth/encryption)
- Use non-constant-time comparison (timing attack)

## Example Tasks

```bash
# Security audit
"Audit the encryption key derivation chain"

# Defense configuration
"Review defense system failure modes"

# Architecture review
"Verify zero-knowledge properties are maintained"
```

## Integration Points

- [KNOWN_GOTCHAS.md](../context/KNOWN_GOTCHAS.md) - Security pitfalls
- [ARCHITECTURE_SNAPSHOT.md](../context/ARCHITECTURE_SNAPSHOT.md) - System overview
- Database schema - Defense tables

## Validation Checklist

- [ ] Encryption uses random IV per operation
- [ ] Vault key never persisted
- [ ] Passphrase normalized before use
- [ ] Constant-time comparison for secrets
- [ ] Thread keys use sorted UUIDs
- [ ] Defense policies correctly enforced

---

**Agent Type:** Security Specialist
**Complexity Level:** Very High
**Context Usage:** 40-50k tokens typical
