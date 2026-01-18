# Agents Category Index - HUSH

## Purpose
Entry point for agent selection matrix

## Agents Available

| Agent | Primary Workflows | Use For |
|-------|------------------|---------|
| **`context-engineer`** | INITIALIZATION | Transform this template, maintain documentation |
| **`core-architect`** | authentication, vault_key_derivation, thread_encryption, defense_system | Encryption architecture, security design |
| **`api-developer`** | message_flow, identity_setup, pwa_lifecycle, client_storage | API endpoints, React components, frontend features |
| **`database-ops`** | defense_system, message_flow | PostgreSQL schema, queries |
| **`integration-hub`** | realtime_communication, message_flow | WebSocket, real-time features |
| **`deployment-ops`** | deployment | Docker, CLI, infrastructure |

## Agent Selection Matrix

| Task Type | Primary Agent | Secondary Agent |
|-----------|---------------|-----------------|
| Encryption/security changes | core-architect | - |
| API endpoint changes | api-developer | database-ops |
| Frontend components | api-developer | - |
| WebSocket/real-time | integration-hub | api-developer |
| Database schema | database-ops | core-architect |
| Deployment/Docker | deployment-ops | - |
| Documentation | context-engineer | - |

## Quick Start

1. Load this category index first (~5k tokens)
2. Identify relevant agent from matrix above
3. Load agent definition for detailed capabilities
4. Use agent for specific tasks

## Context Budget
- Category Index: ~5k tokens (2.5% of context window)
- Agent Definition: ~10k tokens (5% of context window)
- Agent Session: ~50k tokens (25% of context window)

## Agent Locations

```
.claude/agents/
├── context-engineer.md   # Documentation & initialization
├── core-architect.md     # Security & encryption
├── api-developer.md      # API & frontend
├── database-ops.md       # Database operations
├── integration-hub.md    # Real-time & integrations
└── deployment-ops.md     # Infrastructure & deployment
```

## Getting Started

```bash
# Load category index first
Read: .claude/indexes/agents/CATEGORY_INDEX.md

# Then load relevant agent definition
Read: .claude/agents/[agent].md
```

## See Also

- [core-architect.md](../../agents/core-architect.md) - Security specialist
- [api-developer.md](../../agents/api-developer.md) - API/frontend specialist
- [deployment-ops.md](../../agents/deployment-ops.md) - Infrastructure specialist
