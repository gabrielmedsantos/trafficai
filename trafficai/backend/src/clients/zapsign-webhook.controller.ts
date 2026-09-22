// ==============================
// TrafficAI — Webhook público da ZapSign
// Recebe o evento "doc_signed" e baixa o PDF assinado (a URL da ZapSign
// expira em 60min, então baixa e guarda os bytes na hora). Autenticado por
// um header customizado (X-TAI-Zapsign-Secret) que NÓS definimos ao
// registrar o webhook — a ZapSign não assina os webhooks dela mesma.
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { logger } from '../shared/logger';
import { downloadZapsignFile } from './zapsign.client';

const router = Router();

router.post('/zapsign', async (req: Request, res: Response): Promise<void> => {
    try {
        const secret = req.headers['x-tai-zapsign-secret'];
        if (!process.env.ZAPSIGN_WEBHOOK_SECRET || secret !== process.env.ZAPSIGN_WEBHOOK_SECRET) {
            res.status(401).json({ success: false, error: { message: 'Webhook não autenticado' } });
            return;
        }

        const { token, status, signed_file: signedFile, event_type: eventType } = req.body;
        if (!token) { res.json({ success: true }); return; }

        const row = await queryOne<{ id: string }>(
            `SELECT id FROM contract_signatures WHERE zapsign_token = $1`, [token]
        );
        if (!row) { res.json({ success: true }); return; }

        if (eventType === 'doc_signed' && status === 'signed' && signedFile) {
            const pdfBuffer = await downloadZapsignFile(signedFile);
            await query(
                `UPDATE contract_signatures SET status = 'signed', signed_file_data = $2, signed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [row.id, pdfBuffer]
            );
        } else if (status) {
            await query(
                `UPDATE contract_signatures SET status = $2, updated_at = NOW() WHERE id = $1`,
                [row.id, status === 'signed' ? 'signed' : status]
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        logger.error('Erro no webhook ZapSign', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const zapsignWebhookController = router;
