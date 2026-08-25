// ==============================
// TrafficAI — Leads Controller
// Captura nome/email/telefone no site de marketing (antes do redirect pro
// signup/Stripe) e replica direto pra uma planilha Google Sheets via webhook
// (Apps Script Web App). Público — sem JWT, sem plan guard.
// ==============================

import { Router, Request, Response } from 'express';
import { logger } from '../shared/logger';

const router = Router();

const WEBHOOK_URL = process.env.GOOGLE_SHEETS_LEADS_WEBHOOK_URL;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', async (req: Request, res: Response) => {
    const { name, email, phone, plan } = req.body as {
        name?: string; email?: string; phone?: string; plan?: string;
    };

    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
        res.status(400).json({ success: false, error: { message: 'Nome, email e telefone são obrigatórios' } });
        return;
    }
    if (!EMAIL_RE.test(email.trim())) {
        res.status(400).json({ success: false, error: { message: 'Email inválido' } });
        return;
    }

    const payload = {
        date: new Date().toISOString(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        plan: plan?.trim() || '',
    };

    if (WEBHOOK_URL) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const resp = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!resp.ok) {
                logger.error('Webhook de leads (Google Sheets) respondeu erro', { status: resp.status, payload });
            }
        } catch (error: any) {
            // Não bloqueia o usuário por falha no webhook — só loga pra investigar depois.
            logger.error('Falha ao enviar lead pro Google Sheets', { error: error.message, payload });
        }
    } else {
        logger.warn('GOOGLE_SHEETS_LEADS_WEBHOOK_URL não configurada — lead não foi salvo na planilha', { payload });
    }

    res.json({ success: true, data: { message: 'Recebido' } });
});

export const leadsController = router;
