# Benchmark — Criativivo vs. TrafficAI

> ⚠️ Base de comparação: conteúdo público do site do Criativivo (home + `/llms-full.txt`). Ainda não recebemos os vídeos/prints internos prometidos — quando chegarem, este documento precisa ser revisado com o fluxo real (cliques, transições, modais), não só a lista de features anunciadas. Compilado em 27/08/2026.

| Funcionalidade | TrafficAI atual | Criativivo (site público) | O que o Criativivo faz melhor / diferente | Nossa melhoria proposta | Prioridade |
|---|---|---|---|---|---|
| Dashboard | Existe — 6 KPIs por objetivo + 2 gráficos, sem comparação de período, sem "o que precisa de atenção" | Anunciado como visão consolidada multi-conta em "2 segundos" | Hierarquia de informação (visão geral → o que está ruim → oportunidade → ação) | Adicionar delta vs. período anterior nos KPIs; seção "campanhas que precisam de atenção" acima do fold | P0 |
| Navegação / Sidebar | 3 "Áreas" com switcher manual, 25+ itens só na área Tráfego, nomenclatura confusa (Otimizações ≠ otimização) | Não documentado em detalhe no material público | — (avaliar quando os prints chegarem) | Resolver a colisão Otimizações/Demandas/Agenda antes de comparar visualmente | P0 |
| Controle de campanha Meta | Só leitura (nome/status/orçamento) — sem pausar/mudar orçamento | Anuncia "pausa/ativa/ajusta orçamento" direto do painel, Meta e Google | Ação direta na tabela, sem sair da tela | Portar o padrão já existente no Google Ads (toggle play/pause) pra Campanhas Meta | P0 |
| Tabela de campanhas | Sem métricas, sem ordenação, sem paginação, sem seleção em massa | Não detalhado, mas "comparação de performance em tempo real" é destacado como recurso central | Tabela como superfície principal de métrica + ação, não só listagem | Redesenhar tabela: colunas de métrica, ordenação, ações em massa | P0 |
| Relatório automático WhatsApp | Existe — texto + PDF + página pública, com aprovação opcional e (novo) separação por objetivo | "Configura uma vez, envia pra sempre" — horário/métrica customizável | Simplicidade de configuração inicial | Já é competitivo; revisar só a configuração inicial (quantos cliques até o primeiro envio funcionar) | P2 |
| Dashboard público do cliente | Existe — token de acesso, agora com métricas completas + vídeo no card | Token + **white-label opcional** (marca do cliente, não do concorrente) | Branding customizável pro cliente final | Avaliar adicionar logo/cor da agência no relatório público (branding, não é código-fonte) | P1 |
| Alerta de saldo | Existe — PIX e cartão, cor por limiar, via WhatsApp | PIX e fatura, "antes da campanha parar" | Equivalente | — | — |
| CRM / pipeline de vendas | **Somente leitura** — não move lead de etapa nem reatribui vendedor dentro do TrafficAI (tudo via Kommo) | Anuncia Kanban nativo com distribuição automática (round-robin) | CRM de verdade, editável, sem depender de outra ferramenta | Avaliar: (a) permitir mover etapa/reatribuir vendedor direto no TrafficAI, ou (b) manter leitura mas adicionar distribuição automática ao sincronizar | P1 |
| Board interno (Kanban) | Existe — drag-and-drop real, mas sem toque (mobile/tablet quebrado) e sem campo de responsável | Não detalhado | — | Adicionar suporte a toque + campo de responsável — ganho direto de usabilidade, sem precisar do benchmark | P1 |
| Rastreamento de venda / atribuição | Existe — pixel próprio + CAPI, dedupe em 5 camadas, backfill de CRM, funil completo | Pixel + link com UTM persistente | TrafficAI parece mais robusto aqui (não confirmado em detalhe do lado deles) | Nenhuma ação — módulo já maduro; **evitar retrabalho** | — |
| IA — análise de campanha | Existe — diagnóstico em texto, "ação recomendada" sem botão de aplicar | Anuncia agente 24/7 que "analisa e sugere ação" (pausar, ajustar orçamento) | Se o agente deles realmente executa ação, é o diferencial mais citado do site | Transformar diagnóstico em ação clicável (ver roadmap, "Copiloto") | P0 |
| IA — geração de criativo | **Não existe** (só analisa, não gera) | Gerador de imagem em lote + variações, sistema de créditos | Capacidade nova completa | Avaliar demanda real antes de construir — é o item de maior esforço da lista | P2 |
| Gestão de orgânico (Instagram) | Não existe | Analytics + calendário de postagem/agendamento | Produto adicional dentro do produto | Fora do núcleo atual — não fazer sem validar que o público pede | P3 |
| App nativo | PWA instalável + push (não nativo) | Apps nativos iOS/Android | Percepção de "app de verdade" | Não é prioridade — PWA já cobre a necessidade funcional (push funciona) | P3 |
| Financeiro / cobrança de cliente | Existe — contratos, fatura, **lembrete com fila de aprovação** (recurso novo, ago/2026) | Não aparece no material público do Criativivo | TrafficAI está na frente aqui | Nenhuma — é vantagem competitiva a preservar e destacar em venda | — |
| Permissão de equipe | Plana (admin/member), sem granularidade por conta/cliente, sem log de auditoria | Anuncia permissão granular por conta e por funcionalidade | Controle de acesso mais fino — importante pra agência de porte médio+ | Construir permissão por conta pelo menos (ver roadmap) | P1 |
| Onboarding de cliente | Existe — checklist de 54 itens, tag cliente/agência, "bloqueado por" | Não detalhado | TrafficAI parece mais maduro aqui | Nenhuma — corrigir só o bug de copy (48 vs 54 itens) | P3 |
| Integrações e-commerce | Não existe | Shopify, Hotmart, Yampi, NuvemShop, CartPanda | Cobertura de nicho e-commerce/infoproduto | Avaliar só se a base de clientes migrar pra esse perfil — hoje parece majoritariamente varejo/WhatsApp | P3 |
| Modelo de preço | Por nº de clientes atendidos (5/20/50/100) | Por nº de contas de anúncio conectadas | Modelos diferentes, não comparáveis diretamente | Nenhuma ação de produto — é decisão comercial, não UX | — |

---

## Leitura do que falta pra comparação completa

Este documento cobre o que dá pra inferir do **site público** do Criativivo — a instrução original pede análise de **vídeos e prints do produto em uso**, que ainda não chegaram. Os itens abaixo só podem ser avaliados corretamente com esse material:

- Quantidade de cliques até completar tarefas comuns (pausar campanha, gerar relatório, criar automação).
- Comportamento real de modais, tabs, transições, feedback de loading/sucesso/erro.
- Densidade visual real (espaçamento, tipografia, tamanho de fonte, ícones) — hoje só temos texto descritivo, não uma referência visual.
- Fluxo de primeira utilização (onboarding do próprio produto, não do cliente da agência).

**Recomendação:** tratar este benchmark como v1 (estrutural/funcional) e revisar assim que os vídeos/prints chegarem, antes de fechar qualquer decisão de UI pixel-a-pixel.
