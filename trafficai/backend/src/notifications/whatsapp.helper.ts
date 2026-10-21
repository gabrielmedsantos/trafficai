// ==============================
// WhatsApp Helper — envio direto (Evolution API global)
// Usado por workers de alerta que não passam pelo daily-whatsapp
// ==============================

import axios from 'axios';
import { query } from '../database/connection';
import { logger } from '../shared/logger';

const EV_BASE = process.env.EVOLUTION_API_BASE_URL || '';
const EV_KEY = process.env.EVOLUTION_API_KEY || '';

function normalizePhone(phone: string): string {
    if (phone.includes('@g.us') || phone.includes('@s.whatsapp.net')) return phone.trim();
    return phone.replace(/\D/g, '');
}

/**
 * Envia msg pra WhatsApp usando a instância Evolution conectada do user.
 * Fallback: usa ENV global se instance específica não existir.
 * mentionsEveryOne: só tem efeito quando o destinatário é um grupo (JID @g.us) —
 * a Evolution API ignora o campo pra conversas individuais.
 */
export async function sendWhatsAppMessage(userId: string, phone: string, text: string, mentionsEveryOne = false): Promise<void> {
    if (!phone) throw new Error('phone vazio');
    if (!EV_BASE) throw new Error('EVOLUTION_API_BASE_URL não configurada');

    // Busca instance ativa do user
    const integ = await query<any>(
        `SELECT config, credentials FROM comm_integrations
         WHERE user_id = $1 AND type = 'whatsapp_evolution' AND status = 'connected'
         ORDER BY connected_at DESC NULLS LAST LIMIT 1`,
        [userId]
    );
    let instance = '';
    let baseUrl = EV_BASE;
    let apiKey = EV_KEY;
    if (integ.length) {
        const cfg = integ[0].config || {};
        const creds = integ[0].credentials || {};
        instance = cfg.instanceName || cfg.instance || '';
        baseUrl = cfg.baseUrl || baseUrl;
        apiKey = creds.apiKey || apiKey;
    }
    // Mesma conexão que envia os relatórios diários (Configurações > Notificações).
    // É a reserva quando a integração acima não existe ou já não está conectada na Evolution.
    const ns = await query<any>(
        `SELECT evolution_api_url, evolution_api_key, evolution_instance FROM notification_settings
         WHERE user_id = $1 AND whatsapp_provider = 'evolution' AND COALESCE(evolution_instance, '') <> ''`,
        [userId]
    ).catch(() => [] as any[]);
    const targets: Array<{ instance: string; baseUrl: string; apiKey: string }> = [];
    if (instance) targets.push({ instance, baseUrl, apiKey });
    if (ns.length && ns[0].evolution_instance !== instance) {
        targets.push({ instance: ns[0].evolution_instance, baseUrl: ns[0].evolution_api_url || EV_BASE, apiKey: ns[0].evolution_api_key || EV_KEY });
    }
    if (!targets.length) throw new Error('nenhuma instância Evolution conectada pro user');

    const number = normalizePhone(phone);
    const isGroup = number.includes('@g.us');
    let lastError = '';
    for (const target of targets) {
        const url = `${target.baseUrl.replace(/\/$/, '')}/message/sendText/${target.instance}`;
        try {
            await axios.post(url, { number, text, ...(mentionsEveryOne && isGroup ? { mentionsEveryOne: true } : {}) }, {
                headers: { apikey: target.apiKey, 'Content-Type': 'application/json' },
                timeout: 15000,
            });
            return;
        } catch (err: any) {
            lastError = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            logger.warn('WhatsApp: envio falhou nesta conexão', { instance: target.instance, error: String(lastError).slice(0, 200) });
        }
    }
    throw new Error(`Evolution API erro: ${lastError}`);
}
