# Code to Workflow Map - HUSH

**Purpose:** Reverse lookup - find which workflows a file affects
**Use:** After modifying code, check which documentation needs updating
**Last Updated:** 2026-01-18

---

## Quick Reference

When you modify a file, find it below to see which workflow documentation needs updating.

---

## Backend Files

### /backend/app/routers/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `auth.py` | [authentication](./workflows/authentication.md), [defense_system](./workflows/defense_system.md) | HIGH |
| `threads.py` | [message_flow](./workflows/message_flow.md), [thread_encryption](./workflows/thread_encryption.md) | HIGH |
| `messages.py` | [message_flow](./workflows/message_flow.md), [realtime_communication](./workflows/realtime_communication.md) | HIGH |
| `websocket.py` | [realtime_communication](./workflows/realtime_communication.md), [message_flow](./workflows/message_flow.md) | HIGH |
| `health.py` | [deployment](./workflows/deployment.md) | LOW |

### /backend/app/services/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `defense.py` | [defense_system](./workflows/defense_system.md), [authentication](./workflows/authentication.md) | HIGH |
| `websocket.py` | [realtime_communication](./workflows/realtime_communication.md) | MEDIUM |
| `connection_cleanup.py` | [realtime_communication](./workflows/realtime_communication.md) | LOW |
| `heartbeat.py` | [realtime_communication](./workflows/realtime_communication.md) | LOW |

### /backend/app/middleware/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `security.py` | [defense_system](./workflows/defense_system.md), [authentication](./workflows/authentication.md) | HIGH |
| `rate_limit.py` | [defense_system](./workflows/defense_system.md) | MEDIUM |

### /backend/app/utils/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `crypto.py` | [authentication](./workflows/authentication.md) | HIGH |

### /backend/app/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `main.py` | [deployment](./workflows/deployment.md), ALL | HIGH |
| `config.py` | [deployment](./workflows/deployment.md), [defense_system](./workflows/defense_system.md) | HIGH |
| `database.py` | [deployment](./workflows/deployment.md) | MEDIUM |

---

## Frontend Files

### /frontend/src/crypto/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `kdf.ts` | [vault_key_derivation](./workflows/vault_key_derivation.md) | CRITICAL |
| `thread-key.ts` | [thread_encryption](./workflows/thread_encryption.md) | CRITICAL |
| `aes.ts` | [thread_encryption](./workflows/thread_encryption.md), [message_flow](./workflows/message_flow.md) | CRITICAL |
| `identity-key.ts` | [identity_setup](./workflows/identity_setup.md), [client_storage](./workflows/client_storage.md) | HIGH |
| `normalize.ts` | [authentication](./workflows/authentication.md), [vault_key_derivation](./workflows/vault_key_derivation.md) | CRITICAL |
| `encoding.ts` | ALL crypto workflows | MEDIUM |
| `CryptoContext.tsx` | [vault_key_derivation](./workflows/vault_key_derivation.md) | HIGH |

### /frontend/src/components/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `Login.tsx` | [authentication](./workflows/authentication.md) | HIGH |
| `IdentitySetup.tsx` | [identity_setup](./workflows/identity_setup.md) | HIGH |
| `Chat.tsx` | [message_flow](./workflows/message_flow.md) | MEDIUM |
| `ThreadView.tsx` | [message_flow](./workflows/message_flow.md), [thread_encryption](./workflows/thread_encryption.md) | MEDIUM |
| `MessageList.tsx` | [message_flow](./workflows/message_flow.md) | MEDIUM |
| `MessageComposer.tsx` | [message_flow](./workflows/message_flow.md), [thread_encryption](./workflows/thread_encryption.md) | MEDIUM |
| `UUIDShare.tsx` | [identity_setup](./workflows/identity_setup.md) | LOW |
| `InstallBanner.tsx` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | LOW |
| `UpdateBanner.tsx` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | LOW |
| `OfflineIndicator.tsx` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | LOW |
| `ConnectionStatus.tsx` | [realtime_communication](./workflows/realtime_communication.md) | LOW |

### /frontend/src/services/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `api.ts` | [authentication](./workflows/authentication.md), [message_flow](./workflows/message_flow.md) | HIGH |
| `websocket.ts` | [realtime_communication](./workflows/realtime_communication.md) | HIGH |
| `storage.ts` | [client_storage](./workflows/client_storage.md), [identity_setup](./workflows/identity_setup.md) | HIGH |

### /frontend/src/stores/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `authStore.ts` | [authentication](./workflows/authentication.md), [identity_setup](./workflows/identity_setup.md) | HIGH |
| `threadStore.ts` | [message_flow](./workflows/message_flow.md), [thread_encryption](./workflows/thread_encryption.md) | MEDIUM |
| `messageStore.ts` | [message_flow](./workflows/message_flow.md) | MEDIUM |

### /frontend/src/hooks/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `useWebSocket.ts` | [realtime_communication](./workflows/realtime_communication.md) | MEDIUM |
| `useThreadSubscription.ts` | [realtime_communication](./workflows/realtime_communication.md) | MEDIUM |
| `useInstallPrompt.ts` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | LOW |
| `useOnlineStatus.ts` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | LOW |

### /frontend/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `vite.config.ts` | [pwa_lifecycle](./workflows/pwa_lifecycle.md), [deployment](./workflows/deployment.md) | MEDIUM |
| `main.tsx` | [pwa_lifecycle](./workflows/pwa_lifecycle.md) | MEDIUM |
| `App.tsx` | ALL frontend workflows | MEDIUM |

---

## CLI Files

### /cli/

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `main.py` | [deployment](./workflows/deployment.md) | HIGH |
| `prompts.py` | [deployment](./workflows/deployment.md), [defense_system](./workflows/defense_system.md) | HIGH |
| `secrets.py` | [deployment](./workflows/deployment.md), [vault_key_derivation](./workflows/vault_key_derivation.md) | HIGH |
| `config.py` | [deployment](./workflows/deployment.md) | MEDIUM |
| `wordlist.py` | [deployment](./workflows/deployment.md) | LOW |

---

## Infrastructure Files

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `docker-compose.yml` | [deployment](./workflows/deployment.md) | HIGH |
| `nginx/nginx.conf` | [deployment](./workflows/deployment.md) | MEDIUM |
| `backend/Dockerfile` | [deployment](./workflows/deployment.md) | MEDIUM |
| `frontend/Dockerfile` | [deployment](./workflows/deployment.md) | MEDIUM |
| `.env.example` | [deployment](./workflows/deployment.md), [defense_system](./workflows/defense_system.md) | MEDIUM |

---

## Database Schema

| File | Workflows | Update Priority |
|------|-----------|-----------------|
| `backend/app/models/schema.sql` | [message_flow](./workflows/message_flow.md), [defense_system](./workflows/defense_system.md) | CRITICAL |

---

## Update Priority Guide

| Priority | Action Required |
|----------|-----------------|
| **CRITICAL** | MUST update workflow immediately - core functionality |
| **HIGH** | Update workflow in same PR |
| **MEDIUM** | Update workflow before next release |
| **LOW** | Update when convenient |

---

## Post-Change Checklist

After modifying ANY file:

1. Find file in this map
2. Check affected workflows
3. Update line numbers in workflow files
4. Verify function signatures still match
5. Run `/verify-docs-current` for validation
6. Commit doc updates with code changes

---

**Version:** 1.0
**Total Mapped Files:** 50+
