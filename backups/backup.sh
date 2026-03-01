#!/bin/bash
# Backup bball-stats Turso database to local SQL file
# Run from WSL: bash /mnt/c/Users/beaub/dev/bball-stats/backup.sh

DB_NAME="bball-stats"
BACKUP_DIR="/mnt/c/Users/beaub/dev/bball-stats/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="bball-stats-backup-${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "Backing up ${DB_NAME}..."
turso db shell "$DB_NAME" .dump > "${BACKUP_DIR}/${FILENAME}"

if [ $? -eq 0 ] && [ -s "${BACKUP_DIR}/${FILENAME}" ]; then
  SIZE=$(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1)
  echo "Saved: ${BACKUP_DIR}/${FILENAME} (${SIZE})"

  # Keep only the 10 most recent backups
  ls -t "${BACKUP_DIR}"/bball-stats-backup-*.sql | tail -n +11 | xargs -r rm
  echo "Done."
else
  echo "Backup failed!"
  rm -f "${BACKUP_DIR}/${FILENAME}"
  exit 1
fi
