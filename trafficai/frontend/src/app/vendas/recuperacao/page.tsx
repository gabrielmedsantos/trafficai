'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Copy, Check, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, ErrorBox, brl, selectStyle } from '@/components/vendas/shared';

type Kind = 'abandoned' | 'pix' | 'boleto' | 'pending' | 'refused';

function kindOf(o: any): Kind {
    if (o.status === 'abandoned') return 'abandoned';
    if (o.status === 'refused') return 'refused';
    if (o.payment_method === 'pix') return 'pix';
    if (o.payment_method === 'boleto') return 'boleto';
    return 'pending';
}

const KIND: Record<Kind, { label: string; color: string; bg: string }> = {
    abandoned: { label: 'Carrinho abandonado', color: 'var(--accent-yellow)', bg: 'rgba(250,204,21,0.14)' },
    pix: { label: 'Pix não pago', color: 'var(--accent-blue)', bg: 'rgba(56,189,248,0.14)' },
    boleto: { label: 'Boleto não pago', color: 'var(--accent-blue)', bg: 'rgba(56,189,248,0.14)' },
    pending: { label: 'Pagamento pendente', color: 'var(--accent-blue)', bg: 'rgba(56,189,248,0.14)' },
    refused: { label: 'Pagamento recusado', color: 'var(--accent-red)', bg: 'rgba(239,68,68,0.14)' },
};

const FILTERS: { key: string; label: string; test: (r: any) => boolean }[] = [
    { key: 'open', label: 'A recuperar', test: (r) => !r.recovered_order_id },
    { key: 'abandoned', label: 'Carrinho abandonado', test: (r) => !r.recovered_order_id && r.status === 'abandoned' },
    { key: 'payment', label: 'Pix/boleto', test: (r) => !r.recovered_order_id && r.status === 'pending' },
    { key: 'refused', label: 'Recusados', test: (r) => !r.recovered_order_id && r.status === 'refused' },
    { key: 'recovered', label: 'Recuperados', test: (r) => !!r.recovered_order_id },
];

function firstName(name: string | null): string {
    const n = String(name || '').trim().split(/\s+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
}

function initials(name: string | null): string {
    return String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
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
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d > 1 ? 's' : ''}`;
}

const label11: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' };

export default function RecuperacaoPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('open');
    const [search, setSearch] = useState('');
    const [selId, setSelId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!sourceId) return;
        setLoading(true); setError('');
        api.getSalesRecovery(sourceId, { since, until })
            .then((r) => setRows(r || []))
            .catch((e) => setError(e.message || 'Erro ao carregar'))
            .finally(() => setLoading(false));
    }, [sourceId, since, until, reloadToken]);

    useEffect(() => {
        if (!selId) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selId]);

    const stats = useMemo(() => {
        const open = rows.filter((r) => !r.recovered_order_id);
        const recovered = rows.filter((r) => r.recovered_order_id);
        const group = (fn: (r: any) => boolean) => {
            const g = open.filter(fn);
            return { count: g.length, value: g.reduce((n, r) => n + Number(r.gross_value || 0), 0) };
        };
        return {
            open: open.length,
            abandoned: group((r) => r.status === 'abandoned'),
            payment: group((r) => r.status === 'pending'),
            refused: group((r) => r.status === 'refused'),
            recovered: recovered.length,
            recoveredValue: recovered.reduce((n, r) => n + Number(r.recovered_value || 0), 0),
            rate: rows.length ? recovered.length / rows.length : 0,
        };
    }, [rows]);

    const list = useMemo(() => {
        const q = search.trim().toLowerCase();
        const test = (FILTERS.find((f) => f.key === filter) || FILTERS[0]).test;
        return rows.filter(test).filter((r) => !q || [r.customer_name, r.customer_email, r.customer_phone, r.product_name].some((v) => String(v || '').toLowerCase().includes(q)));
    }, [rows, filter, search]);

    const sel = rows.find((r) => r.id === selId) || null;

    async function setContacted(o: any, contacted: boolean) {
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
        if (!o.recovery_contacted_at) setContacted(o, true);
        setSelId(null);
    }

    const ringOffset = 264 * (1 - stats.rate);
    const kpis = [
        { label: 'Carrinhos abandonados', color: 'var(--accent-yellow)', ...stats.abandoned },
        { label: 'Pix/boleto não pagos', color: 'var(--accent-blue)', ...stats.payment },
        { label: 'Recusados', color: 'var(--accent-red)', ...stats.refused },
    ];

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}

            <section className="tai-grid-rec" style={{ marginBottom: 16 }}>
                <Card delay={60} style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <svg width="96" height="96" viewBox="0 0 100 100" role="img" aria-label={`Taxa de recuperação ${Math.round(stats.rate * 100)}%`}>
                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-surface-2)" strokeWidth="10" />
                        <circle className="tai-ring" cx="50" cy="50" r="42" fill="none" stroke="var(--accent-green)" strokeWidth="10" strokeLinecap="round"
                            strokeDasharray="264" strokeDashoffset={ringOffset} transform="rotate(-90 50 50)" />
                        <text x="50" y="56" textAnchor="middle" fill="var(--text-primary)" fontFamily="var(--font-mono)" fontSize="18" fontWeight="600">{Math.round(stats.rate * 100)}%</text>
                    </svg>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={label11}>Recuperado no período</span>
                        <span className="tai-mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--accent-green)' }}>{brl(stats.recoveredValue)}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{stats.recovered} cliente(s) voltaram e compraram</span>
                    </div>
                </Card>
                {kpis.map((k, i) => (
                    <Card key={k.label} delay={120 + i * 60} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ ...label11, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: k.color }} />{k.label}</span>
                        <span className="tai-mono" style={{ fontSize: 26, fontWeight: 600 }}>{k.count}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}><span className="tai-mono" style={{ color: 'var(--text-secondary)' }}>{brl(k.value)}</span> em jogo</span>
                    </Card>
                ))}
            </section>

            <div className="tai-rise" style={{ animationDelay: '260ms', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                {FILTERS.map((f) => {
                    const on = filter === f.key;
                    return (
                        <button key={f.key} type="button" className="tai-chip" aria-pressed={on} onClick={() => setFilter(f.key)} style={{
                            cursor: 'pointer', padding: '7px 13px', borderRadius: 999, font: '600 12.5px var(--font-sans)',
                            border: `1px solid ${on ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`,
                            background: on ? 'rgba(14,165,233,0.16)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}>
                            {f.label} <span className="tai-mono" style={{ opacity: 0.7, marginLeft: 3 }}>{rows.filter(f.test).length}</span>
                        </button>
                    );
                })}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                    <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" aria-label="Buscar cliente" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente, e-mail, telefone, produto"
                        style={{ ...selectStyle, padding: '7px 10px 7px 28px', fontSize: 12.5, width: 260 }} />
                </div>
            </div>

            {list.length === 0 ? (
                <Card flat style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)', fontSize: 13 }}>
                    {loading ? 'Carregando…' : filter === 'open' ? 'Ninguém pra recuperar nesse período. Carrinhos abandonados, Pix não pagos e recusas aparecem aqui assim que chegarem.' : 'Nada nesse filtro.'}
                </Card>
            ) : (
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))', gap: 12 }}>
                    {list.map((o, idx) => {
                        const k = KIND[kindOf(o)];
                        const recovered = !!o.recovered_order_id;
                        return (
                            <Card key={o.id} delay={Math.min(300 + idx * 50, 900)} style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 12, background: k.bg, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{initials(o.customer_name)}</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flexGrow: 1 }}>
                                        <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name || 'Sem nome'}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {[o.customer_phone || o.customer_email || 'sem contato', ago(o.order_date)].join(' · ')}
                                        </span>
                                    </div>
                                    <span className="tai-mono" style={{ fontSize: 16, fontWeight: 600 }}>{o.gross_value != null ? brl(Number(o.gross_value)) : '—'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                                        <span style={{ fontSize: 11.5, fontWeight: 600, color: k.color, border: `1px solid ${k.color}`, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>{k.label}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.product_name || ''}</span>
                                    </div>
                                    {recovered ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent-green)' }}>
                                            <Check size={14} strokeWidth={2.6} /> Recuperado · {brl(Number(o.recovered_value || 0))}
                                        </span>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            {o.recovery_contacted_at && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>chamado {ago(o.recovery_contacted_at)}</span>}
                                            <button type="button" className="tai-wa" onClick={() => { setSelId(o.id); setCopied(false); }} style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', border: 'none', borderRadius: 9,
                                                background: '#25d366', color: '#062a14', font: '700 12.5px var(--font-sans)', cursor: 'pointer',
                                            }}>
                                                <MessageCircle size={14} strokeWidth={2.2} /> WhatsApp
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </section>
            )}

            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
                Um cliente conta como recuperado quando compra (aprovado) com o mesmo e-mail ou telefone em até 30 dias. Pix e boleto pagos saem da lista sozinhos.
                Nada daqui vai pra Meta: só a compra aprovada vira Purchase.
            </p>

            {sel && (
                <>
                    <div className="tai-shade" onClick={() => setSelId(null)} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,7,0.62)', zIndex: 60 }} />
                    <aside className="tai-panel" role="dialog" aria-modal="true" aria-label={`Mensagem para ${sel.customer_name || 'cliente'}`} style={{
                        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)', zIndex: 61, background: '#121417',
                        borderLeft: '1px solid rgba(255,255,255,0.09)', padding: '26px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mensagem para</span>
                                <span style={{ fontSize: 17, fontWeight: 700 }}>{sel.customer_name || 'Cliente'}</span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sel.customer_phone || 'sem telefone'}</span>
                            </div>
                            <button type="button" aria-label="Fechar" onClick={() => setSelId(null)} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ background: '#0b141a', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ alignSelf: 'flex-end', maxWidth: '88%', background: '#005c4b', color: '#e9edef', padding: '10px 12px', borderRadius: '10px 10px 2px 10px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                                {message(sel)}
                            </div>
                            <span style={{ alignSelf: 'flex-end', fontSize: 10.5, color: '#8696a0' }}>agora</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            <span>Produto: <b style={{ color: 'var(--text-primary)' }}>{sel.product_name || '—'}</b></span>
                            <span>Situação: <b style={{ color: KIND[kindOf(sel)].color }}>{KIND[kindOf(sel)].label}</b></span>
                            <span>Valor: <b className="tai-mono" style={{ color: 'var(--text-primary)' }}>{sel.gross_value != null ? brl(Number(sel.gross_value)) : '—'}</b></span>
                        </div>
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button type="button" className="tai-wa" disabled={!waPhone(sel.customer_phone)} onClick={() => openWhatsApp(sel)} style={{
                                padding: 13, border: 'none', borderRadius: 10, background: waPhone(sel.customer_phone) ? '#25d366' : 'var(--bg-surface-2)',
                                color: waPhone(sel.customer_phone) ? '#062a14' : 'var(--text-muted)', font: '700 14px var(--font-sans)', cursor: waPhone(sel.customer_phone) ? 'pointer' : 'not-allowed',
                            }}>
                                {waPhone(sel.customer_phone) ? 'Abrir no WhatsApp' : 'Cliente sem telefone'}
                            </button>
                            <button type="button" onClick={() => { navigator.clipboard.writeText(message(sel)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{
                                padding: 11, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, background: 'transparent', color: 'var(--text-primary)',
                                font: '600 13px var(--font-sans)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}>
                                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Mensagem copiada' : 'Copiar mensagem'}
                            </button>
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', paddingTop: 4 }}>
                                <input type="checkbox" checked={!!sel.recovery_contacted_at} onChange={(e) => setContacted(sel, e.target.checked)} /> Já chamei esse cliente
                            </label>
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
