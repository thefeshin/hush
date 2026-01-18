# .claude Configuration - HUSH

This directory contains a comprehensive context engineering system for the HUSH repository.

**Configuration Summary**:
- **Agents**: 6 specialized agents (workflow-aligned)
- **Commands**: 5 custom commands
- **Workflows**: 10 documented workflows
- **Context Budget**: 200k tokens max, target <40% utilization
- **Output Budget**: 30k tokens max per response
- **Last Updated**: 2026-01-18

**System Benefits**:
- <40% context utilization (vs 60%+ without this system)
- 10× faster issue resolution with pre-computed knowledge
- Self-maintaining documentation (zero drift)
- Proactive bug discovery through validation

---

## Table of Contents

1. [Agent Architecture](#agent-architecture)
2. [Custom Commands](#custom-commands)
3. [Context Documentation](#context-documentation)
4. [RPI Workflow](#rpi-workflow)
5. [Quick Start Guide](#quick-start-guide)
6. [Self-Maintaining Documentation](#self-maintaining-documentation)

---

## Agent Architecture

### Specialized Agents (Workflow-Aligned)

| Agent | Primary Workflows | Use For |
|-------|------------------|---------|
| `context-engineer` | INITIALIZATION | Transform templates, maintain docs |
| `core-architect` | authentication, vault_key_derivation, thread_encryption, defense_system | Security & encryption architecture |
| `api-developer` | message_flow, identity_setup, pwa_lifecycle, client_storage | API endpoints, React components |
| `database-ops` | defense_system, message_flow | PostgreSQL schema, queries |
| `integration-hub` | realtime_communication, message_flow | WebSocket, real-time features |
| `deployment-ops` | deployment | Docker, CLI, infrastructure |

**Agent Location:** `.claude/agents/*.md`

---

## Custom Commands

### RPI Workflow Commands (3)
| Command | Description |
|---------|-------------|
| `/rpi-research` | Research phase - codebase exploration |
| `/rpi-plan` | Plan phase - implementation blueprint |
| `/rpi-implement` | Implement phase - execution with doc updates |

### Validation Commands
| Command | Description |
|---------|-------------|
| `/validate-all` | Complete validation suite |
| `/verify-docs-current` | Documentation freshness validation |

**Command Location:** `.claude/commands/*.md`

---

## Context Documentation

### 3-Level Chain-of-Index Architecture

**Purpose:** Minimize context usage through progressive loading

**Level 1 - Category Indexes (5 files in `indexes/`):**
| Category | Purpose | Load When |
|----------|---------|-----------|
| `workflows/CATEGORY_INDEX.md` | Workflow categories | Starting workflow task |
| `code/CATEGORY_INDEX.md` | Domain × Layer overview | Finding code files |
| `search/CATEGORY_INDEX.md` | Search strategies | Low-level debugging |
| `agents/CATEGORY_INDEX.md` | Agent selection matrix | Choosing agent |
| `routing/CATEGORY_INDEX.md` | Task routing | Classifying task type |

**Level 2 - Domain Indexes:** See `indexes/workflows/*.md`, `indexes/code/*.md`

**Level 3 - Detail Files:** workflows/, agents/, commands/

### Pre-Computed Knowledge

| File | Purpose |
|------|---------|
| `ARCHITECTURE_SNAPSHOT.md` | High-level system map |
| `CODE_TO_WORKFLOW_MAP.md` | File → workflow reverse lookup |
| `KNOWN_GOTCHAS.md` | Documented fixes and lessons (16 gotchas) |
| `WORKFLOW_INDEX.md` | Complete workflow catalog |

---

## RPI Workflow

**Research-Plan-Implement** methodology for structured development.

### Phases

1. **RESEARCH** (`/rpi-research`)
   - Use sub-agents to investigate
   - Output: Research document in `research/active/`
   - Context budget: 25-30%

2. **PLAN** (`/rpi-plan`)
   - Create implementation blueprint with file:line precision
   - Output: Plan document in `plans/active/`
   - Context budget: 20-25%

3. **IMPLEMENT** (`/rpi-implement`)
   - Execute with atomic changes
   - ONE CHANGE → ONE TEST → ONE COMMIT
   - Update documentation (mandatory)
   - Context budget: 30-40%

### Directory Structure

```
.claude/
├── research/
│   ├── active/           # Current research
│   ├── completed/        # Archived research
│   └── RESEARCH_TEMPLATE.md
├── plans/
│   ├── active/           # Current plans
│   ├── completed/        # Archived plans
│   └── PLAN_TEMPLATE.md
├── context/
│   ├── WORKFLOW_INDEX.md     # Primary entry point
│   ├── CODE_TO_WORKFLOW_MAP.md
│   ├── ARCHITECTURE_SNAPSHOT.md
│   ├── KNOWN_GOTCHAS.md
│   └── workflows/            # 10 workflow detail files
├── indexes/
│   ├── workflows/        # Workflow category indexes
│   ├── code/            # Code domain indexes
│   ├── agents/          # Agent selection indexes
│   ├── routing/         # Task routing indexes
│   └── search/          # Search pattern indexes
├── agents/              # 6 specialized agent definitions
└── commands/            # 5 custom command definitions
```

---

## Quick Start Guide

### 1. Session Initialization
```bash
# Load workflow index (~15k tokens)
Read: .claude/context/WORKFLOW_INDEX.md

# Load specific workflows as needed (~15k each)
Read: .claude/context/workflows/[relevant_workflow].md
```

### 2. Debugging an Issue
```
1. Scan WORKFLOW_INDEX.md → Find relevant workflow
2. Load workflow file → Get file:line references
3. Check KNOWN_GOTCHAS.md for related issues
4. Fix issue with complete context
5. Update documentation (CODE_TO_WORKFLOW_MAP guides)
6. Run /verify-docs-current
```

### 3. Implementing a Feature
```
1. Run /rpi-research → Explore codebase
2. Run /rpi-plan → Create implementation blueprint
3. Run /rpi-implement → Execute with doc updates
```

---

## Self-Maintaining Documentation

### Automatic Documentation Updates

After every code change, update documentation:

1. Check `CODE_TO_WORKFLOW_MAP.md` for affected workflows
2. Update workflow files with new line numbers
3. Verify function signatures match code
4. Update diagrams if architecture changed
5. Run `/verify-docs-current` for validation
6. Commit documentation updates with code changes

### Post-Implementation Checklist (Embedded in All Agents)

```markdown
## Post-Implementation Checklist

**MANDATORY:** After making ANY code changes, update documentation.

1. Check CODE_TO_WORKFLOW_MAP.md for affected workflows
2. Update workflows with new line numbers
3. Verify function signatures match
4. Run /verify-docs-current
5. Commit doc updates with code changes
```

---

## Context Budget Limits

**Hard Caps (Non-Negotiable):**
- **Maximum Context:** 200,000 tokens
- **Maximum Output:** 30,000 tokens per response
- **Target Utilization:** <40% (80,000 tokens)
- **Compaction Trigger:** 35% (70,000 tokens)

**Budget Allocation:**
```
Workflow Indexes:      ~15k tokens (7.5%)
Workflow Details:      ~30k tokens (15%)
Active Code:           ~25k tokens (12.5%)
Tool Results:          ~10k tokens (5%)
─────────────────────────────────────────
Typical Session:       ~80k tokens (40%)
Buffer:                ~120k tokens (60%)
```

---

## HUSH-Specific Notes

### Critical Encryption Files (Handle with Care)
- `frontend/src/crypto/kdf.ts` - Argon2id parameters (NEVER CHANGE)
- `frontend/src/crypto/thread-key.ts` - Thread key derivation
- `frontend/src/crypto/aes.ts` - AES-256-GCM encryption
- `frontend/src/crypto/normalize.ts` - Passphrase normalization

### Security Gotchas (MUST READ)
See [KNOWN_GOTCHAS.md](./context/KNOWN_GOTCHAS.md) for 16 documented pitfalls including:
- CRYPTO-001: Passphrase normalization (CRITICAL)
- CRYPTO-002: Argon2 parameters (CRITICAL)
- DEPLOY-001: Salt change = data loss (CRITICAL)
- DEPLOY-002: 12 words shown once (CRITICAL)

---

*Configuration updated: 2026-01-18*
*Version: 1.0.0 (HUSH)*
