# Deploy

## Alvo de produção

- **VPS**: Hostinger Cloud Ubuntu 24.04, IP `76.13.166.123`
- **Rede**: IPv4 + IPv6 (`2a02:4780:6e:bead::1/48`)
- **DNS**: Cloudflare, modo DNS-only (sem proxy laranja) para que os certificados Let's Encrypt sejam emitidos direto no VPS
- **Reverse proxy**: Traefik (já instalado com n8n na mesma máquina)
- **Cert resolver**: `mytlschallenge` (TLS-ALPN01 via Let's Encrypt)
- **Banco**: Supabase direct (IPv6) — projeto `dnrymnhramnmqvqvpwim`

## Domínios

| Host | Destino | Container |
|------|---------|-----------|
| `api.alfamaxdigital.com.br` | porta 3001 | `trafficai-backend` |
| `app.alfamaxdigital.com.br` | porta 3002 | `trafficai-frontend` |

## `docker-compose.yml`

```yaml
services:
  backend:
    build: ./backend
    container_name: trafficai-backend
    restart: unless-stopped
    env_file: ./backend/.env.production
    networks:
      - traefik_net
      - ipv6_net
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=n8n_default"
      - "traefik.http.routers.trafficai-api.rule=Host(`api.alfamaxdigital.com.br`)"
      - "traefik.http.routers.trafficai-api.entrypoints=websecure"
      - "traefik.http.routers.trafficai-api.tls.certresolver=mytlschallenge"
      - "traefik.http.services.trafficai-api.loadbalancer.server.port=3001"

  frontend:
    build:
      context: ./frontend
      args:
        NEXT_PUBLIC_API_URL: https://api.alfamaxdigital.com.br/api/v1
    container_name: trafficai-frontend
    restart: unless-stopped
    networks:
      - traefik_net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.trafficai-app.rule=Host(`app.alfamaxdigital.com.br`)"
      - "traefik.http.routers.trafficai-app.entrypoints=websecure"
      - "traefik.http.routers.trafficai-app.tls.certresolver=mytlschallenge"
      - "traefik.http.services.trafficai-app.loadbalancer.server.port=3002"

networks:
  traefik_net:
    external: true
    name: n8n_default
  ipv6_net:
    external: true
    name: trafficai_ipv6
```

## Rede IPv6 (crítico)

O projeto específico do Supabase só responde no IPv6. Docker por padrão não roteia IPv6 para o container. Solução one-time:

### 1. Habilitar IPv6 no daemon do Docker

`/etc/docker/daemon.json`:
```json
{
  "ipv6": true,
  "fixed-cidr-v6": "fd00::/80"
}
```

```bash
systemctl restart docker
```

### 2. Criar rede externa `trafficai_ipv6`

```bash
docker network create --ipv6 --subnet fd01::/80 trafficai_ipv6
```

### 3. Conectar o backend nas duas redes

Já está no `docker-compose.yml` (acima). A rede `n8n_default` cuida do Traefik (v4) e a `trafficai_ipv6` dá acesso ao Supabase (v6).

## Variáveis de ambiente (backend/.env.production)

Nunca commitar. Essenciais:

```env
NODE_ENV=production
PORT=3001
NODE_TLS_REJECT_UNAUTHORIZED=0
TZ=America/Sao_Paulo

DATABASE_URL=postgresql://postgres:***@db.dnrymnhramnmqvqvpwim.supabase.co:5432/postgres
JWT_SECRET=***

META_APP_ID=***
META_APP_SECRET=***
META_REDIRECT_URI=https://api.alfamaxdigital.com.br/api/v1/auth/meta/callback

OPENAI_API_KEY=***
OPENAI_MODEL=gpt-4o

RESEND_API_KEY=***
RESEND_FROM_EMAIL=relatorios@alfamaxdigital.com.br
AGENCY_NAME=Alfamax Digital

FRONTEND_URL=https://app.alfamaxdigital.com.br

# Google Calendar (para routine)
GOOGLE_CLIENT_ID=***
GOOGLE_CLIENT_SECRET=***
GOOGLE_REDIRECT_URI=https://api.alfamaxdigital.com.br/api/v1/routine/google/callback
```

## Rotina de deploy

### Do zero (VPS novo)

1. Instalar Docker + Docker Compose
2. Instalar Traefik (se não tiver) ou usar um já existente
3. Habilitar IPv6 no Docker (ver acima)
4. Criar rede `trafficai_ipv6` (ver acima)
5. Clonar o repo: `git clone https://github.com/gabrielmedsantos/trafficai.git`
6. Criar `backend/.env.production` com os segredos
7. `docker compose up -d --build`
8. Rodar migrations: `docker exec -it trafficai-backend npm run migrate`
9. Cadastrar domínios `api.` e `app.` no Cloudflare apontando pro IP do VPS (DNS-only)
10. Aguardar Traefik emitir certificados (logs: `docker logs -f traefik`)

### Deploy incremental (o normal)

Do dev local:

```bash
# stage changes
git add ...
git commit -m "..."
git push origin main
```

No VPS:

```bash
cd /root/trafficai
git pull

# backend (se TS mudou)
docker compose build backend
docker compose up -d --no-build

# frontend (se qualquer coisa mudou no frontend)
docker compose build frontend
docker compose up -d --no-build
```

> **Importante**: `docker restart` NÃO recarrega env vars novas. Sempre use `up -d --no-build` para recriar o container.

### Deploy via SFTP (quando SSH direto não der)

Quando a máquina dev está atrás de firewall corporativo e o VPS não consegue ser acessado via CI/CD, usamos `paramiko` em Python para subir arquivos via SFTP e rodar comandos via SSH.

Scripts ad-hoc em `tmp_*.py` (não versionar).

## Tabela de ports abertas no VPS

| Porta | Serviço |
|-------|---------|
| 22 | SSH |
| 80 | HTTP (Traefik redirect para 443) |
| 443 | HTTPS (Traefik) |
| 3001 | backend (interno — não expor) |
| 3002 | frontend (interno — não expor) |

Nada deve escutar diretamente na internet exceto 22, 80, 443.

## Backups

Dois níveis:

1. **Código**: git push para GitHub (`github.com/gabrielmedsantos/trafficai`)
2. **Banco**: Supabase faz backup automático diário (plano Pro). Ajustável no dashboard.
3. **Snapshot da VPS**: tirar snapshot da Hostinger antes de mudanças grandes — prática recomendada pelo user, especialmente quando existem dois devs editando `/app/dist/` em paralelo.
