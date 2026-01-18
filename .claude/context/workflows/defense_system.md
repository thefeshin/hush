# Workflow: Defense System

**Complexity:** HIGH
**Primary Agent:** `core-architect`
**Last Updated:** 2026-01-18

---

## Overview

The defense system protects against unauthorized access through IP-based rate limiting, failure tracking, and configurable responses including database destruction.

**Key Principle:** Configurable paranoia levels from simple blocking to total data destruction.

---

## Entry Points

| Entry Point | File | Lines | Trigger |
|-------------|------|-------|---------|
| Security middleware | `backend/app/middleware/security.py` | 15-50 | Every request |
| Defense service | `backend/app/services/defense.py` | 18-120 | Auth failures |
| Rate limiter | `backend/app/middleware/rate_limit.py` | 10-45 | Request throttling |

---

## Call Chain

```
security.py:SecurityMiddleware.__call__()
├─ check_blocked_ip(request.client.host) [services/defense.py:30]
│  └─ SELECT FROM blocked_ips WHERE ip_address = $1
├─ if blocked: return 403 Forbidden
└─ continue to route handler

auth.py:authenticate() [on failure]
├─ defense.record_failure(ip) [services/defense.py:45]
│  ├─ UPSERT auth_failures SET failure_count = failure_count + 1
│  ├─ if failure_count >= MAX_FAILURES:
│  │     execute_policy(ip)
│  └─ if PANIC_MODE:
│        execute_panic()
└─ return 401 Unauthorized

defense.py:execute_policy(ip)
├─ ip_temp: INSERT blocked_ips (expires_at = NOW() + duration)
├─ ip_perm: INSERT blocked_ips (expires_at = NULL)
├─ db_wipe: TRUNCATE threads, messages CASCADE
└─ db_wipe_shutdown: db_wipe + sys.exit(1)

defense.py:execute_panic()
└─ TRUNCATE ALL + shutdown
```

---

## Configuration Options

| Setting | Values | Purpose |
|---------|--------|---------|
| `MAX_AUTH_FAILURES` | 1-100 (default: 5) | Failures before policy triggers |
| `FAILURE_MODE` | ip_temp, ip_perm, db_wipe, db_wipe_shutdown | Response to exceeded failures |
| `IP_BLOCK_DURATION` | Minutes (default: 30) | For ip_temp mode |
| `PANIC_MODE` | true/false | Wipe DB on ANY failure |

---

## Database Operations

| Table | Operation | Purpose |
|-------|-----------|---------|
| `blocked_ips` | READ/WRITE | Store blocked IP addresses |
| `auth_failures` | READ/WRITE | Track failure counts per IP |
| `threads` | DELETE | Wiped in db_wipe mode |
| `messages` | DELETE | Wiped in db_wipe mode |

---

## Key Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| `backend/app/services/defense.py` | Core defense logic | `check_ip()`, `record_failure()`, `execute_policy()` |
| `backend/app/middleware/security.py` | Request interception | `SecurityMiddleware` |
| `backend/app/middleware/rate_limit.py` | Rate limiting | `RateLimitMiddleware` |
| `backend/app/config.py` | Settings | `MAX_AUTH_FAILURES`, `FAILURE_MODE`, etc. |

---

## Failure Modes Explained

### ip_temp (Temporary IP Block)
- Blocks IP for configured duration
- Auto-unblocks after expiry
- Good for preventing brute force

### ip_perm (Permanent IP Block)
- Blocks IP indefinitely
- Requires manual removal
- For persistent attackers

### db_wipe (Database Wipe)
- Deletes all threads and messages
- Server continues running
- Nuclear option for breach detection

### db_wipe_shutdown (Wipe + Shutdown)
- Deletes all data
- Stops the server
- Maximum paranoia mode

### PANIC_MODE
- Triggers on ANY auth failure (not just threshold)
- Immediately wipes and shuts down
- Use only in extreme security scenarios

---

## Security Considerations

1. **IP spoofing** - Consider X-Forwarded-For if behind proxy
2. **Rate limit bypass** - Ensure middleware order is correct
3. **Panic mode** - TEST CAREFULLY before enabling
4. **Log sanitization** - Don't log passphrases

---

## Error Scenarios

| Scenario | Behavior | Resolution |
|----------|----------|------------|
| Legitimate user blocked | IP in blocked_ips | Remove entry manually |
| DB wiped accidentally | PANIC_MODE triggered | Restore from backup (if any) |
| Rate limit too aggressive | Legitimate users throttled | Adjust rate limit settings |

---

## Related Workflows

- [authentication.md](./authentication.md) - Triggers defense on failure
- [deployment.md](./deployment.md) - Configures defense settings

---

## Post-Implementation Checklist

After modifying this workflow:
- [ ] Update line numbers if code changed
- [ ] Test each failure mode in isolation
- [ ] Verify PANIC_MODE behavior
- [ ] Run /verify-docs-current
