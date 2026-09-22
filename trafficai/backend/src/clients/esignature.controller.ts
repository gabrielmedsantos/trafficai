// ==============================
// TrafficAI — Configuração de assinatura eletrônica (ZapSign)
// Cada usuário (agência) conecta a própria conta ZapSign. Ao salvar o
// token, já registramos o webhook de "documento assinado" automaticamente
// — o usuário não precisa mexer em nada no painel da ZapSign além de gerar
// o próprio token de API.
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { logger } from '../shared/logger';
import { encrypt } from '../shared/encryption';
import { zapsignValidateToken, zapsignRegisterWebhook } from './zapsign.client';

const router = Router();
router.use(authMiddleware);

// GET /settings/esignature — se a conta já tem ZapSign configurada
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const row = await queryOne<{ zapsign_api_token: string | null }>(
            `SELECT zapsign_api_token FROM users WHERE id = $1`, [userId]
        );
        res.json({ success: true, data: { configured: !!row?.zapsign_api_token } });
    } catch (error: any) {
        logger.error('Erro ao buscar config de assinatura eletrônica', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /settings/esignature/zapsign-token — salva o token e registra o webhook
router.put('/zapsign-token', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { api_token } = req.body;
        if (!api_token || typeof api_token !== 'string') {
            return res.status(400).json({ success: false, error: { message: 'Token da ZapSign é obrigatório' } });
        }

        const valid = await zapsignValidateToken(api_token);
        if (!valid) {
            return res.status(400).json({ success: false, error: { message: 'Token inválido — confira em ZapSign > Integrações > API' } });
        }

        const webhookSecret = process.env.ZAPSIGN_WEBHOOK_SECRET;
        if (!webhookSecret) {
            logger.error('ZAPSIGN_WEBHOOK_SECRET não configurado no servidor');
            return res.status(500).json({ success: false, error: { message: 'Configuração do servidor incompleta' } });
        }
        const webhookUrl = `${(process.env.PUBLIC_API_URL || 'https://api.alfamaxdigital.com.br').replace(/\/$/, '')}/api/v1/commercial/webhooks/zapsign`;
        await zapsignRegisterWebhook(api_token, webhookUrl, webhookSecret);

        await query(`UPDATE users SET zapsign_api_token = $2, updated_at = NOW() WHERE id = $1`, [userId, encrypt(api_token)]);

        res.json({ success: true });
    } catch (error: any) {
        logger.error('Erro ao salvar token ZapSign', { error: error.message });
        res.status(400).json({ success: false, error: { message: error.message || 'Erro ao salvar token' } });
    }
});

// DELETE /settings/esignature/zapsign-token — desconecta
router.delete('/zapsign-token', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        await query(`UPDATE users SET zapsign_api_token = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Erro ao remover token ZapSign', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const esignatureController = router;
