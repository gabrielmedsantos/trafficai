// ==============================
// Template default de onboarding pra novos clientes de tráfego pago.
// 48 items em 6 fases. Cada item marca 'owner' pra saber quem executa
// (agency = agência resolve; client = cliente precisa entregar/agir).
// ==============================

export type Phase = 'contract' | 'access' | 'discovery' | 'setup' | 'planning' | 'golive' | 'custom';
export type Owner = 'agency' | 'client';

export interface TemplateItem {
    phase: Phase;
    title: string;
    description?: string;
    owner: Owner;
}

export const DEFAULT_ONBOARDING_TEMPLATE: TemplateItem[] = [
    // ─── FASE 1 · CONTRATUAL ──────────────────────────────────────────
    { phase: 'contract', owner: 'agency', title: 'Contrato assinado e arquivado', description: 'Assinatura digital ou física guardada em pasta do cliente.' },
    { phase: 'contract', owner: 'agency', title: 'Primeira nota fiscal emitida', description: 'Referente ao mês de setup.' },
    { phase: 'contract', owner: 'agency', title: 'Cobrança recorrente configurada', description: 'PIX/boleto/cartão automatizado no financeiro.' },
    { phase: 'contract', owner: 'agency', title: 'Cliente cadastrado no TrafficAI', description: 'Ad account importada, nome do cliente correto, categoria ativa.' },
    { phase: 'contract', owner: 'agency', title: 'Cliente no grupo de WhatsApp', description: 'Grupo com responsável do cliente + gestor de tráfego.' },
    { phase: 'contract', owner: 'agency', title: 'Apresentação da equipe enviada', description: 'Quem é o responsável, contatos, canal preferido de comunicação.' },

    // ─── FASE 2 · ACESSOS ─────────────────────────────────────────────
    { phase: 'access', owner: 'client', title: 'Acesso ao Business Manager (Meta)', description: 'Convite de Admin no BM, business_id compartilhado.' },
    { phase: 'access', owner: 'client', title: 'Acesso à conta de anúncios Meta', description: 'Cargo Anunciante ou Admin, act_XXXXX linkado.' },
    { phase: 'access', owner: 'client', title: 'Acesso ao Google Ads', description: 'Aceitar convite MCC (agência) ou compartilhar customer ID.' },
    { phase: 'access', owner: 'client', title: 'Acesso ao Google Analytics / GA4', description: 'Permissão de Analista ou Editor.' },
    { phase: 'access', owner: 'client', title: 'Acesso ao Google Tag Manager', description: 'Permissão de Publicar no container do site.' },
    { phase: 'access', owner: 'client', title: 'Acesso ao CRM (Kommo/RD/Pipedrive…)', description: 'Usuário com permissão de leitura + gestão de leads.' },
    { phase: 'access', owner: 'client', title: 'Acesso ao site (WordPress admin ou GTM)', description: 'Necessário para instalar pixel se GTM não estiver disponível.' },
    { phase: 'access', owner: 'client', title: 'Acesso à API de WhatsApp / Evolution', description: 'Se aplicável para automação de resposta.' },
    { phase: 'access', owner: 'client', title: 'Assets de marca (logo, fotos, vídeos)', description: 'Arquivos originais em alta resolução em pasta compartilhada.' },

    // ─── FASE 3 · DISCOVERY ───────────────────────────────────────────
    { phase: 'discovery', owner: 'agency', title: 'Reunião de kickoff com cliente', description: 'Briefing detalhado, gravar e transcrever. Alinhar expectativas.' },
    { phase: 'discovery', owner: 'agency', title: 'Auditoria completa da conta Meta (90d)', description: 'CTR, CPM, CPA, gastos por campanha, top criativos, taxa de conversão.' },
    { phase: 'discovery', owner: 'agency', title: 'Auditoria de campanhas Google (se houver)', description: 'Palavras-chave, quality score, extensões, negativações.' },
    { phase: 'discovery', owner: 'agency', title: 'Análise dos criativos históricos', description: 'O que funcionou (baixo CPA) e o que não (alto CPA). Padrões visuais.' },
    { phase: 'discovery', owner: 'agency', title: 'Mapeamento da jornada do lead', description: 'Do primeiro clique ao fechamento — quantos passos, onde perde.' },
    { phase: 'discovery', owner: 'agency', title: 'Levantamento de personas / ICP', description: 'Idade, gênero, dor principal, objeção comum. Validar com cliente.' },
    { phase: 'discovery', owner: 'agency', title: 'Análise de 3-5 concorrentes na Ads Library', description: 'Que anúncios estão rodando, quanto tempo, qual copy usam.' },
    { phase: 'discovery', owner: 'agency', title: 'Inventário de material bruto', description: 'Vídeos, depoimentos, fotos de bastidor, cases prontos.' },
    { phase: 'discovery', owner: 'agency', title: 'Cálculo do CAC atual (custo por cliente)', description: 'Investimento dos últimos 3 meses ÷ nº de clientes fechados. Base de comparação pra medir evolução.' },
    { phase: 'discovery', owner: 'agency', title: 'Análise da taxa de conversão do funil', description: 'Impressão → clique → lead → qualificado → cliente. Identifica onde perde mais gente e priorizar melhoria.' },
    { phase: 'discovery', owner: 'client', title: 'Levantamento de faturamento histórico', description: 'Últimos 3-6 meses de faturamento pra entender ticket médio, sazonalidade e capacidade real de crescimento.' },

    // ─── FASE 4 · SETUP TÉCNICO ───────────────────────────────────────
    { phase: 'setup', owner: 'agency', title: 'Pixel Meta instalado no site', description: 'Validado com Meta Pixel Helper — sem duplicação, PageView ativo.' },
    { phase: 'setup', owner: 'agency', title: 'Meta CAPI conectado via TrafficAI', description: 'Access token salvo, envio automático de conversões ativo.' },
    { phase: 'setup', owner: 'agency', title: 'Domínio verificado no BM', description: 'Obrigatório desde iOS 14.5 pra rodar Advantage+ e conversões.' },
    { phase: 'setup', owner: 'agency', title: 'Eventos de conversão configurados', description: 'PageView, Lead, Contact, Purchase — cada um com evento_id único.' },
    { phase: 'setup', owner: 'agency', title: 'Priorização de eventos (AEM)', description: 'Aggregated Event Measurement — top 8 eventos priorizados por importância.' },
    { phase: 'setup', owner: 'agency', title: 'Google Ads conversion tracking', description: 'Tag de conversão instalada + import de conversões do GA4.' },
    { phase: 'setup', owner: 'agency', title: 'Google Tag Manager configurado', description: 'Se usado, containers organizados, tags nomeadas corretamente.' },
    { phase: 'setup', owner: 'agency', title: 'Integração CRM → TrafficAI ativa', description: 'Sync diário 24/7, teste manual de backfill rodado.' },
    { phase: 'setup', owner: 'agency', title: 'Backfill histórico do CRM (90d)', description: 'Purchase e Lead retroativos importados pro Meta CAPI.' },
    { phase: 'setup', owner: 'agency', title: 'Audiências customizadas criadas', description: 'Site visitors 30d, engajamento IG 90d, leads CRM, compradores.' },
    { phase: 'setup', owner: 'agency', title: 'Públicos semelhantes 1% e 3%', description: 'Semelhantes da base de compradores e de leads qualificados.' },

    // ─── FASE 5 · PLANEJAMENTO ────────────────────────────────────────
    { phase: 'planning', owner: 'agency', title: 'Metas SMART definidas com o cliente', description: 'Faturamento alvo, nº de clientes/mês, CAC máximo aceitável. Aprovadas por escrito antes de subir campanha.' },
    { phase: 'planning', owner: 'agency', title: 'Estimativa de CAC com investimento atual', description: 'Projeção realista baseada em CAC histórico + eficiência esperada com nossa gestão. Define o que é atingível.' },
    { phase: 'planning', owner: 'agency', title: 'Cálculo de investimento pra bater a meta', description: 'Meta de clientes × CAC estimado = orçamento mínimo. Se cliente não pode investir, ajustar meta.' },
    { phase: 'planning', owner: 'agency', title: 'Projeção de faturamento (30 / 60 / 90 dias)', description: 'Curva de crescimento esperado mês a mês. Serve pra alinhar expectativa e detectar desvios cedo.' },
    { phase: 'planning', owner: 'agency', title: 'Orçamento distribuído por campanha', description: 'Topo/meio/fundo, retargeting — % de cada.' },
    { phase: 'planning', owner: 'agency', title: 'Estrutura de campanhas planejada', description: 'ABO ou CBO, quantos conjuntos, segmentação de cada.' },
    { phase: 'planning', owner: 'agency', title: '3-5 roteiros de criativo aprovados', description: 'Copy + storyboard aprovado pelo cliente antes de gravar/produzir.' },
    { phase: 'planning', owner: 'agency', title: 'Copies e headlines aprovados', description: 'Variações A/B pra teste no dia 1.' },
    { phase: 'planning', owner: 'agency', title: 'Landing page revisada / criada', description: 'Velocidade < 3s, pixel instalado, formulário testado ponta-a-ponta.' },
    { phase: 'planning', owner: 'agency', title: 'Fluxo de resposta ao lead definido', description: 'Bot de qualificação (se aplicável), SLA de primeira resposta, script.' },

    // ─── FASE 6 · GO-LIVE ─────────────────────────────────────────────
    { phase: 'golive', owner: 'agency', title: 'Campanhas subidas e aprovadas no Meta', description: 'Todos os anúncios em status Ativo, sem rejeições pendentes.' },
    { phase: 'golive', owner: 'agency', title: 'Testes A/B ativos desde dia 1', description: 'Pelo menos 2 variações de criativo rodando em cada conjunto.' },
    { phase: 'golive', owner: 'agency', title: 'Retargeting ativo', description: 'Campanha de remarketing pra site visitors 30d + engajamento IG 90d.' },
    { phase: 'golive', owner: 'agency', title: 'Lista de leads antigos importada', description: 'Custom Audience de arquivo (email + telefone) subida no BM.' },
    { phase: 'golive', owner: 'agency', title: 'Alerta de saldo configurado', description: 'Threshold no TrafficAI + WhatsApp do responsável cadastrado.' },
    { phase: 'golive', owner: 'agency', title: 'Dia/horário do relatório alinhado', description: 'Configurar rotina no TrafficAI pra disparar automático no dia certo.' },
    { phase: 'golive', owner: 'agency', title: 'Primeira reunião de check-in agendada', description: 'D+7 após go-live. Recorrência semanal ou quinzenal.' },
];

export const PHASE_LABEL: Record<Phase, string> = {
    contract: 'Contratual',
    access: 'Acessos',
    discovery: 'Discovery',
    setup: 'Setup Técnico',
    planning: 'Planejamento',
    golive: 'Go-Live',
    custom: 'Customizado',
};
