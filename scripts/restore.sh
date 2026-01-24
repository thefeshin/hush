#!/bin/bash
#
# HUSH Database Restore Script
# Restores the PostgreSQL database from a compressed backup
#
# Usage: ./scripts/restore.sh <backup_file.sql.gz>
#
# WARNING: This will overwrite the current database!
#

set -e

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh ./backups/*.sql.gz 2>/dev/null || echo "  No backups found in ./backups/"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "[HUSH] ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "[HUSH] WARNING: This will overwrite the current database!"
echo "[HUSH] Backup file: $BACKUP_FILE"
read -p "[HUSH] Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "[HUSH] Restore cancelled"
    exit 0
fi

echo "[HUSH] Restoring database from backup..."

# Drop and recreate database to ensure clean state
docker-compose exec -T postgres psql -U hush -d postgres -c "DROP DATABASE IF EXISTS hush;"
docker-compose exec -T postgres psql -U hush -d postgres -c "CREATE DATABASE hush OWNER hush;"

# Restore from backup
gunzip -c "$BACKUP_FILE" | docker-compose exec -T postgres psql -U hush -d hush

echo "[HUSH] Database restored successfully"
echo "[HUSH] NOTE: You may need to restart the backend service"
