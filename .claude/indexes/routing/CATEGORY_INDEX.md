# Routing Category Index - HUSH

## Purpose
Entry point for task routing and classification

## Task Types Available

| Task Type | Description | Primary Agent | Start With |
|-----------|-------------|---------------|------------|
| **Feature** | New feature implementation | Varies | /rpi-research |
| **Bug Fix** | Issue resolution | Varies | WORKFLOW_INDEX.md |
| **Security** | Encryption/security changes | core-architect | KNOWN_GOTCHAS.md |
| **Refactor** | Code improvement | Varies | CODE_TO_WORKFLOW_MAP.md |
| **Documentation** | Doc updates | context-engineer | CODE_TO_WORKFLOW_MAP.md |
| **Deployment** | Infrastructure changes | deployment-ops | deployment workflow |

## Task Routing Decision Tree

```
START
│
├─ Is it a SECURITY task (encryption, auth, defense)?
│  └─ YES → Load KNOWN_GOTCHAS.md first, use core-architect
│
├─ Is it a NEW FEATURE?
│  └─ YES → Run /rpi-research → /rpi-plan → /rpi-implement
│
├─ Is it a BUG FIX?
│  └─ YES → Load WORKFLOW_INDEX.md → Find affected workflow → Debug
│
├─ Is it DEPLOYMENT related?
│  └─ YES → Load deployment workflow → use deployment-ops
│
├─ Is it a REFACTOR?
│  └─ YES → Load CODE_TO_WORKFLOW_MAP.md → Identify affected workflows
│
└─ Is it DOCUMENTATION?
   └─ YES → Load CODE_TO_WORKFLOW_MAP.md → Update affected docs
```

## Quick Start by Task Type

### New Feature
```bash
1. /rpi-research [feature description]
2. /rpi-plan [based on research]
3. /rpi-implement [execute plan]
```

### Bug Fix
```bash
1. Read: .claude/context/WORKFLOW_INDEX.md
2. Identify affected workflow from symptoms
3. Read: .claude/context/workflows/[workflow].md
4. Debug using call chain in workflow
```

### Security Change
```bash
1. Read: .claude/context/KNOWN_GOTCHAS.md
2. Check for relevant gotchas FIRST
3. Read: .claude/context/workflows/[security_workflow].md
4. Proceed with extreme caution
```

### Refactoring
```bash
1. Read: .claude/context/CODE_TO_WORKFLOW_MAP.md
2. Identify all affected workflows
3. Update docs alongside code
4. Run: /verify-docs-current
```

## Context Budget
- Category Index: ~5k tokens (2.5% of context window)
- Routing Decision: ~5k tokens (2.5% of context window)
- Implementation: ~40k tokens (20% of context window)

## Getting Started

```bash
# Load category index first
Read: .claude/indexes/routing/CATEGORY_INDEX.md

# Then follow routing for your task type
# See decision tree above
```

## Critical Reminders

1. **ALWAYS check KNOWN_GOTCHAS.md for security tasks**
2. **ALWAYS update documentation after code changes**
3. **Use RPI workflow for features** (/rpi-research → /rpi-plan → /rpi-implement)
4. **Run /verify-docs-current after changes**

## See Also

- [WORKFLOW_INDEX.md](../../context/WORKFLOW_INDEX.md) - All workflows
- [KNOWN_GOTCHAS.md](../../context/KNOWN_GOTCHAS.md) - Common pitfalls
- [CODE_TO_WORKFLOW_MAP.md](../../context/CODE_TO_WORKFLOW_MAP.md) - Reverse lookup
