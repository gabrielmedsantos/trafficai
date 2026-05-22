#!/usr/bin/env bash
# check-changes.sh — Lista arquivos modificados recentemente nos containers Lowan CRM.
#
# Roda ANTES de editar/deployar pra ver se Gabriel (ou outra pessoa) mexeu na VPS.
# Usa mtime dentro dos containers — pega tanto edicoes via `docker cp` quanto edicoes
# diretas dentro do container.
#
# Uso (na VPS):
#   bash /root/check-changes.sh            # ultimas 24h (padrao)
#   bash /root/check-changes.sh 6          # ultimas 6h
#   bash /root/check-changes.sh 1          # ultima 1h
#   bash /root/check-changes.sh today      # desde 00:00 (hora local da VPS)
#
# Uso (do local via SSH):
#   ssh brokalab "bash /root/check-changes.sh today"

set -e

ARG="${1:-24}"

if [ "$ARG" = "today" ]; then
  NOW=$(date +%s)
  MIDNIGHT=$(date -d "$(date +%Y-%m-%d) 00:00:00" +%s)
  MINS=$(( (NOW - MIDNIGHT) / 60 ))
  HUMAN="hoje (desde $(date -d "@$MIDNIGHT" '+%Y-%m-%d %H:%M %Z'))"
else
  case "$ARG" in
    ''|*[!0-9]*) echo "uso: $0 [horas|today]"; exit 1 ;;
  esac
  MINS=$(( ARG * 60 ))
  HUMAN="ultimas ${ARG}h"
fi

NOW_HUMAN=$(date '+%Y-%m-%d %H:%M %Z')
echo "=== Arquivos modificados — $HUMAN ==="
echo "    (rodado em $NOW_HUMAN, janela = ${MINS} min)"

check() {
  local container=$1 path=$2 label=$3
  printf '\n--- %s  (%s:%s) ---\n' "$label" "$container" "$path"

  if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
    echo "  (container $container nao esta rodando)"
    return
  fi

  local out
  out=$(docker exec "$container" sh -c "
    cd '$path' 2>/dev/null || exit 0
    find . -type f -mmin -$MINS \
      ! -name '*.compress_bak' \
      ! -name '*.bak.*' \
      ! -name '*.map' \
      ! -path '*/node_modules/*' \
      -exec stat -c '%y  %10s  %n' {} + 2>/dev/null \
      | sort
  ")
  if [ -z "$out" ]; then
    echo "  (nada)"
  else
    echo "$out"
  fi
}

check wablast_api      /app/dist                       "API"
check wablast_worker   /app/dist                       "Worker"
check wablast_frontend /usr/share/nginx/html/leads     "Frontend SPA"

echo
echo "=== dica ==="
echo "  arquivos com .bak/.compress_bak/.map foram filtrados."
echo "  pra puxar o que mudou:  bash sync-from-vps.sh  (do diretorio lowan-pkg/)"
