# Workflow: Authentication

**Complexity:** MEDIUM
**Primary Agent:** `core-architect`
**Last Updated:** 2026-01-18

---

## Overview

The authentication workflow validates the 12-word passphrase against the server-stored hash and issues a JWT token. This is the gateway to all vault operations.

**Key Principle:** Server only stores SHA256 hash - never the passphrase or derived keys.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Login component | `frontend/src/components/Login.tsx` | 15-80 | User submits 12 words |
| Auth API endpoint | `backend/app/routers/auth.py` | 21-55 | POST /api/auth |
| Auth dependency | `backend/app/dependencies/auth.py` | 10-40 | JWT validation |

---

## Call Chain

```
Login.tsx:handleSubmit()
├─ normalize(words) [crypto/normalize.ts:5]
├─ api.authenticate(normalized) [services/api.ts:20]
│  └─ POST /api/auth {passphrase: normalized}
│     └─ auth.py:authenticate()
│        ├─ SHA256(passphrase) [utils/crypto.py:15]
│        ├─ constant_time_compare(hash, AUTH_HASH) [utils/crypto.py:25]
│        ├─ defense.check_ip(request) [services/defense.py:30]
│        └─ create_jwt(payload) [routers/auth.py:45]
└─ authStore.setToken(jwt) [stores/authStore.ts:20]
```

---

## Database Operations

| Table | Operation | Purpose |
|-------|-----------|---------|
| `auth_failures` | READ/WRITE | Track failed attempts per IP |
| `blocked_ips` | READ | Check if IP is blocked |

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `frontend/src/components/Login.tsx` | UI for passphrase entry | `handleSubmit()` |
| `frontend/src/crypto/normalize.ts` | Word normalization | `normalize()` |
| `frontend/src/services/api.ts` | API client | `authenticate()` |
| `backend/app/routers/auth.py` | Auth endpoint | `authenticate()` |
| `backend/app/utils/crypto.py` | Hash utilities | `sha256_hash()`, `constant_time_compare()` |
| `backend/app/services/defense.py` | IP blocking | `check_ip()`, `record_failure()` |

---

## Security Considerations

1. **Normalization is critical** - lowercase, trim, single spaces
2. **Constant-time comparison** - prevents timing attacks
3. **Defense integration** - failed auths trigger IP tracking
4. **No rate limiting bypass** - all requests checked

---

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Wrong passphrase | Check normalization, verify words |
| 403 Forbidden | IP blocked | Wait for expiry or check defense logs |
| 500 Server Error | DB connection | Check PostgreSQL container |

---

## Related Workflows

- [vault_key_derivation.md](./vault_key_derivation.md) - Happens after successful auth
- [defense_system.md](./defense_system.md) - Handles auth failures

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Verify hash comparison is constant-time
- [ ] Test with wrong passphrase (should trigger defense)
- [ ] Run /verify-docs-current
