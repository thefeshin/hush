# HUSH Documentation

> Zero-Knowledge Encrypted Chat Vault

---

## Quick Links

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview and quick start |
| [CLAUDE.md](../CLAUDE.md) | AI assistant context |

---

## Architecture

| Document | Description |
|----------|-------------|
| [SYSTEM_DESIGN.md](./architecture/SYSTEM_DESIGN.md) | Complete system architecture and design decisions |

---

## Deployment

| Document | Description |
|----------|-------------|
| [PRODUCTION_CHECKLIST.md](./deployment/PRODUCTION_CHECKLIST.md) | Pre-flight checklist for production |
| [DOCKER_DEPLOYMENT.md](./deployment/DOCKER_DEPLOYMENT.md) | Docker setup and management guide |
| [SSL_SETUP.md](./deployment/SSL_SETUP.md) | SSL/TLS certificate configuration |

---

## Operations

| Document | Description |
|----------|-------------|
| [BACKUP_RESTORE.md](./operations/BACKUP_RESTORE.md) | Database backup and restore procedures |
| [TROUBLESHOOTING.md](./operations/TROUBLESHOOTING.md) | Common issues and solutions |

---

## Directory Structure

```
docs/
├── README.md                    # This file (navigation hub)
├── architecture/
│   └── SYSTEM_DESIGN.md         # System architecture
├── deployment/
│   ├── PRODUCTION_CHECKLIST.md  # Production checklist
│   ├── DOCKER_DEPLOYMENT.md     # Docker guide
│   └── SSL_SETUP.md             # SSL/TLS guide
└── operations/
    ├── BACKUP_RESTORE.md        # Backup procedures
    └── TROUBLESHOOTING.md       # Troubleshooting guide
```

---

## Contributing

When adding documentation:

1. Place files in the appropriate subdirectory
2. Update this README with links to new documents
3. Follow the existing markdown formatting conventions
4. Keep documents focused on a single topic
