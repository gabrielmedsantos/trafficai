# Evolution API — Setup para o Dashboard Comercial

## O que é

Servidor de WhatsApp não-oficial baseado em Baileys que o trafficai usa para:

- Pareamento via QR Code (sem precisar de número aprovado pela Meta)
- Receber webhooks de mensagens recebidas/enviadas
- Suportar múltiplos números (1 instância por integração)

Repositório: <https://github.com/EvolutionAPI/evolution-api>

## Pré-requisitos

- DNS apontando `evolution.alfamaxdigital.com.br` para a VPS (76.13.166.123)
- Traefik já rodando com `certresolver=le` configurado para HTTPS automático
- Rede docker `n8n_default` existente (já está)

## Passo 1: Definir a chave de API

Gere uma chave forte (32+ chars):

```bash
openssl rand -hex 32
```

Exemplo de saída: `a8f3c2e1b4d5...`

## Passo 2: Subir o container

Na VPS, em `/root/trafficai/`:

```bash
# Cria .env só pra Evolution
cat > .env.evolution <<EOF
EVOLUTION_API_KEY=cole_aqui_a_chave_gerada
EOF

# Sobe Evolution
docker-compose --env-file .env.evolution -f docker-compose.evolution.yml up -d
```

Aguarda ~30 segundos e confere:

```bash
docker logs evolution-api -f
# Deve aparecer: "🚀 Evolution API v2.x.x running on port 8080"
```

Teste local:

```bash
curl -H "apikey: SUA_CHAVE" http://localhost:8080
# Resposta esperada: {"status":200,"message":"Welcome to Evolution API..."}
```

## Passo 3: Configurar o trafficai-backend

Adicione no `.env` do backend:

```env
EVOLUTION_API_BASE_URL=http://evolution-api:8080
EVOLUTION_API_KEY=cole_aqui_a_chave_gerada
PUBLIC_API_URL=https://api.alfamaxdigital.com.br
```

> `EVOLUTION_API_BASE_URL` usa o nome do container porque os dois estão na mesma rede docker (`n8n_default`).
> `PUBLIC_API_URL` é a URL pública do trafficai backend que o Evolution vai usar como webhook.

Reinicia o backend:

```bash
docker restart trafficai-backend
```

## Passo 4: Conectar pelo dashboard

1. Acessa `app.alfamaxdigital.com.br/comercial/integrations` logado
2. Clica em **"Conectar"** no card WhatsApp (Evolution)
3. Preenche um nome (ex: "WhatsApp Comercial")
4. Vai aparecer o QR Code
5. No celular: **WhatsApp → Aparelhos conectados → Conectar um aparelho** → escaneia
6. Em alguns segundos a integração muda para "Conectado"
7. A partir desse momento, toda mensagem recebida ou enviada do número aparece em `/comercial/conversations` automaticamente

## Manutenção

- **Backup do volume:** `evolution_instances` contém o estado das sessões. Backup com `docker run --rm -v evolution_instances:/data -v $(pwd):/backup alpine tar czf /backup/evolution.tar.gz -C /data .`
- **Limite de instâncias:** sem limite de código, mas cada conexão WhatsApp pesa ~80MB de RAM. Para 10+ números considere subir um Evolution dedicado.
- **Atualização:** `docker-compose -f docker-compose.evolution.yml pull && docker-compose -f docker-compose.evolution.yml up -d`

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| QR não aparece | `EVOLUTION_API_BASE_URL` errado | Verifica logs do trafficai-backend ao criar instância |
| QR aparece mas não conecta | Webhook URL inacessível pra Evolution | `EVOLUTION_API_BASE_URL` e `PUBLIC_API_URL` precisam de DNS válido |
| Conecta mas não recebe msgs | Webhook secret diferente | Verifica `comm_integrations.credentials.webhook_secret` no banco |
| Status fica "connecting" | Sessão WhatsApp expirou | Desconecta no app + reconecta pelo dashboard |
