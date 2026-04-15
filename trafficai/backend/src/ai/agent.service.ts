// ==============================
// TrafficAI — Gestor de Tráfego IA (Agent Service)
// OpenAI GPT-4o — streaming SSE + tool use
// ==============================

import axios from 'axios';
import { metaRepository } from '../meta/meta.repository';
import { Response } from 'express';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_ORG_ID = process.env.OPENAI_ORG_ID || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o Gestor de Tráfego IA da plataforma TrafficAI — um especialista sênior em tráfego pago com mais de 10 anos de experiência em Meta Ads (Facebook e Instagram).

Seu papel é ser o gestor de tráfego digital do usuário, respondendo como um profissional experiente e direto. Você:

## Suas competências
- **Campanhas**: objetivos (Conversão, Tráfego, Geração de Leads, Reconhecimento, Engajamento, Vendas do Catálogo), estrutura conta > campanha > conjunto de anúncios > anúncio
- **Orçamento**: CBO (otimização a nível de campanha) vs ABO (nível de conjunto), lance mínimo, custo alvo, cap de lance, ROAS alvo
- **Segmentação**: públicos personalizados, lookalike (1-10%), interesses, comportamentos, dados demográficos, exclusões
- **Pixel e Conversões**: configuração do pixel, eventos padrão vs customizados, Conversions API (CAPI), janelas de atribuição (1d_click, 7d_click, 1d_view)
- **Criativos**: formatos (imagem, carrossel, vídeo, coleção, stories, reels), copy, CTA, testes A/B
- **Análise de métricas**: CTR (bom: >2%), CPM, CPC, frequência (alerta: >3), ROAS, CPL, CPA, taxa de conversão
- **Otimização**: fadiga de criativo, saturação de público, regras automatizadas, escalonamento horizontal vs vertical
- **Relatórios**: leitura de dados, tendências, comparativos de períodos

## Como você responde
- Seja direto, técnico e prático — como um gestor experiente falando com outro profissional
- Use dados reais quando disponíveis (use as ferramentas para buscar)
- Dê recomendações concretas e acionáveis
- Quando identificar problemas, explique o diagnóstico E o que fazer
- Se o usuário pedir para analisar dados, use as ferramentas disponíveis
- Responda sempre em português do Brasil

## Avaliação de métricas Meta Ads
| Métrica | Ruim | Regular | Bom | Excelente |
|---------|------|---------|-----|-----------|
| CTR | <0.5% | 0.5-1% | 1-3% | >3% |
| CPM | >R$80 | R$40-80 | R$15-40 | <R$15 |
| Frequência | >5 | 3-5 | 1.5-3 | 1-1.5 |
| ROAS (ecomm) | <1x | 1-2x | 2-4x | >4x |
| Taxa conv. | <1% | 1-3% | 3-7% | >7% |`;

// ─── Tool Definitions (OpenAI format) ─────────────────────────────────────────
const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'listar_campanhas',
            description: 'Lista todas as campanhas do usuário com status, orçamento e métricas básicas. Use quando o usuário perguntar sobre suas campanhas.',
            parameters: {
                type: 'object',
                properties: {
                    account_id: {
                        type: 'string',
                        description: 'ID da conta de anúncios (opcional). Se não fornecido, busca de todas as contas.',
                    },
                    status: {
                        type: 'string',
                        enum: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'all'],
                        description: 'Filtro de status. Padrão: todas.',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'ver_insights_campanha',
            description: 'Retorna métricas detalhadas de performance de uma campanha específica: gasto, impressões, cliques, CTR, CPC, CPM, frequência, conversões, ROAS dos últimos dias.',
            parameters: {
                type: 'object',
                properties: {
                    campaign_id: {
                        type: 'string',
                        description: 'ID interno da campanha (UUID da plataforma)',
                    },
                    dias: {
                        type: 'number',
                        description: 'Quantidade de dias de histórico. Padrão: 14.',
                    },
                },
                required: ['campaign_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'overview_conta',
            description: 'Visão geral agregada de todas as campanhas ativas: gasto total, impressões, cliques, CTR médio, conversões totais, ROAS médio. Use para resumo de performance geral.',
            parameters: {
                type: 'object',
                properties: {
                    account_id: {
                        type: 'string',
                        description: 'ID da conta (opcional)',
                    },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'comparar_campanhas',
            description: 'Compara métricas de duas ou mais campanhas lado a lado. Útil para identificar qual está performando melhor.',
            parameters: {
                type: 'object',
                properties: {
                    campaign_ids: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Lista de IDs de campanhas para comparar (mín. 2)',
                    },
                    dias: {
                        type: 'number',
                        description: 'Período de comparação em dias. Padrão: 7.',
                    },
                },
                required: ['campaign_ids'],
            },
        },
    },
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────
async function executeTool(toolName: string, toolInput: Record<string, any>, userId: string): Promise<string> {
    try {
        if (toolName === 'listar_campanhas') {
            const campaigns = await metaRepository.getCampaignsByUser(userId);
            if (!campaigns.length) return 'Nenhuma campanha encontrada.';

            const filtered = toolInput.status && toolInput.status !== 'all'
                ? campaigns.filter((c: any) => c.status === toolInput.status)
                : campaigns;

            const list = filtered.map((c: any) =>
                `• [${c.id}] ${c.name} | Status: ${c.status} | Objetivo: ${c.objective || 'N/A'} | Orçamento diário: ${c.daily_budget ? `R$${c.daily_budget}` : 'N/A'}`
            ).join('\n');

            return `${filtered.length} campanha(s) encontrada(s):\n\n${list}`;
        }

        if (toolName === 'ver_insights_campanha') {
            const dias = toolInput.dias || 14;
            const insights = await metaRepository.getInsightsByCampaign(toolInput.campaign_id, dias);
            if (!insights.length) return 'Sem dados de insight para essa campanha no período.';

            const rows = insights.map((i: any) =>
                `${i.date} | Gasto: R$${Number(i.spend).toFixed(2)} | Impr: ${i.impressions} | Cliques: ${i.clicks} | CTR: ${i.ctr}% | CPC: R$${Number(i.cpc).toFixed(2)} | CPM: R$${Number(i.cpm).toFixed(2)} | Freq: ${i.frequency} | Conv: ${i.conversions} | CPA: R$${Number(i.cost_per_conversion).toFixed(2)} | ROAS: ${i.roas}`
            ).join('\n');

            const totalGasto = insights.reduce((s: number, i: any) => s + Number(i.spend), 0);
            const totalConv  = insights.reduce((s: number, i: any) => s + Number(i.conversions), 0);
            const ctrMed     = insights.reduce((s: number, i: any) => s + Number(i.ctr), 0) / insights.length;
            const roasMed    = insights.reduce((s: number, i: any) => s + Number(i.roas), 0) / insights.length;

            return `Insights dos últimos ${dias} dias:\n\n${rows}\n\n**Resumo:** Gasto total: R$${totalGasto.toFixed(2)} | Conversões: ${totalConv} | CTR médio: ${ctrMed.toFixed(2)}% | ROAS médio: ${roasMed.toFixed(2)}`;
        }

        if (toolName === 'overview_conta') {
            const campaigns = await metaRepository.getCampaignsByUser(userId);
            const activeCampaigns = campaigns.filter((c: any) => c.status === 'ACTIVE');

            if (!activeCampaigns.length) return 'Nenhuma campanha ativa encontrada.';

            let totalGasto = 0, totalImpr = 0, totalCliques = 0, totalConv = 0, totalRoas = 0, count = 0;

            for (const camp of activeCampaigns.slice(0, 20)) {
                const insights = await metaRepository.getInsightsByCampaign(camp.id, 7);
                if (!insights.length) continue;
                insights.forEach((i: any) => {
                    totalGasto   += Number(i.spend);
                    totalImpr    += Number(i.impressions);
                    totalCliques += Number(i.clicks);
                    totalConv    += Number(i.conversions);
                    totalRoas    += Number(i.roas);
                    count++;
                });
            }

            const ctrGeral = totalImpr > 0 ? ((totalCliques / totalImpr) * 100).toFixed(2) : '0';
            const roasMed  = count > 0 ? (totalRoas / count).toFixed(2) : '0';

            return `**Overview dos últimos 7 dias (${activeCampaigns.length} campanhas ativas):**\n\n• Gasto total: R$${totalGasto.toFixed(2)}\n• Impressões: ${totalImpr.toLocaleString('pt-BR')}\n• Cliques: ${totalCliques.toLocaleString('pt-BR')}\n• CTR geral: ${ctrGeral}%\n• Conversões: ${totalConv}\n• ROAS médio: ${roasMed}x\n• CPA médio: ${totalConv > 0 ? `R$${(totalGasto / totalConv).toFixed(2)}` : 'N/A'}`;
        }

        if (toolName === 'comparar_campanhas') {
            const dias = toolInput.dias || 7;
            const ids: string[] = toolInput.campaign_ids;
            const results: string[] = [];

            for (const id of ids) {
                const insights = await metaRepository.getInsightsByCampaign(id, dias);
                if (!insights.length) { results.push(`Campanha ${id}: sem dados`); continue; }
                const gasto = insights.reduce((s: number, i: any) => s + Number(i.spend), 0);
                const conv  = insights.reduce((s: number, i: any) => s + Number(i.conversions), 0);
                const ctr   = insights.reduce((s: number, i: any) => s + Number(i.ctr), 0) / insights.length;
                const roas  = insights.reduce((s: number, i: any) => s + Number(i.roas), 0) / insights.length;
                results.push(`Campanha ${id}:\n  Gasto: R$${gasto.toFixed(2)} | CTR: ${ctr.toFixed(2)}% | Conv: ${conv} | ROAS: ${roas.toFixed(2)}x | CPA: ${conv > 0 ? `R$${(gasto / conv).toFixed(2)}` : 'N/A'}`);
            }

            return `Comparativo dos últimos ${dias} dias:\n\n${results.join('\n\n')}`;
        }

        return `Ferramenta "${toolName}" não reconhecida.`;
    } catch (err: any) {
        return `Erro ao executar ${toolName}: ${err.message}`;
    }
}

// ─── Message Types ─────────────────────────────────────────────────────────────
export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

// ─── Stream Chat (SSE) ─────────────────────────────────────────────────────────
export async function streamAgentChat(
    userId: string,
    messages: ChatMessage[],
    res: Response
): Promise<void> {
    if (!OPENAI_API_KEY) {
        res.write(`data: ${JSON.stringify({ type: 'error', text: 'OPENAI_API_KEY não configurada.' })}\n\n`);
        res.end();
        return;
    }

    const apiMessages: any[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const headers: any = {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
    };
    if (OPENAI_ORG_ID) headers['OpenAI-Organization'] = OPENAI_ORG_ID;

    try {
        // Agentic loop — continua até não haver mais tool calls
        while (true) {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: OPENAI_MODEL,
                    max_tokens: 4096,
                    messages: apiMessages,
                    tools: AGENT_TOOLS,
                    tool_choice: 'auto',
                    stream: true,
                },
                { headers, responseType: 'stream', timeout: 60000 }
            );

            let fullText = '';
            const toolCallsMap: Record<number, { id: string; name: string; arguments: string }> = {};
            let finishReason = '';

            await new Promise<void>((resolve, reject) => {
                let buffer = '';

                response.data.on('data', (chunk: Buffer) => {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // keep incomplete line

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') { resolve(); return; }

                        try {
                            const parsed = JSON.parse(data);
                            const choice = parsed.choices?.[0];
                            if (!choice) continue;

                            if (choice.finish_reason) finishReason = choice.finish_reason;

                            const delta = choice.delta;
                            if (!delta) continue;

                            // Text content
                            if (delta.content) {
                                fullText += delta.content;
                                res.write(`data: ${JSON.stringify({ type: 'text', text: delta.content })}\n\n`);
                            }

                            // Tool calls
                            if (delta.tool_calls) {
                                for (const tc of delta.tool_calls) {
                                    const idx = tc.index ?? 0;
                                    if (!toolCallsMap[idx]) {
                                        toolCallsMap[idx] = { id: tc.id || '', name: '', arguments: '' };
                                    }
                                    if (tc.id) toolCallsMap[idx].id = tc.id;
                                    if (tc.function?.name) toolCallsMap[idx].name += tc.function.name;
                                    if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
                                }
                            }
                        } catch { /* skip malformed chunks */ }
                    }
                });

                response.data.on('end', resolve);
                response.data.on('error', reject);
            });

            // Se não houve tool calls, encerra
            const toolCalls = Object.values(toolCallsMap);
            if (finishReason !== 'tool_calls' || toolCalls.length === 0) break;

            // Adiciona resposta do assistente ao histórico
            apiMessages.push({
                role: 'assistant',
                content: fullText || null,
                tool_calls: toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: tc.arguments },
                })),
            });

            // Emite evento de ferramentas sendo usadas
            res.write(`data: ${JSON.stringify({ type: 'tool_calls', tools: toolCalls.map(t => t.name) })}\n\n`);

            // Executa cada tool call e adiciona resultados
            for (const tc of toolCalls) {
                let input: Record<string, any> = {};
                try { input = JSON.parse(tc.arguments); } catch { /* uso com args vazios */ }

                const result = await executeTool(tc.name, input, userId);

                apiMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: result,
                });
            }
        }

        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', text: err.message })}\n\n`);
    } finally {
        res.end();
    }
}
