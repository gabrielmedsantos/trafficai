// ==============================
// TrafficAI — CRM Auto-Sync Worker
// Roda o backfill de Purchase automaticamente pra todas as fontes com CRM
// configurado. Garante que leads ganhos no Kommo viram Purchase na Meta
// SEM depender de Salesbot configurado pelo usuário.
//
// Idempotente: event_id = kommo-{leadId}-Purchase + ON CONFLICT DO NOTHING
// + Meta dedupe automático. Rodar várias vezes não duplica.
//
// Frequência: 1x por dia às 04:30 UTC (01:30 BRT), depois do billing worker.
//   - Tempo real continua via Salesbot do Kommo (quando configurado)
//   - Pra Purchase, latência diária é OK: Meta aceita até 7 dias
//   - Não pesa Kommo API nem banco
// ==============================

import cron from 'node-cron';
import { query } from '../database/connection';
import { backfillSource } from '../tracking/crm-sync.service';
import { logger } from '../shared/logger';

export interface CrmSyncResult {
    sources_processed: number;
    sources_skipped: number;
    purchases_created: number;
    enriched: number;
    failed: number;
}

/**
 * Roda o auto-sync pra todas as fontes elegíveis (CRM configurado + ativa + token).
 */
export async function runCrmAutoSync(): Promise<CrmSyncResult> {
    const sources = await query<{ id: string; name: string }>(
        `SELECT id, name FROM tracking_sources
         WHERE is_active = true
           AND crm_type IS NOT NULL
           AND crm_access_token IS NOT NULL
           AND crm_subdomain IS NOT NULL
           AND pixel_id IS NOT NULL
           AND access_token IS NOT NULL`
    );

    const total: CrmSyncResult = {
        sources_processed: 0,
        sources_skipped: 0,
        purchases_created: 0,
        enriched: 0,
        failed: 0,
    };

    for (const s of sources) {
        try {
            const r = await backfillSource(s.id, {
                sync_won_purchases: true,
                enrich_existing: true,   // também aproveita pra enriquecer eventos sem PII
                time_strategy: 'clamp_7d',
            });
            total.sources_processed++;
            total.purchases_created += r.purchases_created;
            total.enriched += r.enriched;
            total.failed += r.failed;
            if (r.purchases_created > 0 || r.enriched > 0) {
                logger.info(
                    `🔄 CRM auto-sync [${s.name}]: ${r.purchases_created} Purchase novo(s), ${r.enriched} enriquecido(s)`
                );
            }
        } catch (err: any) {
            total.failed++;
            logger.warn(`CRM auto-sync falhou pra [${s.name}]`, { error: err.message, source_id: s.id });
        }
    }

    total.sources_skipped = sources.length - total.sources_processed;
    return total;
}

export function startCrmSyncWorker() {
    // 04:30 UTC = 01:30 BRT — depois do billing worker (04:00 UTC)
    cron.schedule('30 4 * * *', async () => {
        try {
            const r = await runCrmAutoSync();
            logger.info(
                `🔄 CRM auto-sync diário: ${r.sources_processed} fonte(s), ${r.purchases_created} Purchase, ${r.enriched} enriquecido(s), ${r.failed} falha(s)`
            );
        } catch (err: any) {
            logger.error('CRM auto-sync worker falhou', { error: err.message });
        }
    });

    logger.info('🔄 CRM auto-sync worker started (diário às 04:30 UTC / 01:30 BRT)');
}
