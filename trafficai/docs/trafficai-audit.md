# Auditoria TrafficAI — Estado Atual

> Levantamento completo do que já existe no produto, tela por tela, antes de qualquer redesenho. Objetivo: nunca recriar algo que já está implementado — só descobrir como deixar melhor. Compilado em 27/08/2026.

---

## Dashboard

**Arquivo:** `frontend/src/app/dashboard/page.tsx` (761 linhas)

**O que existe:**
- Header: saudação, seletor de "objetivo" (Mensagens/Conversões/Leads/Tráfego/Reconhecimento/Engajamento — auto-detectado pelas campanhas da conta, linhas 93–227), seletor de período (7 presets + custom, 46–60), CTA "Conectar Meta" se não conectado, botão manual "Sincronizar".
- 6 KPI cards dirigidos pelo objetivo selecionado (594–606) — **sem comparação com período anterior em lugar nenhum**, só o número bruto do período atual.
- 2 gráficos (Recharts): gasto diário em área, e um gráfico de barras dual-métrica por objetivo (609–661).
- Linha inferior: mini-tabela de campanhas (nome/status/objetivo só, sem métricas, cap de 8 linhas, linhas não são clicáveis) + lista "Alertas recentes" (top 5, truncado em 90 caracteres, sem link pra ação).
- Loading: skeleton. Vazio: "Nenhuma campanha" / "Tudo certo". **Sem estado de erro visível** — falha de carregamento vira `console.error` silencioso e a página renderiza com dados zerados sem avisar o usuário.

**Performance:** `loadDashboard()` (293–421) busca TODAS as campanhas da conta, depois chama `getInsights()` **por campanha** em lotes de 8 requisições concorrentes, agregando tudo no navegador. Sem endpoint agregado no servidor, sem cache, sem debounce na troca de período — em conta com muitas campanhas isso é lento a cada troca de conta/período.

**Bom, preservar:** o sistema de KPI "consciente do objetivo" (troca todo o conjunto de métricas conforme o que a campanha realmente otimiza) é genuinamente melhor que a maioria dos concorrentes, que mostram um conjunto fixo de KPI independente do objetivo.

**Problema central:** o dashboard é uma coleção de números, não responde "o que precisa da minha atenção" nem "o que eu deveria fazer agora" — os alertas aparecem truncados e sem ação, a mini-tabela de campanhas não linka pra lugar nenhum.

---

## Contas

**Arquivo:** `frontend/src/app/accounts/page.tsx` (1222 linhas, sem componentização) + `backend/src/meta/meta.controller.ts`

**O que existe:**
- Stats (Total/Ativos/Inativos), tabs de filtro (Todas/Ativas/Inativas, client-side), busca só dentro do modal de gerenciamento em massa (não na lista principal).
- Card por conta (503–972) empilhando 5 seções: badges de status, saldo com cor por limiar (`getBalanceColor`, verde/amarelo/vermelho), pill de "frescor" de sincronização (`syncStatus` — amarelo &gt;24h, vermelho &gt;7 dias), notas inline editáveis, contato pra relatórios (fetch próprio via `fetch()` cru, não usa o client `api` compartilhado), e cobrança/alertas de saldo (PIX vs Cartão + limiar).
- Modal de gerenciamento em massa: busca+filtro+seleção múltipla, mas ativar/desativar em lote é um **loop client-side de chamadas individuais** (não um endpoint de bulk real) — falhas por item são engolidas silenciosamente.
- Adicionar conta manual (accounts não pegas pelo auto-sync).

**Problemas concretos:**
- Card gigante (5 seções empilhadas) sem colapsar — rolagem infinita com 10+ contas, sem paginação/virtualização.
- Sem busca na lista principal — só dentro do modal de bulk, que é pra outra finalidade.
- Sem visão em tabela — impossível comparar saldos entre contas lado a lado sem rolar.
- Badges usam cor inline (`rgba(...)` repetido) em vez das classes `badge-*` já usadas em Dashboard/Campanhas — a tela mais usada do produto diverge visualmente do resto.

**Bom, preservar:** `getBalanceColor` + `syncStatus` são sinais proativos genuinamente úteis — exatamente o tipo de coisa que uma ferramenta de agência premium precisa ter embutido no card, não escondido em outro lugar.

---

## Campanhas

**Arquivo:** `frontend/src/app/campaigns/page.tsx`

**O que existe:** filtro de conta (`&lt;select&gt;` nativo, inconsistente com o `AccountSelect` usado no resto do app), filtro de status, busca por texto — tudo client-side sobre a lista já carregada. Tabela: Campanha / Conta / Objetivo (enum cru do Meta, não traduzido) / Status / Orçamento Diário / Ações ("Analisar" que dispara IA com `alert()` bloqueante, e "Previsão").

**Problemas graves:**
- **Sem ordenação de coluna, sem paginação, sem seleção em massa.**
- **Zero métricas na tabela** (sem gasto, CTR, ROAS, conversões) e **sem seletor de período** — a tabela de campanhas mais importante do produto não mostra performance nenhuma.
- **Não dá pra pausar campanha nem mudar orçamento do Meta por aqui** — nenhum endpoint de mutação de campanha existe no backend Meta (só GET). Isso é uma assimetria real: o Google Ads (ver abaixo) TEM esse botão.

**Bom, preservar:** diferenciação clara entre "nenhuma campanha" (zero no total) e "nenhum resultado" (filtro zerou) nos estados vazios.

---

## Google Ads (módulo separado)

**Arquivo:** `frontend/src/app/google-ads/page.tsx`

Completamente separado do Meta — sem `AccountContext`/`AccountSelect` compartilhado, fluxo de credenciais próprio (Developer Token, MCC, Refresh Token, Client ID/Secret). Layout master/detail: lista de contas à esquerda, campanhas em cards à direita com **toggle Play/Pause funcional por campanha** — exatamente a ação que falta em Campanhas (Meta). Sem período customizável (sempre os últimos 30 dias do último sync). Estados vazios bem sequenciados (sem credenciais → sem contas → sem campanhas sincronizadas).

> ⚠️ Vulnerabilidade de segurança corrigida em 27/08/2026: o modal de credenciais tinha um `client_id`/`client_secret` real (da Alfamax) hardcoded como valor padrão, exposto no bundle JS pra qualquer visitante. Já removido do código — **o secret precisa ser rotacionado no Google Cloud Console** (decisão do usuário: adiado por ora).

**Problema estrutural:** Meta e Google Ads são dois produtos visualmente diferentes dentro do mesmo app — sem visão unificada de gasto/ROAS entre canais, sem seletor de conta compartilhado.

---

## Insights (IA) — feed de análises

**Arquivo:** `frontend/src/app/insights/page.tsx`

Feed de análises de IA por campanha (não um dashboard de métricas): gauge de risco 0–100, status colorido (excelente/bom/alerta/crítico), diagnóstico em texto livre, "Ação Recomendada" opcional. Só populado clicando "Analisar" na página de Campanhas, uma campanha por vez — sem análise em lote, sem re-análise/refresh, sem link de volta pra campanha de origem, sem ordenar por risco.

---

## Otimizações / Agenda — ⚠️ conflito de nomenclatura

**Arquivo:** `frontend/src/app/otimizacoes/page.tsx`

O item do menu se chama "Otimizações", mas a própria página se autointitula "Agenda" no `&lt;h1&gt;` — é na verdade um **gerenciador de tarefas internas da agência** (check-ins semanais, relatórios, reuniões do Google Calendar, cronômetro por tarefa), não otimização de campanha. Duas telas (`/otimizacoes` e `/board`) mostram os mesmos cards de board por caminhos diferentes. Resultado: o produto tem 3 conceitos diferentes que um usuário chamaria de "otimização" (Insights IA, esta agenda, e "Analisar" dentro de Campanhas), cada um em um item de menu diferente, sem relação visual entre eles. **Este é o maior problema de arquitetura de informação encontrado na auditoria.**

---

## IA (visão consolidada)

Três frentes de IA distintas, sem se referenciar:

1. **Análise de campanha** (`Insights`, acima) — diagnóstico + texto, sem ação clicável.
2. **Previsões** (`frontend/src/app/predictions/page.tsx`, `backend/src/prediction/`) — **não é IA/ML**, é regressão linear simples (mínimos quadrados) por métrica, cada métrica regredida independentemente (podem ficar matematicamente inconsistentes entre si). Sem gráfico de tendência (seria o caso de uso óbvio pra isso), sem explicação de metodologia, e não filtra métricas irrelevantes por objetivo (mostra "ROAS Estimado" pra campanha de engajamento, por exemplo) — inconsistente com o resto do produto que já faz esse filtro.
3. **Agente conversacional** (`frontend/src/app/agent/page.tsx`, `backend/src/ai/agent.service.ts`) — chat com streaming (SSE), 4 ferramentas de LEITURA (listar campanhas, ver insights, overview de conta, comparar campanhas) — **não pode pausar, ajustar orçamento nem executar nada**, é só um "explicador" dos dados. Suporta upload de CSV pra análise ad-hoc. UI já é boa (bem construída, streaming funciona), mas isolada — nenhuma outra tela linka "pergunte ao agente sobre isso".

> Nota factual: o modelo por trás de tudo (agente, análise de campanha, análise de criativo) é **OpenAI GPT-4o**, não Claude — a função se chama `callClaude()` e a UI do agente mostra "Claude Opus 4.6" na tela, ambos nomes desatualizados/incorretos que valem correção por honestidade com o usuário.

**Nenhuma das três é acionável de verdade** (sem botão "aplicar", sem "pausar direto daqui") — é 100% leitura, mesmo quando o texto já recomenda uma ação específica.

---

## Automação (SE/ENTÃO)

**Arquivo:** `frontend/src/app/automation/page.tsx`, `backend/src/automation/`

Regras simples via formulário (não builder visual): condição = 1 métrica + operador + limiar + janela; ação = pausar / ativar / só notificar. Roda de verdade via cron a cada hora, sem aprovação humana pra pausar/ativar — **genuinamente autônomo** nesse escopo estreito.

**Bugs encontrados:**
- Campo `scope` (campanha vs. conta inteira) existe no modelo de dados mas **nunca é lido** na avaliação — sempre avalia por campanha, o campo é morto.
- Ação "notificar apenas" não notifica ninguém — o código importa o serviço de WhatsApp mas nunca chama; só grava um log silencioso.
- Sem trilha de auditoria na UI: o backend já grava `action_success`/`action_error` por evento mas a tela não mostra em lugar nenhum — usuário não consegue ver por que uma regra disparou nem se a ação no Meta realmente funcionou.
- Sem modo simulação/dry-run antes de ativar uma regra que pode pausar gasto real de cliente.

---

## Alertas

**Arquivo:** `frontend/src/app/alerts/page.tsx`, `backend/src/analytics/smart-alerts.service.ts`

Puramente baseado em regra/limiar (12 checagens por campanha + 2 por conta), **não é IA** apesar do nome "Smart Alerts" — mas é consciente do objetivo (não dispara alerta de ROAS em campanha de reconhecimento, por exemplo), o que é um diferencial real. Agrupamento por conta (já corrigido nesta sessão) funciona bem, com preview + "ver mais".

**Bug encontrado:** alertas de nível de CONTA (saldo baixo, pagamento falhou — os dois tipos mais críticos financeiramente) resolvem `account_name = NULL` porque o JOIN do backend só passa por `campaign_id → campanha → conta`, e alertas de conta não têm `campaign_id`. Resultado: os alertas mais importantes caem no grupo "Sem conta" ao invés de aparecerem sob a conta certa. Fix é simples (ajustar o JOIN pra também considerar `alerts.account_id` direto).

**Gap de conexão:** nenhum alerta linka pra "criar regra de automação a partir disso" nem pra "perguntar ao agente IA por quê" — três sistemas (Alertas, Automação, Agente) falam a mesma língua de métricas mas não se conectam.

---

## Criativos

**Arquivo:** `frontend/src/app/creative/page.tsx`, `backend/src/ai/ai.service.ts`

Duas abas: "Top Criativos (IA)" (ranking dos 10 anúncios de maior gasto + narrativa qualitativa da IA sobre padrões vencedores) e "Analisar texto manual" (cola copy, recebe scores de hook/oferta/público/fadiga).

**Não gera nada** — apesar da marca "IA", só analisa performance/texto já existente. Não gera imagem, vídeo nem variação de copy. `video_id` é buscado do Meta mas nunca usado — é o gancho óbvio pra um player, mas hoje clicar num anúncio de vídeo só abre o link do Facebook/Instagram numa aba nova (sem player embutido, sem `&lt;video&gt;` em lugar nenhum do código). O backend já suporta análise de imagem/vídeo em base64, mas o frontend dessa aba só manda texto — a capacidade existe e está inacessível pela UI.

**Sem histórico:** ao contrário da análise de campanha (que salva em `ai_analyses`), a análise de top-criativos não persiste nada — sem comparação com a análise da semana passada.

---

## Financeiro

**Arquivos:** `frontend/src/app/financeiro/page.tsx`, `backend/src/financial/`

Construído/estendido extensivamente nesta sessão. Abas: Visão Geral, Gestão (MRR/ARR/Churn/lucro por cliente), Entradas, Saídas, Recorrências (cobrança de contratos, geração automática mensal, marcação de atraso), Contratos.

**Feature nova (26–27/08/2026):** lembretes automáticos de vencimento de fatura via WhatsApp pro cliente final, com fila de aprovação — por padrão cada lembrete fica pendente até o usuário da agência aprovar (notificado por email/WhatsApp/push), com opção de ativar automático globalmente ou por cliente específico. Nenhum concorrente pesquisado até agora tem algo equivalente documentado publicamente.

---

## Relatórios

**Arquivos:** `backend/src/reports/report.service.ts`, `daily-whatsapp.service.ts`, `pdf-report.service.ts`; `frontend/src/app/report/[token]/page.tsx`, `frontend/src/app/reports/**`

Três formatos, cada um gerado por um caminho de código diferente:
1. **Texto diário via WhatsApp** — resumo ontem/7d/mês. Corrigido nesta sessão: antes somava resultados de campanhas com objetivos diferentes sob um rótulo só (bug real, reportado pela conta Duana); agora separa por objetivo detectado, com rótulo correto vindo do `optimization_goal` real do Meta.
2. **PDF completo** — inclui distribuição por objetivo (correta), mas o ranking de criativos usa uma "ação dominante" única pra todos os anúncios da lista (decisão de design deliberada pra manter a tabela comparável, não um bug).
3. **Página pública no navegador** (`/report/[token]`) — a mais rica: cards de criativo agora mostram alcance, frequência, cliques no link e ROI (adicionado nesta sessão, dados que já vinham do Meta mas eram descartados), e anúncios de vídeo ganharam botão "Assistir" (abre o post original no Instagram/Facebook — Meta não permite embutir o vídeo direto).

**Templates:** biblioteca simples de mensagens (`frontend/src/app/templates/page.tsx`) — 2 canais × 4 categorias, edição de texto puro com variáveis `{placeholder}`, sem preview renderizado com dados de exemplo, sem indicar quais contas usam qual template antes de salvar uma edição.

---

## WhatsApp

Não é uma tela única — é uma capacidade transversal: conexão via Evolution API (QR code, `Comercial → Integrações`, fluxo bem construído com estados form→qr→conectado), disparo de relatório diário, alertas de saldo, lembretes de fatura (Financeiro), e mensageria de CRM (Comercial → Conversas, **somente leitura** — não dá pra responder uma conversa de dentro do TrafficAI).

---

## Leads / Atribuição / Vendas

**Tracking (Pixel + CAPI):** `frontend/src/app/tracking/page.tsx` (3.214 linhas — maior arquivo do frontend), `backend/src/tracking/`. É a funcionalidade mais madura e completa do produto: checklist de setup guiado com 7 passos (`SetupChecklist`) verificando de verdade se o pixel está instalado (via eventos reais, não só campo preenchido), dashboard de resultados com funil Lead→Qualificado→Agendado→Venda, gráfico de série temporal (o único do produto além do Dashboard), sincronização retroativa com CRM (Kommo), reenvio de eventos falhos com um clique, teste de evento ao vivo contra a API real do Meta. **Deveria ser referência de qualidade pras outras telas**, mas está tudo em um único arquivo de 3.200+ linhas — risco de manutenção.

**Comercial (CRM):** `frontend/src/app/comercial/**` — Dashboard executivo muito bem construído (funil, ranking de canal, sparklines, pacing de meta) é a tela mais "premium" do produto hoje. Mas **Leads/Conversas/Tarefas são somente leitura** — não dá pra mover um lead de etapa, reatribuir vendedor, nem responder uma conversa de dentro do TrafficAI; tudo isso só muda de fato dentro do Kommo e chega via sincronização. O que parece "CRM" é, na prática, uma camada de relatório sobre o Kommo, não um CRM editável.

**Board (Kanban real):** `frontend/src/app/board/page.tsx` — este sim é drag-and-drop de verdade, com checklist inline e atualização otimista bem implementada. Mas **sem suporte a toque** (só eventos HTML5 DnD nativos — praticamente impossível de reordenar em tablet/celular) e **sem campo de responsável/dono no card** — numa agência com várias pessoas, não dá pra ver "o que é meu" nesse board.

---

## Clientes

**Arquivo:** `frontend/src/app/clientes/page.tsx` (1349 linhas)

Lista/busca/filtro, drawer unificado com 4 abas (Visão geral, Contratos, Reuniões, Onboarding) — mas todas as 4 abas carregam de uma vez ao abrir a linha, mesmo que o usuário só queira ver uma. Busca sem debounce dispara 3–4 chamadas de API a cada tecla digitada. Faixa de "clientes em risco" (atraso + baixa frequência de reunião) é um sinal de "e daí" genuinamente bom, raro em concorrentes. Tabela é feita com divs (`display:grid`), não `&lt;table&gt;` semântica.

**Dívida técnica encontrada:** o modelo de contrato tem dois esquemas de cobrança coexistindo — colunas antigas (`monthly_value`, `contract_start/end`) que o backend ainda lê/grava mas o frontend nunca envia (foram substituídas pela tabela `contracts`, mais completa).

---

## Onboarding

**Arquivos:** `frontend/src/app/onboarding/page.tsx`, `onboarding/template/page.tsx`

Checklist de 54 itens em 6 fases (Contratual → Acessos → Discovery → Setup Técnico → Planejamento → Go-Live), com tag "Cliente" vs "Agência" por item e contador de "bloqueado pelo cliente" — um diferencial real. Editor de template completo (reordenar, adicionar/remover item, resetar pro padrão). Completar 100% já cria automaticamente as rotinas semanais do cliente.

**Bug pequeno mas real:** o texto de estado vazio da página principal diz "checklist de 48 tarefas" — o template real tem 54. Inconsistência de copy visível pro usuário.

---

## Equipe

**Arquivo:** `frontend/src/app/team/page.tsx` + `backend/src/team/team.controller.ts`

**Modelo de permissão é totalmente plano:** só `admin` ou `member`, sem granularidade por conta/cliente/funcionalidade — um "member" vê tudo que um admin vê, a única diferença é se pode mexer no cadastro da própria equipe. **Sem log de auditoria em lugar nenhum do backend** (grep confirmou zero tabela/menção de audit log) — não dá pra responder "quem mudou o dia de cobrança desse contrato".

Proteções sensatas existem (não deixa apagar o último admin, não deixa se autodeletar). ~130 linhas de componente morto (`MemberDetailModal`, substituído por um drawer mas nunca removido).

Existe uma segunda tela também chamada "Time" dentro de Comercial (`comercial/team/page.tsx`, "Vendedores") — mede coisas completamente diferentes (metas de venda vs. produtividade de tarefas), risco real de confusão de nomenclatura.

---

## Sidebar — arquitetura de navegação atual (exata)

3 "Áreas" com um switcher manual (não é navegação por rota aninhada — é estado local que pode dessincronizar visualmente da página atual até o usuário clicar num link):

**Tráfego Pago**
- Meu dia: Agenda, Rotina, Otimizações, Onboarding, Google Calendar
- Inteligência: Dashboard, Gestor IA, Insights IA
- Campanhas: Campanhas, Google Ads, Previsões, Alertas, Automações
- Resultados: Relatórios, Diário WhatsApp, Criativos, Templates, Tracking, Contas

**Gestão**
- CRM & Financeiro: Clientes, Financeiro
- Time: Time, Demandas

**Comercial**
- Visão Geral: Dashboard, Conversas, Leads
- Operação: Vendedores, Tarefas
- Configuração: Integrações, Compartilhar

**Rodapé (fora do sistema de Áreas):** Integrações, Assinatura, Configurações, botão de instalar PWA, Sair.

**Problemas already identificados:** 25 rotas só na área "Tráfego Pago"; "Otimizações" e "Demandas" mostram os mesmos dados de board por dois caminhos diferentes; "Agenda", "Rotina" e "Otimizações" (que internamente se chama "Agenda") convivem no mesmo grupo sem diferenciação clara pelo nome; seletor de conta (`AccountSelect`) só aparece na área Tráfego, sem indicar qual conta ficou selecionada quando o usuário volta de outra área; dois timers de polling globais independentes (alertas a cada 30s, onboarding a cada 60s) sem camada compartilhada.
