'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, CopyField, API_BASE, brtToday, shiftDate } from '@/components/vendas/shared';

const PLATFORMS = [
    {
        key: 'kiwify', name: 'Kiwify', ready: true,
        steps: [
            'Na Kiwify, abra Apps → Webhooks → Criar webhook.',
            'Cole a URL abaixo e escolha o produto (ou todos).',
            'Marque: Compra aprovada, Pix gerado, Boleto gerado, Carrinho abandonado, Compra recusada, Reembolso, Chargeback e, se vender assinatura, os 3 de assinatura.',
            'Salve e clique em Testar — o pedido de teste aparece em Pedidos.',
        ],
    },
    { key: 'hotmart', name: 'Hotmart', ready: false },
    { key: 'eduzz', name: 'Eduzz', ready: false },
    { key: 'monetizze', name: 'Monetizze', ready: false },
    { key: 'cakto', name: 'Cakto', ready: false },
];

export default function IntegracoesPage() {
    const { sourceId, source } = useVendas();
    const [detail, setDetail] = useState<any>(null);
    const [lastByPlatform, setLastByPlatform] = useState<Record<string, { at: string; count: number }>>({});

    useEffect(() => {
        if (!sourceId) return;
        setDetail(null);
        api.getTrackingSource(sourceId).then(setDetail).catch(() => setDetail(null));
        api.getSalesOrders(sourceId, { since: shiftDate(brtToday(), -29), until: brtToday(), limit: '500' }).then((orders) => {
            const m: Record<string, { at: string; count: number }> = {};
            for (const o of orders || []) {
                const cur = m[o.platform];
                m[o.platform] = { at: !cur || o.order_date > cur.at ? o.order_date : cur.at, count: (cur?.count || 0) + 1 };
            }
            setLastByPlatform(m);
        }).catch(() => setLastByPlatform({}));
    }, [sourceId]);

    const webhookUrl = source && detail?.webhook_secret ? `${API_BASE}/track/webhook/${source.public_token}?key=${detail.webhook_secret}` : '';

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12, alignItems: 'start' }}>
            {PLATFORMS.map((p) => {
                const last = lastByPlatform[p.key];
                return (
                    <Card key={p.key} style={{ padding: '16px 18px', opacity: p.ready ? 1 : 0.7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                            {p.ready ? (
                                last ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontWeight: 600 }}>
                                        <CheckCircle2 size={14} /> Recebendo
                                    </span>
                                ) : (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                                        <Circle size={14} /> Aguardando 1º pedido
                                    </span>
                                )
                            ) : (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 9px' }}>Em breve</span>
                            )}
                        </div>
                        {p.ready ? (
                            <>
                                {last && (
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                                        {last.count} pedido(s) nos últimos 30 dias · último em {new Date(last.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                )}
                                {webhookUrl
                                    ? <CopyField label="URL do webhook" value={webhookUrl} masked />
                                    : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Carregando URL…</div>}
                                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                                    {p.steps!.map((s) => <li key={s}>{s}</li>)}
                                </ol>
                            </>
                        ) : (
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                Integração em desenvolvimento — mesma URL de webhook, com leitura dos campos específicos da {p.name}.
                            </div>
                        )}
                    </Card>
                );
            })}
        </div>
    );
}
