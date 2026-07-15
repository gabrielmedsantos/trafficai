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
 */
export async function sendWhatsAppMessage(userId: string, phone: string, text: string): Promise<void> {
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
    if (!instance) throw new Error('nenhuma instância Evolution conectada pro user');

    const url = `${baseUrl.replace(/\/$/, '')}/message/sendText/${instance}`;
    const number = normalizePhone(phone);
    try {
        await axios.post(url, { number, text }, {
            headers: { apikey: apiKey, 'Content-Type': 'application/json' },
            timeout: 15000,
        });
    } catch (err: any) {
        const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        throw new Error(`Evolution API erro: ${detail}`);
    }
}
