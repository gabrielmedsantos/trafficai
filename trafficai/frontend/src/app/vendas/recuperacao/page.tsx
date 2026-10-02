'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ShoppingCart, QrCode, FileText, XCircle, CheckCircle2, MessageCircle, Copy, Check, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, Kpi, ErrorBox, brl, pct, thStyle, selectStyle } from '@/components/vendas/shared';

type Kind = 'abandoned' | 'pix' | 'boleto' | 'pending' | 'refused';

function kindOf(o: any): Kind {
    if (o.status === 'abandoned') return 'abandoned';
    if (o.status === 'refused') return 'refused';
    if (o.payment_method === 'pix') return 'pix';
    if (o.payment_method === 'boleto') return 'boleto';
    return 'pending';
}

const KIND: Record<Kind, { label: string; color: string; icon: React.ReactNode }> = {
    abandoned: { label: 'Carrinho abandonado', color: 'var(--accent-yellow)', icon: <ShoppingCart size={12} /> },
    pix: { label: 'Pix não pago', color: 'var(--accent-blue)', icon: <QrCode size={12} /> },
    boleto: { label: 'Boleto não pago', color: 'var(--accent-blue)', icon: <FileText size={12} /> },
    pending: { label: 'Pagamento pendente', color: 'var(--accent-blue)', icon: <FileText size={12} /> },
    refused: { label: 'Pagamento recusado', color: 'var(--accent-red)', icon: <XCircle size={12} /> },
};

const FILTERS: { key: string; label: string }[] = [
    { key: 'open', label: 'A recuperar' },
    { key: 'abandoned', label: 'Carrinho abandonado' },
    { key: 'payment', label: 'Pix/boleto não pago' },
    { key: 'refused', label: 'Recusados' },
    { key: 'recovered', label: 'Recuperados' },
    { key: 'all', label: 'Todos' },
];

function firstName(name: string | null): string {
    const n = String(name || '').trim().split(/\s+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

/** Telefone pro wa.me: só dígitos; número BR sem DDI ganha 55. */
function waPhone(phone: string | null): string | null {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    return d.length <= 11 ? `55${d}` : d;
}

function message(o: any): string {
    const nome = firstName(o.customer_name);
    const oi = nome ? `Oi, ${nome}!` : 'Oi!';
    const produto = o.product_name ? ` do *${o.product_name}*` : '';
    const link = o.checkout_url ? `\n\nSeu link continua aqui: ${o.checkout_url}` : '';
    switch (kindOf(o)) {
        case 'abandoned': return `${oi} Vi que você começou a compra${produto} e não finalizou. Ficou alguma dúvida? Posso te ajudar a concluir.${link}`;
        case 'pix': return `${oi} Seu Pix${produto} foi gerado, mas ainda não identificamos o pagamento. Precisa de ajuda pra finalizar?${link}`;
        case 'boleto': return `${oi} Seu boleto${produto} foi gerado e ainda está em aberto. Quer que eu te ajude a pagar ou prefere pagar por Pix?${link}`;
        case 'refused': return `${oi} O pagamento${produto} não foi aprovado pelo banco. Quer tentar com outro cartão ou por Pix? Te ajudo a finalizar.${link}`;
        default: return `${oi} Seu pedido${produto} ainda está pendente. Posso te ajudar a finalizar?${link}`;
    }
}

function ago(iso: string): string {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return `há ${Math.max(1, min)} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? 's' : ''}`;
}

export default function RecuperacaoPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('open');
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true); setError('');
        api.getSalesRecovery(sourceId, { since, until })
            .then((r) => setRows(r || []))
            .catch((e) => setError(e.message || 'Erro ao carregar'))
            .finally(() => setLoading(false));
    }, [sourceId, since, until, reloadToken]);

    const stats = useMemo(() => {
        const recovered = rows.filter((r) => r.recovered_order_id);
        return {
            abandoned: rows.filter((r) => r.status === 'abandoned').length,
            payment: rows.filter((r) => r.status === 'pending').length,
            refused: rows.filter((r) => r.status === 'refused').length,
            open: rows.filter((r) => !r.recovered_order_id),
            openValue: rows.filter((r) => !r.recovered_order_id).reduce((n, r) => n + Number(r.gross_value || 0), 0),
            recovered: recovered.length,
            recoveredValue: recovered.reduce((n, r) => n + Number(r.recovered_value || 0), 0),
            rate: rows.length ? (recovered.length / rows.length) * 100 : null,
        };
    }, [rows]);

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (filter === 'open' && r.recovered_order_id) return false;
            if (filter === 'abandoned' && (r.status !== 'abandoned' || r.recovered_order_id)) return false;
            if (filter === 'payment' && (r.status !== 'pending' || r.recovered_order_id)) return false;
            if (filter === 'refused' && (r.status !== 'refused' || r.recovered_order_id)) return false;
            if (filter === 'recovered' && !r.recovered_order_id) return false;
            return !q || [r.customer_name, r.customer_email, r.customer_phone, r.product_name].some((v) => String(v || '').toLowerCase().includes(q));
        });
    }, [rows, filter, search]);

    async function markContacted(o: any, contacted: boolean) {
        setRows((l) => l.map((r) => (r.id === o.id ? { ...r, recovery_contacted_at: contacted ? new Date().toISOString() : null } : r)));
        try { await api.setRecoveryContacted(sourceId, o.id, contacted); }
        catch (e: any) {
            setError(e.message || 'Não consegui salvar');
            setRows((l) => l.map((r) => (r.id === o.id ? { ...r, recovery_contacted_at: o.recovery_contacted_at } : r)));
        }
    }

    function openWhatsApp(o: any) {
        const phone = waPhone(o.customer_phone);
        if (!phone) return;
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message(o))}`, '_blank', 'noopener');
        if (!o.recovery_contacted_at) markContacted(o, true);
    }

    function copyMessage(o: any) {
        navigator.clipboard.writeText(message(o));
        setCopied(o.id);
        setTimeout(() => setCopied(null), 1500);
    }

    const counts: Record<string, number> = {
        open: stats.open.length, abandoned: rows.filter((r) => r.status === 'abandoned' && !r.recovered_order_id).length,
        payment: rows.filter((r) => r.status === 'pending' && !r.recovered_order_id).length,
        refused: rows.filter((r) => r.status === 'refused' && !r.recovered_order_id).length,
        recovered: stats.recovered, all: rows.length,
    };

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                <Kpi icon={<ShoppingCart size={14} />} label="Carrinhos abandonados" value={String(stats.abandoned)} color="var(--accent-yellow)" />
                <Kpi icon={<QrCode size={14} />} label="Pix/boleto não pagos" value={String(stats.payment)} color="var(--accent-blue)" />
                <Kpi icon={<XCircle size={14} />} label="Pagamentos recusados" value={String(stats.refused)} color={stats.refused ? 'var(--accent-red)' : undefined} />
                <Kpi icon={<MessageCircle size={14} />} label="A recuperar" value={brl(stats.openValue)} hint={`${stats.open.length} cliente(s)`} />
                <Kpi icon={<CheckCircle2 size={14} />} label="Recuperados" value={brl(stats.recoveredValue)} hint={`${stats.recovered} · taxa ${pct(stats.rate)}`} color="var(--accent-green)" />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                {FILTERS.map((f) => (
                    <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 12, padding: '5px 11px' }}>
                        {f.label} <span className="num" style={{ opacity: 0.7, marginLeft: 3 }}>{counts[f.key] || 0}</span>
                    </button>
                ))}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, e-mail, telefone, produto"
                        style={{ ...selectStyle, padding: '6px 8px 6px 26px', fontSize: 12, width: 250 }} />
                </div>
            </div>

            <Card style={{ padding: 0 }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-input)' }}>
                                {['Quando', 'Cliente', 'Produto', 'Valor', 'Situação', 'Ação'].map((h) => (
                                    <th key={h} style={thStyle(h === 'Valor' ? 'right' : 'left', false)}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {list.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {loading ? 'Carregando…' : filter === 'open' ? 'Nenhum cliente pra recuperar nesse período.' : 'Nada nesse filtro.'}
                                </td></tr>
                            )}
                            {list.map((o) => {
                                const k = KIND[kindOf(o)];
                                const phone = waPhone(o.customer_phone);
                                return (
                                    <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                            {new Date(o.order_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{ago(o.order_date)}</div>
                                        </td>
                                        <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name || 'Sem nome'}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {[o.customer_phone, o.customer_email].filter(Boolean).join(' · ') || 'sem contato'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '9px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.product_name || ''}>{o.product_name || '—'}</td>
                                        <td className="num" style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>{o.gross_value != null ? brl(Number(o.gross_value)) : '—'}</td>
                                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: k.color, border: `1px solid ${k.color}`, borderRadius: 999, padding: '1px 8px' }}>
                                                {k.icon} {k.label}
                                            </span>
                                            {o.recovered_order_id ? (
                                                <div style={{ fontSize: 11, color: 'var(--accent-green)', marginTop: 3, fontWeight: 600 }}>
                                                    Recuperado · {brl(Number(o.recovered_value || 0))}
                                                </div>
                                            ) : o.recovery_contacted_at ? (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Chamado {ago(o.recovery_contacted_at)}</div>
                                            ) : null}
                                        </td>
                                        <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                                            {!o.recovered_order_id && (
                                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                    <button type="button" className="btn btn-sm btn-primary" disabled={!phone} onClick={() => openWhatsApp(o)}
                                                        title={phone ? 'Abre o WhatsApp com a mensagem pronta' : 'Cliente sem telefone'}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 10px', background: phone ? '#25d366' : undefined, borderColor: phone ? '#25d366' : undefined }}>
                                                        <MessageCircle size={13} /> WhatsApp
                                                    </button>
                                                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => copyMessage(o)} title="Copiar mensagem" aria-label="Copiar mensagem" style={{ padding: 5 }}>
                                                        {copied === o.id ? <Check size={13} /> : <Copy size={13} />}
                                                    </button>
                                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                                        <input type="checkbox" checked={!!o.recovery_contacted_at} onChange={(e) => markContacted(o, e.target.checked)} /> Chamado
                                                    </label>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Card>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Um cliente conta como recuperado quando compra (aprovado) com o mesmo e-mail ou telefone em até 30 dias. Pix e boleto pagos saem da lista sozinhos.
                Nada daqui é enviado pra Meta: só a compra aprovada vira Purchase.
            </p>
        </>
    );
}
