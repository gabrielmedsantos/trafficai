// ==============================
// TrafficAI — Notificações de venda (estilo UTMify)
// "Venda aprovada! Valor: R$ 1.275,48" no celular/computador a cada pedido.
// Formato e tag próprios (sale-*) pra não misturar com os alertas de conta:
// título com emoji de venda, clique abre Tracking → Pedidos/Recuperação.
// ==============================

import { query } from '../database/connection';
import { logger } from '../shared/logger';
import { sendPushToUser } from '../notifications/push.service';
import { notificationService } from '../notifications/notification.service';
import { normalizeSalesSettings, SalesNotifySettings } from './sales-report.service';
import { parseUtmId } from './utm';

export interface SaleNotice {
    order_id: string;
    status: string;           // approved | pending | abandoned | refused | ...
    payment_method?: string | null;
    gross_value?: number | null;
    net_value?: number | null;
    product_name?: string | null;
    customer_name?: string | null;
    utm_campaign?: string | null;
}

type Kind = keyof Pick<SalesNotifySettings, 'approved' | 'pix' | 'boleto' | 'abandoned' | 'refused'>;

const KIND: Record<Kind, { title: string; url: string }> = {
    approved: { title: '💰 Venda aprovada!', url: '/vendas/pedidos' },
    pix: { title: '⏳ Pix gerado', url: '/vendas/recuperacao' },
    boleto: { title: '📄 Boleto gerado', url: '/vendas/recuperacao' },
    abandoned: { title: '🛒 Carrinho abandonado', url: '/vendas/recuperacao' },
    refused: { title: '❌ Pagamento recusado', url: '/vendas/recuperacao' },
};

function kindOf(n: SaleNotice): Kind | null {
    if (n.status === 'approved') return 'approved';
    if (n.status === 'abandoned') return 'abandoned';
    if (n.status === 'refused') return 'refused';
    if (n.status === 'pending') return n.payment_method === 'boleto' ? 'boleto' : n.payment_method === 'pix' ? 'pix' : null;
    return null;
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Monta título + linhas da notificação (mesmo texto no push e no WhatsApp). */
export function buildSaleNotice(sourceName: string, n: SaleNotice): { kind: Kind; title: string; lines: string[]; url: string } | null {
    const kind = kindOf(n);
    if (!kind) return null;
    const value = n.gross_value ?? n.net_value;
    const lines: string[] = [];
    if (value != null) {
        const net = kind === 'approved' && n.net_value != null && n.gross_value != null && n.net_value < n.gross_value
            ? ` · você recebe ${brl(n.net_value)}` : '';
        lines.push(`Valor: ${brl(value)}${net}`);
    }
    lines.push([sourceName, n.product_name].filter(Boolean).join(' · '));
    const campaign = parseUtmId(n.utm_campaign).name;
    if (campaign) lines.push(`Campanha: ${campaign}`);
    return { kind, title: KIND[kind].title, lines, url: KIND[kind].url };
}

/**
 * Dispara a notificação de um pedido que acabou de mudar de status. Nunca
 * lança erro (roda depois de responder o webhook da plataforma).
 */
export async function notifySale(sourceId: string, n: SaleNotice): Promise<void> {
    try {
        const [src] = await query<{ user_id: string; name: string; sales_settings: any }>(
            `SELECT user_id, name, sales_settings FROM tracking_sources WHERE id = $1`, [sourceId]
        );
        if (!src) return;
        const prefs = normalizeSalesSettings(src.sales_settings).notify;
        const notice = buildSaleNotice(src.name, n);
        if (!notice || !prefs[notice.kind]) return;

        const tasks: Promise<unknown>[] = [];
        if (prefs.push) {
            tasks.push(sendPushToUser(src.user_id, {
                title: notice.title,
                body: notice.lines.join('\n'),
                url: notice.url,
                tag: `sale-${n.order_id}-${notice.kind}`,
            }));
        }
        if (prefs.whatsapp) {
            tasks.push(notificationService.sendWhatsAppText(src.user_id, [`*${notice.title}*`, ...notice.lines].join('\n')));
        }
        await Promise.allSettled(tasks);
        logger.info('notificação de venda enviada', { source: sourceId, order: n.order_id, kind: notice.kind, push: prefs.push, whatsapp: prefs.whatsapp });
    } catch (err: any) {
        logger.warn('notificação de venda falhou', { source: sourceId, error: err.message });
    }
}

/** Envio de teste pela tela de configuração: um exemplo de venda aprovada. */
export async function sendTestSaleNotice(sourceId: string): Promise<{ push: number; whatsapp: boolean }> {
    const [src] = await query<{ user_id: string; name: string; sales_settings: any }>(
        `SELECT user_id, name, sales_settings FROM tracking_sources WHERE id = $1`, [sourceId]
    );
    if (!src) return { push: 0, whatsapp: false };
    const prefs = normalizeSalesSettings(src.sales_settings).notify;
    const notice = buildSaleNotice(src.name, {
        order_id: 'teste', status: 'approved', gross_value: 197, net_value: 179.31,
        product_name: 'Produto de exemplo', utm_campaign: 'Campanha de exemplo|000000',
    })!;
    const lines = [...notice.lines, '(notificação de teste)'];
    const push = prefs.push
        ? (await sendPushToUser(src.user_id, { title: notice.title, body: lines.join('\n'), url: notice.url, tag: 'sale-teste' })).sent
        : 0;
    const whatsapp = prefs.whatsapp
        ? await notificationService.sendWhatsAppText(src.user_id, [`*${notice.title}*`, ...lines].join('\n'))
        : false;
    return { push, whatsapp };
}
