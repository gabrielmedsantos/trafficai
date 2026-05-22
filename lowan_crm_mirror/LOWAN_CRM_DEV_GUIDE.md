# Lowan CRM — Guia de Deploy (2 devs)

## Arquivos críticos (NÃO sobrescrever sem verificar)

Os seguintes arquivos têm patches manuais que NÃO estão no código-fonte TypeScript.
Se fizer deploy/build, os patches serão perdidos.

### Backend (containers: wablast_api + wablast_worker)
| Arquivo | Features adicionadas |
|---------|---------------------|
| `/app/dist/modules/leads/leads.service.js` | sendTemplateReply, sendDocumentReply, normalizePhoneForMeta, redistribute com scope/limit, Redis dashboard cache, since delta loading |
| `/app/dist/modules/leads/leads.controller.js` | redistribute com leadIds+limit, since param |
| `/app/dist/modules/flows/flows.service.js` | Flow executor completo, analytics, node-metrics |
| `/app/dist/modules/flows/flows.routes.js` | Rotas analytics + node-metrics |
| `/app/dist/modules/broadcasts/broadcasts.service.js` | Sistema de disparos completo (WA+TG) |
| `/app/dist/modules/broadcasts/broadcasts.routes.js` | Rotas CRUD + start/pause/stats |
| `/app/dist/queue/processors/webhook.processor.js` | Hooks: flow events, broadcast→flow reply, button detection |
| `/app/dist/modules/scheduled-messages/scheduled-messages.service.js` | Dispatcher com template + document support |
| `/app/dist/services/whatsapp/cloud-api.service.js` | sendDocument, sendTemplate |

### Frontend (container: wablast_frontend)
| Arquivo | Features |
|---------|----------|
| `/usr/share/nginx/html/leads/index.html` | Disparos, agendamento de msg, dashboard filters, redistribute com scope+limit, aba Automações |
| `/usr/share/nginx/html/flows/index.html` | Editor visual de fluxos, analytics com node badges |

## Backup automático

Snapshots são salvos automaticamente a cada 6h em `/root/lowan_dist_backup/` (git).

### Comandos úteis:
```bash
# Criar snapshot manual antes de fazer qualquer alteração
bash /root/lowan_dist_backup/backup.sh "antes de deploy do [nome]"

# Ver histórico de snapshots
bash /root/lowan_dist_backup/restore.sh

# Restaurar um snapshot específico
bash /root/lowan_dist_backup/restore.sh <hash>

# Ver diferenças entre produção e último snapshot
cd /root/lowan_dist_backup
docker cp wablast_api:/app/dist/modules/leads/leads.service.js /tmp/current.js
diff /tmp/current.js api/modules/leads/leads.service.js
```

## Regra de ouro
**ANTES de fazer deploy ou docker-compose up, SEMPRE rode:**
```bash
bash /root/lowan_dist_backup/backup.sh "antes de deploy"
```

## Após build/deploy TypeScript
Se fizer `docker-compose up --build`, os patches serão perdidos. Restaure com:
```bash
bash /root/lowan_dist_backup/restore.sh $(cd /root/lowan_dist_backup && git log --oneline -1 | cut -d  -f1)
```
