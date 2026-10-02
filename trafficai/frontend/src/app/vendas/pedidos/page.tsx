'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, ErrorBox, brl, thStyle, selectStyle, STATUS_LABEL, PAYMENT_LABEL } from '@/components/vendas/shared';

const FILTERS = [
    { key: '', label: 'Todos' },
    { key: 'approved', label: 'Aprovados' },
    { key: 'pending', label: 'Pendentes' },
    { key: 'refused', label: 'Recusados' },
    { key: 'refunded', label: 'Reembolsados' },
    { key: 'chargeback', label: 'Chargeback' },
];

export default function PedidosPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true); setError('');
        api.getSalesOrders(sourceId, { since, until, limit: '500' })
            .then((r) => setOrders(r || []))
            .catch((e) => setError(e.message || 'Erro ao carregar pedidos'))
            .finally(() => setLoading(false));
    }, [sourceId, since, until, reloadToken]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { '': orders.length };
        for (const o of orders) c[o.status] = (c[o.status] || 0) + 1;
        return c;
    }, [orders]);

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders
            .filter(o => !status || o.status === status)
            .filter(o => !q || [o.customer_name, o.product_name, o.external_order_id, o.utm_campaign, o.utm_content].some(v => String(v || '').toLowerCase().includes(q)));
    }, [orders, status, search]);

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                {FILTERS.map(f => (
                    <button key={f.key} type="button" onClick={() => setStatus(f.key)} className={`btn btn-sm ${status === f.key ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: 12, padding: '5px 11px' }}>
                        {f.label} <span className="num" style={{ opacity: 0.7, marginLeft: 3 }}>{counts[f.key] || 0}</span>
                    </button>
                ))}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, produto, pedido, UTM"
                        style={{ ...selectStyle, padding: '6px 8px 6px 26px', fontSize: 12, width: 240 }} />
                </div>
            </div>
            <Card flat style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-input)' }}>
                                {['Data', 'Plataforma', 'Produto', 'Cliente', 'Pagamento', 'Bruto', 'Líquido', 'Status', 'Campanha', 'Anúncio', 'Meta'].map((h) => (
                                    <th key={h} style={thStyle(h === 'Bruto' || h === 'Líquido' ? 'right' : 'left', false)}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 && (
                                <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {loading ? 'Carregando…' : 'Nenhum pedido nesse filtro.'}
                                </td></tr>
                            )}
                            {list.map((o) => {
                                const st = STATUS_LABEL[o.status] || { label: o.status, color: 'var(--text-muted)' };
                                const camp = o.utm_campaign ? String(o.utm_campaign).split('|')[0] : null;
                                const ad = o.utm_content ? String(o.utm_content).split('|')[0] : null;
                                const cell: React.CSSProperties = { padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                                return (
                                    <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={cell}>{new Date(o.order_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td style={{ ...cell, textTransform: 'capitalize' }}>{o.platform}</td>
                                        <td style={{ ...cell, maxWidth: 200 }} title={o.product_name || ''}>{o.product_name || '—'}</td>
                                        <td style={{ ...cell, maxWidth: 170 }} title={o.customer_name || ''}>{o.customer_name || '—'}</td>
                                        <td style={cell}>{PAYMENT_LABEL[o.payment_method] || '—'}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.gross_value != null ? brl(Number(o.gross_value)) : '—'}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.net_value != null ? brl(Number(o.net_value)) : '—'}</td>
                                        <td style={cell}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.color}`, borderRadius: 999, padding: '1px 8px' }}>{st.label}</span>
                                        </td>
                                        <td style={{ ...cell, maxWidth: 220, color: camp ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_campaign || ''}>{camp || 'sem UTM'}</td>
                                        <td style={{ ...cell, maxWidth: 180, color: ad ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_content || ''}>{ad || '—'}</td>
                                        <td style={{ ...cell, fontSize: 11, color: o.purchase_event_id ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                                            {o.status === 'approved' ? (o.purchase_event_id ? 'Purchase enviado' : 'Não enviado') : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            {orders.length >= 500 && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>Mostrando os 500 pedidos mais recentes — reduza o período pra ver todos.</p>}
        </>
    );
}
