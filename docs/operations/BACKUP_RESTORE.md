# HUSH Backup & Restore Guide

> Database backup and restore procedures for HUSH vault

---

## Overview

HUSH stores all data in PostgreSQL. While message content is encrypted and unreadable without the 12-word passphrase, backing up the database is essential for:

- Disaster recovery
- Migration to new infrastructure
- Point-in-time recovery

**Important:** Backups contain encrypted data only. The 12-word passphrase is never stored and must be preserved separately.

---

## Backup Procedures

### Automated Backup

Use the provided backup script:

```bash
./scripts/backup.sh
```

This script:
1. Creates a compressed SQL dump
2. Saves to `./backups/` directory
3. Automatically cleans up backups older than 7 days

### Manual Backup

```bash
# Create backup directory
mkdir -p ./backups

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T postgres pg_dump -U hush -d hush | gzip > "./backups/hush_backup_${TIMESTAMP}.sql.gz"
```

### Backup to Remote Location

```bash
# Create backup and copy to remote server
./scripts/backup.sh
scp ./backups/hush_backup_*.sql.gz user@remote-server:/path/to/backups/
```

### Scheduled Backups (Cron)

Add to crontab for automated daily backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /path/to/hush && ./scripts/backup.sh >> /var/log/hush-backup.log 2>&1
```

---

## Restore Procedures

### Standard Restore

Use the provided restore script:

```bash
./scripts/restore.sh ./backups/hush_backup_20240115_020000.sql.gz
```

This script:
1. Prompts for confirmation
2. Drops and recreates the database
3. Restores from the backup file

### Manual Restore

```bash
# Stop the backend to prevent conflicts
docker-compose stop backend

# Drop and recreate database
docker-compose exec -T postgres psql -U hush -d postgres -c "DROP DATABASE IF EXISTS hush;"
docker-compose exec -T postgres psql -U hush -d postgres -c "CREATE DATABASE hush OWNER hush;"

# Restore from backup
gunzip -c ./backups/hush_backup_20240115_020000.sql.gz | docker-compose exec -T postgres psql -U hush -d hush

# Restart backend
docker-compose start backend
```

---

## Backup Verification

### Check Backup Integrity

```bash
# List backup contents without extracting
gunzip -l ./backups/hush_backup_*.sql.gz

# Verify backup can be decompressed
gunzip -t ./backups/hush_backup_20240115_020000.sql.gz && echo "Backup is valid"
```

### Test Restore (Recommended)

Before relying on backups, test the restore process:

1. Set up a test environment
2. Restore the backup
3. Verify the application works with the restored data

---

## Backup Storage Best Practices

### Retention Policy

The default script keeps backups for 7 days. Adjust as needed:

```bash
# In backup.sh, change the retention period
find "$BACKUP_DIR" -name "hush_backup_*.sql.gz" -mtime +30 -delete  # 30 days
```

### Storage Locations

Recommended backup storage strategy:

| Location | Purpose | Retention |
|----------|---------|-----------|
| Local (`./backups/`) | Quick recovery | 7 days |
| Remote server | Disaster recovery | 30 days |
| Cloud storage (S3, etc.) | Long-term archive | 90+ days |

### Encryption at Rest

For additional security, encrypt backups before storing:

```bash
# Encrypt backup with GPG
gpg --symmetric --cipher-algo AES256 ./backups/hush_backup_20240115_020000.sql.gz

# Decrypt when needed
gpg --decrypt ./backups/hush_backup_20240115_020000.sql.gz.gpg > ./backups/hush_backup_20240115_020000.sql.gz
```

---

## What's in a Backup?

A HUSH backup contains:

| Data | Encrypted? | Notes |
|------|------------|-------|
| Thread metadata | Yes | Encrypted with thread keys |
| Messages | Yes | Encrypted with thread keys |
| User identities | N/A | Stored client-side only |
| 12-word passphrase | N/A | Never stored |
| Auth hash | No | SHA-256 hash of passphrase |
| KDF salt | No | Required for key derivation |

**Without the 12-word passphrase, backed-up data cannot be decrypted.**

---

## Disaster Recovery Scenarios

### Scenario 1: Server Failure

1. Provision new server
2. Install Docker and Docker Compose
3. Clone HUSH repository
4. Copy `.env` file from secure storage
5. Restore database from backup
6. Start services: `docker-compose up -d`

### Scenario 2: Database Corruption

1. Stop services: `docker-compose stop`
2. Restore from most recent backup: `./scripts/restore.sh <backup-file>`
3. Restart services: `docker-compose start`

### Scenario 3: Accidental Data Deletion

1. Identify the backup from before deletion
2. Follow standard restore procedure
3. Note: Any data created after the backup will be lost

---

## Troubleshooting

### Backup Fails

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check disk space
df -h

# Run backup with verbose output
docker-compose exec postgres pg_dump -U hush -d hush -v
```

### Restore Fails

```bash
# Check backup file exists and is readable
ls -la ./backups/

# Check backup file integrity
gunzip -t ./backups/hush_backup_*.sql.gz

# Check PostgreSQL logs
docker-compose logs postgres
```

### Permission Issues

```bash
# Ensure scripts are executable
chmod +x ./scripts/backup.sh
chmod +x ./scripts/restore.sh
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Create backup | `./scripts/backup.sh` |
| List backups | `ls -lh ./backups/` |
| Restore backup | `./scripts/restore.sh <file>` |
| Verify backup | `gunzip -t <file>` |
| Clean old backups | `find ./backups -mtime +7 -delete` |
