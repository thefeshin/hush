# Workflows Category Index - HUSH

## Purpose
Entry point for workflow-related navigation and task classification

## Categories Available

| Category | Description | When to Use |
|----------|-------------|-------------|
| **Security & Cryptography** | Authentication, encryption, key derivation, defense | When working with auth, encryption, or security features |
| **Messaging & Communication** | Message flow, real-time WebSocket | When implementing messaging or real-time features |
| **User Experience** | Identity, PWA, client storage | When building frontend features or offline support |
| **Infrastructure** | Deployment, Docker, CLI | When deploying or managing infrastructure |

## Workflow Quick Reference

| Workflow | Category | Complexity | Primary File |
|----------|----------|------------|--------------|
| [authentication](../../context/workflows/authentication.md) | Security | MEDIUM | `backend/app/routers/auth.py` |
| [vault_key_derivation](../../context/workflows/vault_key_derivation.md) | Security | HIGH | `frontend/src/crypto/kdf.ts` |
| [thread_encryption](../../context/workflows/thread_encryption.md) | Security | HIGH | `frontend/src/crypto/thread-key.ts` |
| [defense_system](../../context/workflows/defense_system.md) | Security | HIGH | `backend/app/services/defense.py` |
| [message_flow](../../context/workflows/message_flow.md) | Messaging | HIGH | `frontend/src/services/api.ts` |
| [realtime_communication](../../context/workflows/realtime_communication.md) | Messaging | HIGH | `frontend/src/services/websocket.ts` |
| [identity_setup](../../context/workflows/identity_setup.md) | UX | MEDIUM | `frontend/src/components/IdentitySetup.tsx` |
| [pwa_lifecycle](../../context/workflows/pwa_lifecycle.md) | UX | MEDIUM | `frontend/vite.config.ts` |
| [client_storage](../../context/workflows/client_storage.md) | UX | MEDIUM | `frontend/src/services/storage.ts` |
| [deployment](../../context/workflows/deployment.md) | Infrastructure | MEDIUM | `cli/main.py` |

## Quick Start

1. Load this category index first (~5k tokens)
2. Identify relevant category
3. Load workflow detail file directly
4. Follow workflow documentation

## Context Budget
- Category Index: ~5k tokens (2.5% of context window)
- Workflow Detail: ~15k tokens each (7.5% of context window)
- Total for typical task: ~20-30k tokens (10-15%)

## Getting Started

```bash
# Load category index first
Read: .claude/indexes/workflows/CATEGORY_INDEX.md

# Then load specific workflow
Read: .claude/context/workflows/[workflow].md

# Or load full workflow index
Read: .claude/context/WORKFLOW_INDEX.md
```

## See Also

- [WORKFLOW_INDEX.md](../../context/WORKFLOW_INDEX.md) - Complete workflow catalog
- [CODE_TO_WORKFLOW_MAP.md](../../context/CODE_TO_WORKFLOW_MAP.md) - File → workflow mapping
