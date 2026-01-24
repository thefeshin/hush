#!/bin/bash
#
# HUSH Database Backup Script
# Creates a compressed backup of the PostgreSQL database
#
# Usage: ./scripts/backup.sh
# Environment: BACKUP_DIR (optional, defaults to ./backups)
#

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="hush_backup_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[HUSH] Starting database backup..."

# Create backup
docker-compose exec -T postgres pg_dump -U hush -d hush | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# Verify backup was created and has content
if [ -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo "[HUSH] Backup created: $BACKUP_DIR/$BACKUP_FILE ($SIZE)"
else
    echo "[HUSH] ERROR: Backup file is empty or not created"
    rm -f "$BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi

# Clean up backups older than 7 days
DELETED=$(find "$BACKUP_DIR" -name "hush_backup_*.sql.gz" -mtime +7 -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
    echo "[HUSH] Cleaned up $DELETED old backup(s)"
fi

echo "[HUSH] Backup complete"
