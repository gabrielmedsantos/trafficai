// ==============================
// TrafficAI — Notification Settings Controller
// ==============================

import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { authMiddleware } from '../auth/auth.middleware';
import { notificationService } from './notification.service';
import { getVapidPublicKey, saveSubscription, removeSubscription } from './push.service';
import { logger } from '../shared/logger';

const router = Router();
router.use(authMiddleware);

// GET /settings/notifications — busca configurações do usuário
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        const rows = await query(
            `SELECT id, email_enabled, notification_email,
                    whatsapp_enabled, whatsapp_number, whatsapp_provider,
                    uazapi_url,
                    evolution_api_url, evolution_instance,
                    zapi_instance_id,
                    notify_critical, notify_warning, notify_info,
                    quiet_hours_enabled, quiet_start, quiet_end,
                    owner_whatsapp, daily_report_approval_required,
                    push_enabled,
                    created_at, updated_at
             FROM notification_settings WHERE user_id = $1 LIMIT 1`,
            [userId]
        );

        if (rows.length === 0) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error: any) {
        logger.error('Erro ao buscar configurações de notificação', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// PUT /settings/notifications — salva/atualiza configurações
router.put('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const {
            email_enabled, notification_email, resend_api_key,
            whatsapp_enabled, whatsapp_number, whatsapp_provider,
            uazapi_url, uazapi_token,
            evolution_api_url, evolution_api_key, evolution_instance,
            zapi_instance_id, zapi_token, zapi_client_token,
            notify_critical, notify_warning, notify_info,
            quiet_hours_enabled, quiet_start, quiet_end,
            owner_whatsapp, daily_report_approval_required,
            push_enabled,
        } = req.body;

        await query(
            `INSERT INTO notification_settings (
                user_id,
                email_enabled, notification_email, resend_api_key,
                whatsapp_enabled, whatsapp_number, whatsapp_provider,
                uazapi_url, uazapi_token,
                evolution_api_url, evolution_api_key, evolution_instance,
                zapi_instance_id, zapi_token, zapi_client_token,
                notify_critical, notify_warning, notify_info,
                quiet_hours_enabled, quiet_start, quiet_end,
                owner_whatsapp, daily_report_approval_required,
                push_enabled,
                updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                email_enabled = EXCLUDED.email_enabled,
                notification_email = EXCLUDED.notification_email,
                resend_api_key = COALESCE(EXCLUDED.resend_api_key, notification_settings.resend_api_key),
                whatsapp_enabled = EXCLUDED.whatsapp_enabled,
                whatsapp_number = EXCLUDED.whatsapp_number,
                whatsapp_provider = EXCLUDED.whatsapp_provider,
                uazapi_url = EXCLUDED.uazapi_url,
                uazapi_token = COALESCE(EXCLUDED.uazapi_token, notification_settings.uazapi_token),
                evolution_api_url = EXCLUDED.evolution_api_url,
                evolution_api_key = COALESCE(EXCLUDED.evolution_api_key, notification_settings.evolution_api_key),
                evolution_instance = EXCLUDED.evolution_instance,
                zapi_instance_id = EXCLUDED.zapi_instance_id,
                zapi_token = COALESCE(EXCLUDED.zapi_token, notification_settings.zapi_token),
                zapi_client_token = COALESCE(EXCLUDED.zapi_client_token, notification_settings.zapi_client_token),
                notify_critical = EXCLUDED.notify_critical,
                notify_warning = EXCLUDED.notify_warning,
                notify_info = EXCLUDED.notify_info,
                quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
                quiet_start = EXCLUDED.quiet_start,
                quiet_end = EXCLUDED.quiet_end,
                owner_whatsapp = EXCLUDED.owner_whatsapp,
                daily_report_approval_required = EXCLUDED.daily_report_approval_required,
                push_enabled = EXCLUDED.push_enabled,
                updated_at = NOW()`,
            [
                userId,
                email_enabled ?? true, notification_email || null, resend_api_key || null,
                whatsapp_enabled ?? false, whatsapp_number || null, whatsapp_provider || 'uazapi',
                uazapi_url || null, uazapi_token || null,
                evolution_api_url || null, evolution_api_key || null, evolution_instance || null,
                zapi_instance_id || null, zapi_token || null, zapi_client_token || null,
                notify_critical ?? true, notify_warning ?? true, notify_info ?? false,
                quiet_hours_enabled ?? false, quiet_start || '22:00', quiet_end || '08:00',
                owner_whatsapp || null, daily_report_approval_required ?? false,
                push_enabled ?? false,
            ]
        );

        res.json({ success: true, data: { message: 'Configurações salvas com sucesso' } });
    } catch (error: any) {
        logger.error('Erro ao salvar configurações de notificação', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro ao salvar configurações' } });
    }
});

// POST /settings/notifications/test — envia notificação de teste
router.post('/test', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { channel } = req.body as { channel: 'email' | 'whatsapp' | 'push' };

        if (!['email', 'whatsapp', 'push'].includes(channel)) {
            return res.status(400).json({ success: false, error: { message: 'Canal inválido. Use: email | whatsapp | push' } });
        }

        const result = await notificationService.sendTestNotification(userId, channel);

        if (result.success) {
            res.json({ success: true, data: { message: result.message } });
        } else {
            res.status(400).json({ success: false, error: { message: result.message } });
        }
    } catch (error: any) {
        logger.error('Erro ao enviar notificação de teste', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro ao enviar teste' } });
    }
});

// GET /settings/notifications/push/vapid-public-key
router.get('/push/vapid-public-key', async (req: Request, res: Response) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
        return res.status(503).json({ success: false, error: { message: 'Push notifications não configuradas no servidor' } });
    }
    res.json({ success: true, data: { publicKey } });
});

// POST /settings/notifications/push/subscribe
router.post('/push/subscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({ success: false, error: { message: 'Assinatura de push inválida' } });
        }

        await saveSubscription(userId, endpoint, keys.p256dh, keys.auth, req.get('User-Agent'));
        res.json({ success: true, data: { message: 'Push inscrito com sucesso' } });
    } catch (error: any) {
        logger.error('Erro ao salvar inscrição de push', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

// POST /settings/notifications/push/unsubscribe
router.post('/push/unsubscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { endpoint } = req.body as { endpoint: string };

        if (!endpoint) {
            return res.status(400).json({ success: false, error: { message: 'endpoint é obrigatório' } });
        }

        await removeSubscription(userId, endpoint);
        res.json({ success: true, data: { message: 'Push removido' } });
    } catch (error: any) {
        logger.error('Erro ao remover inscrição de push', { error: error.message });
        res.status(500).json({ success: false, error: { message: 'Erro interno' } });
    }
});

export const notificationController = router;
