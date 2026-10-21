'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Send, CheckSquare, Square, Bell, Calendar } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, ErrorBox, brl, thStyle, selectStyle, STATUS_LABEL, PAYMENT_LABEL } from '@/components/vendas/shared';

const PERIODS = [
    { key: 'today', label: 'Hoje' },
    { key: 'yesterday', label: 'Ontem' },
    { key: '7d', label: '7 dias' },
    { key: '30d', label: '30 dias' },
    { key: 'custom', label: 'Personalizado' },
];

export default function ReenviarPage() {
    const { sourceId } = useVendas();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [period, setPeriod] = useState('7d');
    const [since, setSince] = useState('');
    const [until, setUntil] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [resending, setResending] = useState(false);
    const [result, setResult] = useState<{ sent: number; total: number } | null>(null);

    // Calcula datas baseado no período
    const dates = useMemo(() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (period === 'today') {
            return { since: today.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) };
        } else if (period === 'yesterday') {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            return { since: yesterday.toISOString().slice(0, 10), until: yesterday.toISOString().slice(0, 10) };
        } else if (period === '7d') {
            const start = new Date(today);
            start.setDate(start.getDate() - 6);
            return { since: start.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) };
        } else if (period === '30d') {
            const start = new Date(today);
            start.setDate(start.getDate() - 29);
            return { since: start.toISOString().slice(0, 10), until: today.toISOString().slice(0, 10) };
        } else {
            return { since, until };
        }
    }, [period, since, until]);

    // Busca pedidos do período
    useEffect(() => {
        if (!sourceId || !dates.since || !dates.until) return;
        setLoading(true);
        setError('');
        setSelected(new Set());
        setResult(null);

        api.getSalesOrders(sourceId, { since: dates.since, until: dates.until, limit: '500' })
            .then((r) => setOrders(r || []))
            .catch((e) => setError(e.message || 'Erro ao carregar pedidos'))
            .finally(() => setLoading(false));
    }, [sourceId, dates.since, dates.until]);

    // Toggle seleção individual
    function toggleSelect(orderId: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    }

    // Selecionar todos
    function selectAll() {
        setSelected(new Set(orders.map(o => o.id)));
    }

    // Desselecionar todos
    function deselectAll() {
        setSelected(new Set());
    }

    // Reenviar notificações
    async function resend() {
        if (!sourceId || selected.size === 0) return;
        setResending(true);
        setResult(null);
        try {
            const r = await api.resendSalesNotify(sourceId, Array.from(selected));
            setResult(r);
        } catch (e: any) {
            setError(e.message || 'Erro ao reenviar notificações');
        } finally {
            setResending(false);
        }
    }

    const allSelected = orders.length > 0 && selected.size === orders.length;
    const someSelected = selected.size > 0 && selected.size < orders.length;

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}

            <Card style={{ padding: '16px 18px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Bell size={16} color="var(--accent-blue)" />
                    <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Reenviar Notificações de Venda</h2>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                    Selecione os pedidos do período desejado e reenvie as notificações para WhatsApp/Push.
                    Útil quando você apagou acidentalmente uma notificação no celular ou quer repostar suas vendas.
                </p>

                {/* Filtro de período */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                    <Calendar size={14} color="var(--text-muted)" />
                    {PERIODS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => setPeriod(p.key)}
                            className={`btn btn-sm ${period === p.key ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ fontSize: 12, padding: '5px 11px' }}
                        >
                            {p.label}
                        </button>
                    ))}

                    {period === 'custom' && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
                            <input
                                type="date"
                                value={since}
                                onChange={(e) => setSince(e.target.value)}
                                style={{ ...selectStyle, padding: '5px 8px', fontSize: 12 }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>até</span>
                            <input
                                type="date"
                                value={until}
                                onChange={(e) => setUntil(e.target.value)}
                                style={{ ...selectStyle, padding: '5px 8px', fontSize: 12 }}
                            />
                        </div>
                    )}
                </div>

                {/* Ações de seleção e reenvio */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={allSelected ? deselectAll : selectAll}
                        className="btn btn-secondary btn-sm"
                        disabled={loading || orders.length === 0}
                        style={{ fontSize: 12, padding: '5px 11px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                        {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                        {allSelected ? 'Desselecionar todos' : 'Selecionar todos'}
                    </button>

                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {selected.size} de {orders.length} selecionado(s)
                    </span>

                    <button
                        type="button"
                        onClick={resend}
                        disabled={resending || selected.size === 0}
                        className="btn btn-primary btn-sm"
                        style={{
                            fontSize: 12,
                            padding: '5px 11px',
                            marginLeft: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: selected.size === 0 ? 0.5 : 1
                        }}
                    >
                        <Send size={13} />
                        {resending ? 'Reenviando…' : `Reenviar ${selected.size} notificação(ões)`}
                    </button>
                </div>

                {result && (
                    <div style={{
                        marginTop: 12,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        fontSize: 12.5,
                        color: 'var(--accent-green)'
                    }}>
                        ✓ {result.sent} notificação(ões) reenviada(s) com sucesso!
                    </div>
                )}
            </Card>

            {/* Tabela de pedidos */}
            <Card flat style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-input)' }}>
                                <th style={{ ...thStyle('center', false), width: 40 }}></th>
                                {['Data', 'Produto', 'Cliente', 'Pagamento', 'Bruto', 'Líquido', 'Status', 'Campanha'].map((h) => (
                                    <th key={h} style={thStyle(h === 'Bruto' || h === 'Líquido' ? 'right' : 'left', false)}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Carregando pedidos…
                                </td></tr>
                            )}
                            {!loading && orders.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    Nenhum pedido nesse período.
                                </td></tr>
                            )}
                            {!loading && orders.map((o) => {
                                const st = STATUS_LABEL[o.status] || { label: o.status, color: 'var(--text-muted)' };
                                const camp = o.utm_campaign ? String(o.utm_campaign).split('|')[0] : null;
                                const cell: React.CSSProperties = { padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
                                const isSelected = selected.has(o.id);

                                return (
                                    <tr
                                        key={o.id}
                                        style={{
                                            borderTop: '1px solid var(--border)',
                                            background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent'
                                        }}
                                    >
                                        <td style={{ ...cell, textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(o.id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td style={cell}>{new Date(o.order_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td style={{ ...cell, maxWidth: 200 }} title={o.product_name || ''}>{o.product_name || '—'}</td>
                                        <td style={{ ...cell, maxWidth: 170 }} title={o.customer_name || ''}>{o.customer_name || '—'}</td>
                                        <td style={cell}>{PAYMENT_LABEL[o.payment_method] || '—'}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.gross_value != null ? brl(Number(o.gross_value)) : '—'}</td>
                                        <td className="num" style={{ ...cell, textAlign: 'right' }}>{o.net_value != null ? brl(Number(o.net_value)) : '—'}</td>
                                        <td style={cell}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: st.color, border: `1px solid ${st.color}`, borderRadius: 999, padding: '1px 8px' }}>{st.label}</span>
                                        </td>
                                        <td style={{ ...cell, maxWidth: 220, color: camp ? 'var(--text-primary)' : 'var(--text-muted)' }} title={o.utm_campaign || ''}>{camp || 'sem UTM'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                As notificações serão reenviadas para os canais configurados em Vendas → Integrações → Notificações de venda (Push e/ou WhatsApp).
                Máximo 50 pedidos por vez para evitar sobrecarga.
            </p>
        </>
    );
}