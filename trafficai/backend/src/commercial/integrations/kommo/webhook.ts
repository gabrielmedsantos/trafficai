// ==============================
// TrafficAI — Kommo Webhook Handler
// Recebe eventos do Kommo (lead criado, atualizado, status changed) e atualiza
// comm_deals + comm_deal_stage_history em tempo real (sem esperar o cron).
//
// Requer: plano Kommo Avançado (que libera webhooks).
// Configurar no Kommo: URL = https://api.alfamaxdigital.../api/v1/commercial/webhooks/kommo/<integrationId>
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../../../database/connection';
import { logger } from '../../../shared/logger';
import { syncKommoIntegration } from './sync';

const router = Router();

interface KommoWebhookLead {
    id: string;        // strings no webhook!
    pipeline_id: string;
    status_id: string;
    old_status_id?: string;
    old_pipeline_id?: string;
    price?: string;
    responsible_user_id?: string;
}

interface KommoWebhookPayload {
    leads?: {
        add?: KommoWebhookLead[];
        update?: KommoWebhookLead[];
        delete?: Array<{ id: string }>;
        status?: KommoWebhookLead[];
    };
}

// ----- POST /commercial/webhooks/kommo/:integrationId -----
//
// O Kommo posta como application/x-www-form-urlencoded com chaves nested:
// leads[update][0][id]=123&leads[update][0][status_id]=456...
// Express já decodifica isso pra objeto aninhado quando express.urlencoded({ extended: true })
// está ativo (server.ts linha 65). Mas pra robustez também aceitamos JSON.

router.post('/kommo/:integrationId', async (req: Request, res: Response): Promise<void> => {
    const { integrationId } = req.params;
    try {
        const intg = await queryOne<{ user_id: string; client_id: string | null }>(
            `SELECT user_id, client_id FROM comm_integrations
             WHERE id = $1 AND type = 'kommo' AND status IN ('connected', 'connecting', 'error')`,
            [integrationId]
        );
        if (!intg) {
            // 200 mesmo (Kommo retry agressivo se receber 4xx/5xx)
            res.status(200).json({ success: false, error: { message: 'Integração não encontrada' } });
            return;
        }

        const payload = req.body as KommoWebhookPayload;
        const events = collectEvents(payload);

        if (events.length === 0) {
            res.json({ success: true, data: { processed: 0 } });
            return;
        }

        logger.info('Kommo webhook', { integrationId, events: events.length });

        // Estratégia: ao invés de processar cada evento isolado (e ter que replicar
        // toda a lógica de mapeamento), disparamos um sync incremental restrito.
        // O cron já faz isso a cada 30min — webhook só antecipa.
        // Em background pra responder o Kommo rápido (timeout dele é curto).
        syncKommoIntegration(integrationId, { incremental: true })
            .then(r => logger.info('Kommo webhook-triggered sync ok', { integrationId, leads: r.leads }))
            .catch(e => logger.warn('Kommo webhook sync falhou', { integrationId, error: e.message }));

        // Marca last_event_at imediatamente pra UI mostrar atividade
        await query(
            `UPDATE comm_integrations SET last_event_at = NOW() WHERE id = $1`,
            [integrationId]
        );

        res.json({ success: true, data: { processed: events.length, syncTriggered: true } });
    } catch (err: any) {
        logger.error('Erro no webhook Kommo', { integrationId, error: err.message });
        // Sempre 200 pra não acumular retries
        res.status(200).json({ success: false, error: { message: err.message } });
    }
});

function collectEvents(payload: KommoWebhookPayload): Array<{ type: string; leadId: string }> {
    const events: Array<{ type: string; leadId: string }> = [];
    const buckets = payload.leads || {};
    (buckets.add || []).forEach(l => events.push({ type: 'add', leadId: l.id }));
    (buckets.update || []).forEach(l => events.push({ type: 'update', leadId: l.id }));
    (buckets.status || []).forEach(l => events.push({ type: 'status', leadId: l.id }));
    (buckets.delete || []).forEach(l => events.push({ type: 'delete', leadId: l.id }));
    return events;
}

export const kommoWebhookController = router;
