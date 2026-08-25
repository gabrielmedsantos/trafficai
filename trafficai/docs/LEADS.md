# Leads (site de marketing)

Antes de redirecionar pro signup/Stripe, `/marketing` (seção Planos) abre um modal
pedindo nome, email e telefone. Esses dados são enviados pra `POST /api/v1/leads`
(rota pública, sem JWT, sem plan guard — ver `backend/src/leads/leads.controller.ts`)
e o backend repassa pra uma planilha Google Sheets via webhook.

Não existe tabela no banco pra isso — é só um repasse. Se o webhook falhar, o erro
é logado (`logger.error`) mas o usuário **não é bloqueado**: ele segue pro signup
normalmente.

## Configurar a planilha

1. Crie uma Google Sheet nova. Primeira linha (cabeçalho): `Data | Nome | Email | Telefone | Plano`.
2. Extensões → Apps Script. Apague o conteúdo e cole:

```js
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = JSON.parse(e.postData.contents);
  sheet.appendRow([data.date, data.name, data.email, data.phone, data.plan]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Implantar → Nova implantação → tipo "App da Web".
   - Executar como: **Eu** (sua conta)
   - Quem pode acessar: **Qualquer pessoa**
4. Copie a URL do App da Web gerada (termina em `/exec`).
5. Configure no backend: `GOOGLE_SHEETS_LEADS_WEBHOOK_URL=<url>` (`.env` local ou
   variável de ambiente do container em produção) e reinicie o backend.

Sempre que o código do Apps Script for editado, é preciso criar uma **nova
implantação** (ou "Gerenciar implantações → editar → nova versão") pra publicar
a mudança — só salvar o script não atualiza a URL já publicada.

## Payload enviado ao webhook

```json
{
  "date": "2026-08-25T14:32:10.000Z",
  "name": "Fulano",
  "email": "fulano@empresa.com",
  "phone": "+55 11 91234-5678",
  "plan": "pro"
}
```
