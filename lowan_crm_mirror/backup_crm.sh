#!/bin/bash
set -e

BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "[$(date)] Iniciando backup CRM..."

# 1. Banco de dados
docker exec wablast_postgres pg_dump -U postgres whatsapp_blast | gzip > "$BACKUP_DIR/db_${DATE}.sql.gz"
echo "[$(date)] ✓ Banco: db_${DATE}.sql.gz ($(du -sh $BACKUP_DIR/db_${DATE}.sql.gz | cut -f1))"

# 2. Backend (dist + src + prisma)
tar -czf "$BACKUP_DIR/backend_${DATE}.tar.gz" -C /root/whatsapp-blast dist src prisma package.json Dockerfile Dockerfile.worker
echo "[$(date)] ✓ Backend: backend_${DATE}.tar.gz ($(du -sh $BACKUP_DIR/backend_${DATE}.tar.gz | cut -f1))"

# 3. Frontend
docker cp wablast_frontend:/usr/share/nginx/html/leads/index.html "$BACKUP_DIR/frontend_${DATE}.html"
echo "[$(date)] ✓ Frontend: frontend_${DATE}.html ($(du -sh $BACKUP_DIR/frontend_${DATE}.html | cut -f1))"

# 4. Manter apenas os últimos 7 de cada tipo
ls -t "$BACKUP_DIR"/db_*.sql.gz 2>/dev/null | tail -n +8 | xargs rm -f
ls -t "$BACKUP_DIR"/backend_*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f
ls -t "$BACKUP_DIR"/frontend_*.html 2>/dev/null | tail -n +8 | xargs rm -f

echo "[$(date)] Backup concluído. Total: $(du -sh $BACKUP_DIR | cut -f1)"
