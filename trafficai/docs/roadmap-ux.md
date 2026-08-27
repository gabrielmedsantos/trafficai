# Roadmap UX — TrafficAI Premium

> Baseado em `trafficai-audit.md` + `benchmark-criativivo-vs-trafficai.md`. Regra: melhorar o que existe, não recriar. Nenhum item aqui envolve trocar banco, quebrar integração ou duplicar funcionalidade — são ajustes/extensões sobre código já em produção. Compilado em 27/08/2026.

Legenda: `[ ]` não iniciada · `[~]` em andamento · `[x]` concluída

---

## Agora (P0) — maior impacto na experiência do dia a dia

- [ ] **Resolver a colisão de nomenclatura Otimizações / Demandas / Agenda / Rotina** — hoje 3 itens de menu descrevem conceitos sobrepostos com nomes que não diferenciam o conteúdo. Decidir: renomear "Otimizações" pra refletir o que ela realmente é (agenda interna), e decidir se "Demandas" (board) deveria estar embutido ali ou permanecer separado.
- [ ] **Adicionar controle de campanha Meta (pausar/ativar, ajustar orçamento) direto na tabela de Campanhas** — hoje só existe pro Google Ads. É a lacuna funcional mais visível do produto.
- [ ] **Redesenhar a tabela de Campanhas**: adicionar colunas de métrica (gasto, CTR, ROAS, conversões), ordenação por coluna, seletor de período, ações em massa.
- [ ] **Adicionar comparação com período anterior no Dashboard** — delta percentual visualmente destacado em cada KPI card, não só o número absoluto.
- [ ] **Dashboard: seção "campanhas que precisam de atenção"** acima do fold, com base nos mesmos sinais que já alimentam os Alertas — hoje essa informação existe (Alertas) mas não aparece resumida no primeiro lugar que o usuário olha.
- [ ] **Corrigir o bug de agrupamento de alertas de conta** (saldo baixo / pagamento falhou caem em "Sem conta" por falta de JOIN direto em `alerts.account_id`) — são os dois tipos de alerta mais críticos financeiramente.
- [ ] **Rotacionar o client_secret do Google OAuth vazado** no Google Cloud Console (decisão adiada pelo usuário em 27/08 — reavaliar).

## Próximo (P1) — grande impacto

- [ ] **Transformar o diagnóstico de IA em ação clicável** ("Copiloto do Gestor de Tráfego" — ver seção dedicada abaixo). Primeiro passo realista: adicionar botão "Ver campanhas" / "Criar regra de automação a partir deste alerta" nos Alertas e no Insights IA, linkando pra telas que já existem, antes de dar ao agente permissão de executar ação real.
- [ ] **Permissão de equipe por conta** — hoje é só admin/member. Adicionar ao menos "quais contas este membro pode ver", que é o bloqueio mais citado pra agências de porte médio+ fecharem plano maior.
- [ ] **Log de auditoria básico** (quem mudou o quê, quando) — hoje não existe em lugar nenhum; risco real numa ferramenta multiusuário.
- [ ] **Suporte a toque no Board (Kanban)** — hoje só funciona com mouse (drag-and-drop HTML5 nativo); adicionar fallback de toque ou pelo menos um menu de "mover pra coluna X" acessível por toque.
- [ ] **Campo de responsável/dono nos cards do Board** — permitir visão "minhas tarefas".
- [ ] **Busca com debounce em Clientes** — hoje dispara 3–4 chamadas de API por tecla digitada.
- [ ] **Carregar as abas do drawer de Clientes sob demanda**, não todas de uma vez ao abrir a linha.
- [ ] **Padronizar badges de status** (Contas usa cor inline, resto do app usa classes `badge-*`) — inconsistência visual na tela mais usada do produto.
- [ ] **Busca na lista principal de Contas** (hoje só existe dentro do modal de gerenciamento em massa).
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
- [ ] **Preview renderizado nos Templates** (hoje só texto puro com variáveis, sem simular como fica com dados reais) + indicar quais contas usam cada template antes de editar.

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
