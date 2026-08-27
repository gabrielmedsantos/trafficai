# Roadmap UX — TrafficAI Premium

> Baseado em `trafficai-audit.md` + `benchmark-criativivo-vs-trafficai.md`. Regra: melhorar o que existe, não recriar. Nenhum item aqui envolve trocar banco, quebrar integração ou duplicar funcionalidade — são ajustes/extensões sobre código já em produção. Compilado em 27/08/2026.

Legenda: `[ ]` não iniciada · `[~]` em andamento · `[x]` concluída

---

## Agora (P0) — maior impacto na experiência do dia a dia

> 🎥 = confirmado por vídeo real do Criativivo em 27/08/2026, não só pelo site.

- [x] **🎥 Copiloto de IA acionável** — no Agente (`/agent`), dar 1-2 ferramentas de escrita (pausar campanha, ajustar orçamento) sobre os mesmos endpoints que a Automação já usa no Meta. Replicar o padrão visto no Criativivo: card de sugestão com "Atual → Sugerido", abas Pendente/Aplicada, botão "Aplicar" com confirmação explícita do usuário antes de executar, toast confirmando o resultado. Maior gap real do produto — hoje toda IA é só leitura. *(27/08 — ferramenta `propor_ajuste` + evento SSE `suggestion` + `POST /ai/agent/apply-suggestion`)*
- [x] **🎥 Adicionar controle de campanha Meta (toggle pausar/ativar direto na linha da tabela)** — confirmado que é assim que o Criativivo faz (toggle inline, sem modal). Hoje só existe pro Google Ads no TrafficAI. *(27/08 — `metaService.setCampaignStatus` + `PATCH /meta/campaigns/:id/status`)*
- [x] **🎥 Redesenhar a tabela de Campanhas** com as colunas confirmadas no vídeo deles (Objetivo, Status, Campanha, Data Início, Resultados, CPR, ROAS, Gasto) + ordenação, período, ações em massa. *(27/08 — inclui seleção múltipla + pausar/ativar em lote; paginação client-side 25/página)*
- [x] **Resolver a colisão de nomenclatura Otimizações / Demandas / Agenda / Rotina** — investigação revelou que é mais fundo que nomenclatura (3 telas compartilham dados de tarefas/rotina/calendário). Por decisão do usuário, só o rótulo do menu mudou por ora: "Otimizações" → "Fluxo Semanal". Unificar as 3 telas de fato fica pra uma decisão de produto futura. *(27/08)*
- [x] **Adicionar comparação com período anterior no Dashboard** — delta percentual visualmente destacado em cada KPI card, não só o número absoluto. *(27/08 — reaproveita a mesma agregação client-side, roda mais uma vez pro período anterior)*
- [x] **Dashboard: seção "campanhas que precisam de atenção"** acima do fold, com base nos mesmos sinais que já alimentam os Alertas — hoje essa informação existe (Alertas) mas não aparece resumida no primeiro lugar que o usuário olha. *(27/08 — agrupa alertas não lidos por campanha, linka pra `/alerts`)*
- [x] **Corrigir o bug de agrupamento de alertas de conta** (saldo baixo / pagamento falhou caem em "Sem conta" por falta de JOIN direto em `alerts.account_id`). *(27/08)*
- [ ] **Rotacionar o client_secret do Google OAuth vazado** no Google Cloud Console (decisão adiada pelo usuário em 27/08 — reavaliar).

## Próximo (P1) — grande impacto

- [x] **Conectar Alertas/Insights ao Copiloto**: botão "Perguntar ao Agente sobre isso" nos Alertas e no Insights IA, linkando pro `/agent?q=...` já com o contexto do alerta/análise pré-carregado no prompt. *(27/08)*
- [x] **🎥 Permissão de equipe por funcionalidade** — coluna `users.capabilities` (allow-list explícita; `null` = sem restrição, admins sempre têm acesso total). `requireCapability()` aplicado nos pontos de mutação reais (pausar/ativar campanha Meta, pausar/ativar campanha Google, chat + aplicar sugestão do Agente IA). UI de checkboxes em `/team` pro admin restringir por membro; Sidebar/Agente/toggle de Campanhas respeitam a permissão no frontend. *(27/08 — enforcement de leitura pra Dados Compilados/Métricas/Alerta de Saldo/Compartilhar Dashboard/Conexões WhatsApp ficou só como opção configurável, sem gate de backend — nenhuma dessas telas tinha qualquer gate de role hoje, então o escopo focou nas ações que executam mutação real)*
- [x] **🎥 Seletor "Nível de Conta" vs. "Nível de Campanha" na configuração de relatório WhatsApp** — `report_settings.report_level` (`auto` default/preserva comportamento atual, `account` força número agregado único, `campaign` sempre detalha por objetivo). Segmented control no tab Configuração de `/reports/whatsapp`; preview ao vivo já reflete a escolha. *(27/08 — escopo ficou no detalhamento por objetivo que já existe, não curadoria de campanhas individuais dentro do nível de campanha — o Criativivo permite escolher exatamente quais campanhas aparecem, o TrafficAI mostra todos os objetivos ativos no período)*
- [x] **🎥 Prévia ao vivo no editor de template (relatório WhatsApp)** — já existia (`/reports/whatsapp`, tab Preview). *(27/08 — investigação achou que a metade "alerta de saldo" desse item parte de uma premissa que não existe no TrafficAI: ver nota abaixo)*
- [x] **Log de auditoria básico** (quem mudou o quê, quando) — tabela `audit_log` + `recordAudit()` chamado nos pontos de mutação real: pausar/ativar campanha Meta/Google, sugestão do Agente IA aplicada, criar/editar/remover membro do time. Tela `/audit-log` (admin-only) com filtro por ação. *(27/08 — escopo ficou nas ações que já são as mais sensíveis de uma ferramenta multiusuário; não cobre toda mutação do sistema, ex: mudanças de configuração de relatório/financeiro)*
- [ ] **Suporte a toque no Board (Kanban)** — hoje só funciona com mouse (drag-and-drop HTML5 nativo); adicionar fallback de toque ou pelo menos um menu de "mover pra coluna X" acessível por toque.
- [ ] **Campo de responsável/dono nos cards do Board** — permitir visão "minhas tarefas".
- [x] **Busca com debounce em Clientes** — 350ms de debounce antes de disparar a busca. *(27/08)*
- [x] **Carregar as abas do drawer de Clientes sob demanda**, não todas de uma vez ao abrir a linha. *(27/08)*
- [x] **Padronizar badges de status** (Contas usa cor inline, resto do app usa classes `badge-*`) — inconsistência visual na tela mais usada do produto. *(27/08)*
- [x] **Busca na lista principal de Contas** (hoje só existe dentro do modal de gerenciamento em massa). *(27/08)*
- [ ] **Revisar a proposta de CRM editável** (mover lead de etapa / reatribuir vendedor dentro do TrafficAI) vs. manter como camada de relatório sobre o Kommo — decisão de produto, não só de UI.

## Depois (P2) — melhoria importante

- [ ] **Corrigir nomes indevidos de modelo de IA na UI** ("Claude Opus 4.6" na tela do agente, função `callClaude()` no código — o modelo real é OpenAI GPT-4o).
- [ ] **Conectar vídeo dos anúncios na aba Criativos** — `video_id` já é buscado do Meta mas nunca usado; hoje clicar num anúncio de vídeo só abre o Facebook numa aba nova. Aplicar o mesmo padrão de "Assistir" já implementado na página pública de relatório (26/08/2026).
- [ ] **Habilitar upload de imagem/vídeo na aba "Analisar texto manual"** de Criativos — o backend já suporta análise de mídia em base64, só falta a UI.
- [ ] **Persistir/histórico da análise de Top Criativos** (hoje não salva nada, sem comparação semana a semana).
- [ ] **Consertar o campo `scope` morto na Automação** (existe no modelo, nunca é lido) — decidir se implementa avaliação por conta inteira ou remove o campo.
- [ ] **Fazer "notificar apenas" na Automação realmente notificar** (hoje só grava log silencioso).
- [ ] **Mostrar trilha de auditoria de regras de automação na UI** (`action_success`/`action_error` já existem no banco, só não aparecem na tela).
- [ ] **Adicionar seletor de período customizável nas métricas do Google Ads** (hoje fixo em 30 dias desde o último sync).
- [ ] **Consolidar a lógica de classificação de objetivo** (`AWARENESS_OBJECTIVES`/`TRAFFIC_OBJECTIVES`/`MESSAGE_OBJECTIVES` está duplicada em pelo menos 2 arquivos backend) num módulo compartilhado — evita as duas listas saírem de sincronia no futuro.
- [ ] **Corrigir o texto de estado vazio do Onboarding** ("48 tarefas" → "54 tarefas").
- [ ] **Decidir o destino da biblioteca `/templates`** (categorias daily_report/weekly_report/monthly_report/billing_alert) — investigação de 27/08 achou que a tabela `message_templates` não é lida por NENHUM envio real: o relatório diário usa `report_settings.daily_whatsapp_template` (sistema separado, já com preview), semanal/mensal têm a mensagem hardcoded em `weekly-monthly-report.worker.ts`, e o alerta de saldo é hardcoded em `smart-alerts.service.ts`. Antes de adicionar preview (ou qualquer polish) aqui, decidir: conectar de verdade essas 3 categorias aos envios reais, ou remover a tela pra não sugerir uma customização que não tem efeito. Usuário optou em 27/08 por adiar essa decisão.
- [ ] **🎥 Reorganizar `TEMPLATE_VARIABLES` em categorias pesquisáveis** (Meta/Google × tipo de métrica), como o seletor de variável visto no Criativivo — hoje é uma lista fixa sem busca nem agrupamento.
- [ ] **🎥 Agendamento por dia da semana + horário no Alerta de Saldo**, e um botão "Testar Alerta" antes de ativar de verdade.

## Futuro (P3) — polimento

- [ ] Endpoint de bulk real pra ativar/desativar contas em massa (hoje é um loop client-side de chamadas individuais, falhas engolidas silenciosamente).
- [ ] Estado de erro visível no Dashboard (hoje falha de carregamento é só `console.error`, página renderiza zerada sem avisar).
- [ ] Refatorar `tracking/page.tsx` (3.214 linhas) em componentes por aba — funciona bem hoje, mas é o maior arquivo do frontend e cresce o risco de regressão a cada mudança.
- [ ] Remover ~130 linhas de componente morto em `team/page.tsx` (`MemberDetailModal`, substituído mas nunca removido).
- [ ] Corrigir inconsistência de senha em texto plano no formulário de link compartilhável (`comercial/share-links/page.tsx`, campo usa `type="text"` em vez de `type="password"`).
- [ ] Renomear internamente `comercial/team` ("Vendedores") vs. `team` ("Time") pra deixar claro que medem coisas diferentes.
- [ ] Investigar dado "Mock" vazando na UI de gestão de vendedores (`external_source === 'manual'` rotulado literalmente como "Mock").
- [ ] Endpoint agregado de Dashboard no servidor (hoje agrega N chamadas de insight no navegador) — melhoria de performance, não de UX visível a curto prazo.

---

## Sobre o "Copiloto do Gestor de Tráfego" (item 18 do briefing)

TrafficAI já tem os 3 blocos que compõem essa visão, só não conectados:
1. **Analisar** — já existe (Insights IA, Agente, Automação todos leem os mesmos dados).
2. **Identificar problema / oportunidade** — já existe (Alertas + diagnóstico de IA).
3. **Recomendar** — já existe como texto (Alertas têm dica embutida, Insights IA tem "Ação Recomendada").
4. **Permitir execução** — **não existe em lugar nenhum** hoje. Nenhuma tela tem um botão que, a partir de uma recomendação de IA, efetivamente pausa campanha ou muda orçamento — mesmo a Automação (que executa ações reais) não é disparada a partir de uma recomendação de IA, são sistemas paralelos.

Caminho recomendado, sem rebuild: dar ao Agente (`/agent`, que já tem infraestrutura de streaming + tool-calling) 1–2 ferramentas de ESCRITA (pausar campanha, ajustar orçamento) reaproveitando os mesmos endpoints que a Automação já usa no Meta — com confirmação explícita do usuário antes de qualquer execução, nunca automático nessa fase inicial.
