// ==============================
// Daily Report Approval — endpoints públicos (acessados via WhatsApp)
// ==============================

import { Router, Request, Response } from 'express';
import { query, queryOne } from '../database/connection';
import { logger } from '../shared/logger';
import { dailyWhatsAppService } from './daily-whatsapp.service';

const router = Router();

interface ApprovalRow {
    id: string;
    user_id: string;
    account_id: string;
    report_date: Date;
    client_name: string | null;
    client_phone: string;
    message_text: string;
    approval_token: string;
    status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed';
    created_at: Date;
    approved_at: Date | null;
    sent_at: Date | null;
    error_message: string | null;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
}

function renderPage(opts: {
    title: string;
    subtitle?: string;
    body: string;
    accent?: 'green' | 'red' | 'gray';
}): string {
    const accentColors = {
        green: '#10b981',
        red: '#ef4444',
        gray: '#6b7280',
    };
    const accent = accentColors[opts.accent || 'gray'];
    return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(opts.title)} — TrafficAI</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0b0f1a; color: #e5e7eb; padding: 24px 16px; }
  .wrap { max-width: 540px; margin: 0 auto; }
  .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 24px; }
  h1 { margin: 0 0 6px; font-size: 22px; color: #fff; }
  .sub { margin: 0 0 18px; color: #9ca3af; font-size: 13px; }
  .preview { background: #0b1020; border: 1px solid #1f2937; border-left: 3px solid ${accent};
             border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 13px;
             line-height: 1.5; color: #e5e7eb; max-height: 360px; overflow-y: auto; margin-bottom: 18px; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 12px;
          color: #9ca3af; margin-bottom: 18px; }
  .meta strong { color: #e5e7eb; font-weight: 500; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  button { all: unset; cursor: pointer; padding: 12px 16px; border-radius: 8px; text-align: center;
           font-size: 14px; font-weight: 600; transition: filter 140ms; }
  button:hover { filter: brightness(1.08); }
  button:disabled { opacity: 0.5; cursor: wait; }
  .approve { background: #10b981; color: #fff; }
  .reject  { background: #1f2937; color: #f87171; border: 1px solid #374151; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px;
           font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
           background: ${accent}1a; color: ${accent}; border: 1px solid ${accent}40; }
  .footer { text-align: center; margin-top: 18px; font-size: 11px; color: #6b7280; }
</style>
</head><body>
<div class="wrap">
  <div class="card">${opts.body}</div>
  <div class="footer">TrafficAI — aprovação de relatório</div>
</div>
</body></html>`;
}

// ─── GET /r/:token — preview com botões aprovar/rejeitar ────────────────

router.get('/r/:token', async (req: Request, res: Response): Promise<void> => {
    const row = await queryOne<ApprovalRow>(
        `SELECT * FROM daily_report_approvals WHERE approval_token = $1`,
        [req.params.token]
    );

    if (!row) {
        res.status(404).type('html').send(renderPage({
            title: 'Link inválido',
            body: `<h1>Link inválido ou expirado</h1>
                   <p class="sub">Este link de aprovação não existe.</p>`,
            accent: 'gray',
        }));
        return;
    }

    if (row.status !== 'pending') {
        const labels = {
            approved: { txt: 'Aprovado', color: 'green' as const },
            sent: { txt: 'Enviado ao cliente', color: 'green' as const },
            rejected: { txt: 'Rejeitado', color: 'red' as const },
            failed: { txt: 'Falha no envio', color: 'red' as const },
        }[row.status as 'approved' | 'sent' | 'rejected' | 'failed'];

        res.type('html').send(renderPage({
            title: labels.txt,
            body: `<span class="badge">${labels.txt}</span>
                   <h1 style="margin-top:12px">${escapeHtml(row.client_name || 'Relatório')}</h1>
                   <p class="sub">Data: ${row.report_date.toISOString().slice(0, 10)} · Telefone: ${escapeHtml(row.client_phone)}</p>
                   ${row.error_message ? `<p style="color:#f87171">Erro: ${escapeHtml(row.error_message)}</p>` : ''}
                   <div class="preview">${escapeHtml(row.message_text)}</div>`,
            accent: labels.color,
        }));
        return;
    }

    // pending — render form
    res.type('html').send(renderPage({
        title: 'Aprovar relatório',
        body: `<span class="badge">Pendente</span>
               <h1 style="margin-top:12px">${escapeHtml(row.client_name || 'Cliente')}</h1>
               <p class="sub">Confira o conteúdo abaixo. Aprovando, a mensagem é enviada ao cliente via WhatsApp.</p>

               <div class="meta">
                 <span>Data:</span><strong>${row.report_date.toISOString().slice(0, 10)}</strong>
                 <span>Telefone:</span><strong>${escapeHtml(row.client_phone)}</strong>
               </div>

               <div class="preview">${escapeHtml(row.message_text)}</div>

               <div class="actions">
                 <button class="approve" id="approve-btn">✅ Aprovar e enviar pro cliente</button>
                 <button class="reject" id="reject-btn">✗ Rejeitar (não enviar)</button>
               </div>

               <script>
                 const t = ${JSON.stringify(row.approval_token)};
                 async function act(action) {
                   const ab = document.getElementById('approve-btn');
                   const rb = document.getElementById('reject-btn');
                   ab.disabled = true; rb.disabled = true;
                   try {
                     const r = await fetch('/api/v1/r/' + t + '/' + action, { method: 'POST' });
                     if (r.ok) { window.location.reload(); }
                     else {
                       const j = await r.json().catch(()=>null);
                       alert('Erro: ' + (j?.error?.message || r.statusText));
                       ab.disabled = false; rb.disabled = false;
                     }
                   } catch (e) {
                     alert('Erro de rede: ' + e.message);
                     ab.disabled = false; rb.disabled = false;
                   }
                 }
                 document.getElementById('approve-btn').onclick = () => act('approve');
                 document.getElementById('reject-btn').onclick  = () => act('reject');
               </script>`,
        accent: 'gray',
    }));
});

// ─── POST /r/:token/approve — aprova + dispara envio pro cliente ────────

router.post('/r/:token/approve', async (req: Request, res: Response): Promise<void> => {
    const row = await queryOne<ApprovalRow>(
        `SELECT * FROM daily_report_approvals WHERE approval_token = $1`,
        [req.params.token]
    );
    if (!row) { res.status(404).json({ success: false, error: { message: 'Aprovação não encontrada' } }); return; }
    if (row.status !== 'pending') {
        res.status(400).json({ success: false, error: { message: `Já está em status: ${row.status}` } });
        return;
    }

    try {
        await query(
            `UPDATE daily_report_approvals SET status = 'approved', approved_at = NOW() WHERE id = $1`,
            [row.id]
        );
        await dailyWhatsAppService.sendApproved(row.id);
        res.json({ success: true, data: { status: 'sent' } });
    } catch (err: any) {
        logger.error('Erro ao aprovar+enviar relatório', { error: err.message, approvalId: row.id });
        res.status(500).json({ success: false, error: { message: err.message } });
    }
});

// ─── POST /r/:token/reject — só marca como rejeitado ────────────────────

router.post('/r/:token/reject', async (req: Request, res: Response): Promise<void> => {
    const r = await query(
        `UPDATE daily_report_approvals SET status = 'rejected'
         WHERE approval_token = $1 AND status = 'pending'
         RETURNING id`,
        [req.params.token]
    );
    if (r.length === 0) { res.status(404).json({ success: false, error: { message: 'Não encontrado ou já processado' } }); return; }
    res.json({ success: true, data: { status: 'rejected' } });
});

export const approvalController = router;
