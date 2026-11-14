#!/usr/bin/env sh
# Nightly backup of BrokerDesk: MySQL dump + property photos. Run from the repo root,
# e.g. cron:  15 2 * * *  cd /opt/brokerdesk && ./deploy/backup.sh >> /var/log/brokerdesk-backup.log 2>&1
# Copy the resulting files OFF the server (object storage / another machine).
set -eu
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE="docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml"
mkdir -p "$BACKUP_DIR"

# Consistent InnoDB snapshot without locking tables. The password is read inside the container.
$COMPOSE exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --set-gtid-purged=OFF "$MYSQL_DATABASE"' \
  | gzip > "$BACKUP_DIR/brokerdesk-db-$STAMP.sql.gz"

# Property photos (the api-storage volume).
$COMPOSE exec -T api tar -C /repo/apps/api -czf - storage > "$BACKUP_DIR/brokerdesk-photos-$STAMP.tar.gz"

find "$BACKUP_DIR" -name 'brokerdesk-*' -mtime +"$KEEP_DAYS" -delete
echo "$STAMP backup written to $BACKUP_DIR"
