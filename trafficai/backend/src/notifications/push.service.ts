// ==============================
// TrafficAI — Web Push Service
// Envia notificações push para dispositivos inscritos (PWA instalado, browser).
// ==============================

import webpush from 'web-push';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        `mailto:${process.env.VAPID_CONTACT_EMAIL || 'suporte@alfamaxdigital.com.br'}`,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
} else {
    logger.warn('Push: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas — push notifications desabilitadas');
}

export interface PushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
}

export function getVapidPublicKey(): string {
    return VAPID_PUBLIC_KEY;
}

export async function saveSubscription(
    userId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    userAgent?: string
): Promise<void> {
    await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            p256dh = EXCLUDED.p256dh,
            auth = EXCLUDED.auth,
            user_agent = EXCLUDED.user_agent`,
        [userId, endpoint, p256dh, auth, userAgent || null]
    );
}

export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
    await query(
        `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
        [userId, endpoint]
    );
}

/**
 * Envia push pra todos os dispositivos inscritos do usuário.
 * Remove automaticamente assinaturas expiradas (404/410 da Push API).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return { sent: 0, failed: 0 };
    }

    const subs = await query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
        [userId]
    );

    let sent = 0;
    let failed = 0;

    await Promise.allSettled(
        subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    JSON.stringify(payload)
                );
                sent++;
            } catch (err: any) {
                failed++;
                // 404/410 = assinatura expirada ou revogada — limpa do banco
                if (err.statusCode === 404 || err.statusCode === 410) {
                    await query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {});
                } else {
                    logger.warn('Push falhou', { userId, statusCode: err.statusCode, error: err.message });
                }
            }
        })
    );

    return { sent, failed };
}
