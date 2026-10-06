// ==============================
// TrafficAI — Funil configurável por fonte de tracking
// Antes os 5 estágios (Lead/Contact/Schedule/Purchase/Lead_Desqualificado)
// eram fixos no frontend (tracking/page.tsx, tab CRM). Agora são dados
// editáveis por fonte: label, ordem, visibilidade, valor/moeda padrão.
// ==============================

import { query, transaction } from '../database/connection';

export interface FunnelStage {
    id: string;
    event_name: string;
    label: string;
    position: number;
    visible: boolean;
    default_value: number | null;
    default_currency: string | null;
    default_content_name: string | null;
    button_patterns: string[] | null;
}

export interface FunnelStageInput {
    event_name: string;
    label: string;
    position: number;
    visible: boolean;
    default_value?: number | null;
    default_currency?: string | null;
    default_content_name?: string | null;
    // NOVO: Padrões de texto para detecção automática de cliques em botões (quiz funnel)
    button_patterns?: string[] | null;
}

// Estágios que já existiam hardcoded no frontend — usados como seed na
// primeira vez que uma fonte pede a configuração do funil.
const DEFAULT_STAGES: FunnelStageInput[] = [
    { event_name: 'Lead', label: 'Lead entrou', position: 1, visible: true },
    { event_name: 'Contact', label: 'Qualificado', position: 2, visible: true },
    { event_name: 'Schedule', label: 'Agendou reunião', position: 3, visible: true },
    { event_name: 'Purchase', label: 'Venda fechada', position: 4, visible: true },
    { event_name: 'Lead_Desqualificado', label: 'Perdido/Desqualificado', position: 5, visible: true },
];

export async function getFunnelConfiguration(sourceId: string): Promise<FunnelStage[]> {
    const rows = await query<FunnelStage>(
        `SELECT id, event_name, label, position, visible, default_value, default_currency, default_content_name
         FROM tracking_funnel_stages WHERE source_id = $1 ORDER BY position ASC`,
        [sourceId]
    );
    if (rows.length > 0) return rows;

    // Sem configuração ainda — semeia com os estágios padrão.
    return transaction(async (txQuery) => {
        for (const stage of DEFAULT_STAGES) {
            await txQuery(
                `INSERT INTO tracking_funnel_stages (source_id, event_name, label, position, visible)
                 VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (source_id, event_name) DO NOTHING`,
                [sourceId, stage.event_name, stage.label, stage.position, stage.visible]
            );
        }
        return txQuery(
            `SELECT id, event_name, label, position, visible, default_value, default_currency, default_content_name
             FROM tracking_funnel_stages WHERE source_id = $1 ORDER BY position ASC`,
            [sourceId]
        );
    });
}

export async function updateFunnelConfiguration(
    sourceId: string, stages: FunnelStageInput[]
): Promise<FunnelStage[]> {
    return transaction(async (txQuery) => {
        await txQuery(`DELETE FROM tracking_funnel_stages WHERE source_id = $1`, [sourceId]);
        const normalized = [...stages].sort((a, b) => a.position - b.position);
        for (let i = 0; i < normalized.length; i++) {
            const s = normalized[i]!;
            await txQuery(
                `INSERT INTO tracking_funnel_stages
                    (source_id, event_name, label, position, visible, default_value, default_currency, default_content_name)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    sourceId, s.event_name, s.label, i + 1, s.visible,
                    s.default_value ?? null, s.default_currency ?? null, s.default_content_name ?? null,
                ]
            );
        }
        return txQuery(
            `SELECT id, event_name, label, position, visible, default_value, default_currency, default_content_name
             FROM tracking_funnel_stages WHERE source_id = $1 ORDER BY position ASC`,
            [sourceId]
        );
    });
}
