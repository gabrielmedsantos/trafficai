'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Eye, X, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useCurrentUser } from '@/app/UserContext';

const PLAN_META: Record<string, { label: string; color: string; bg: string }> = {
    trial: { label: 'Trial', color: 'var(--text-muted)', bg: 'rgba(122,130,144,0.14)' },
    starter: { label: 'Starter', color: 'var(--accent-blue)', bg: 'rgba(56,189,248,0.14)' },
    pro: { label: 'Pro', color: 'var(--accent-cyan)', bg: 'rgba(34,211,238,0.14)' },
    agency: { label: 'Agency', color: 'var(--accent-purple)', bg: 'rgba(183,148,244,0.16)' },
    elite: { label: 'Elite', color: 'var(--accent-orange)', bg: 'rgba(255,139,61,0.16)' },
};

type Situation = 'active' | 'trialing' | 'expired' | 'past_due' | 'courtesy' | 'suspended' | 'canceled';
const SITUATION: Record<Situation, { label: string; color: string }> = {
    active: { label: 'Ativo', color: 'var(--accent-green)' },
    trialing: { label: 'Em teste', color: 'var(--accent-blue)' },
    expired: { label: 'Teste vencido', color: 'var(--accent-yellow)' },
    past_due: { label: 'Pagamento atrasado', color: 'var(--accent-red)' },
    courtesy: { label: 'Cortesia', color: 'var(--accent-purple)' },
    suspended: { label: 'Suspenso', color: 'var(--text-muted)' },
    canceled: { label: 'Cancelado', color: 'var(--text-muted)' },
};

function situationOf(c: any): Situation {
    if (c.suspended_at) return 'suspended';
    if (c.courtesy && (!c.courtesy_until || new Date(c.courtesy_until) > new Date())) return 'courtesy';
    if (c.status === 'active') return 'active';
    if (c.status === 'past_due') return 'past_due';
    if (c.status === 'trialing') return c.trial_ends_at && new Date(c.trial_ends_at) > new Date() ? 'trialing' : 'expired';
    return 'canceled';
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
function daysFrom(iso?: string | null): number | null {
    return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;
}
function ago(iso?: string | null): string {
    if (!iso) return 'nunca';
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 60) return min < 2 ? 'agora' : `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'ontem' : d < 30 ? `há ${d} dias` : `há ${Math.floor(d / 30)} mês(es)`;
}

const label11: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' };
const th: React.CSSProperties = { padding: '11px 12px', textAlign: 'left', ...label11, fontSize: 10.5, whiteSpace: 'nowrap' };

export default function SaasClientesPage() {
    const { user, loading: userLoading } = useCurrentUser();
    const [list, setList] = useState<any[]>([]);
    const [plans, setPlans] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [selId, setSelId] = useState<string | null>(null);
    const [impId, setImpId] = useState<string | null>(null);
    const [toast, setToast] = useState('');

    const isPlatformAdmin = user?.role === 'admin' && !user?.is_team_member && !user?.impersonated_by;

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const res: any = await api.getSaasCustomers();
            setList(res || []);
        } catch (e: any) {
            setError(e.message || 'Erro ao carregar clientes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (isPlatformAdmin) load(); }, [isPlatformAdmin, load]);
    useEffect(() => {
        // Limites e preços dos planos (mesma tabela do backend)
        setPlans({
            trial: { price_brl: 0, max_clients: 3, max_seats: 1 },
            starter: { price_brl: 101, max_clients: 5, max_seats: 1 },
            pro: { price_brl: 197, max_clients: 20, max_seats: 3 },
            agency: { price_brl: 317, max_clients: 50, max_seats: 5 },
            elite: { price_brl: 437, max_clients: 100, max_seats: 7 },
        });
    }, []);

    const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2800); };

    const rows = useMemo(() => list.map((c) => ({ ...c, situation: situationOf(c) })), [list]);
    const counts = useMemo(() => {
        const by = (s: Situation) => rows.filter((r) => r.situation === s).length;
        return {
            mrr: rows.filter((r) => r.situation === 'active').reduce((n, r) => n + (r.price_brl || 0), 0),
            active: by('active'), trialing: by('trialing'), expired: by('expired'), past_due: by('past_due'), courtesy: by('courtesy'),
        };
    }, [rows]);

    const FILTERS: { key: string; label: string; test: (r: any) => boolean }[] = [
        { key: 'all', label: 'Todos', test: () => true },
        { key: 'active', label: 'Pagantes', test: (r) => r.situation === 'active' },
        { key: 'trialing', label: 'Em teste', test: (r) => r.situation === 'trialing' },
        { key: 'attention', label: 'Precisam de atenção', test: (r) => r.situation === 'expired' || r.situation === 'past_due' },
        { key: 'courtesy', label: 'Cortesia', test: (r) => r.situation === 'courtesy' },
        { key: 'suspended', label: 'Suspensos', test: (r) => r.situation === 'suspended' },
    ];
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const test = (FILTERS.find((f) => f.key === filter) || FILTERS[0]).test;
        return rows.filter(test).filter((r) => !q || String(r.name || '').toLowerCase().includes(q) || String(r.email).toLowerCase().includes(q));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, filter, query]);

    async function impersonate(c: any) {
        try {
            const r = await api.impersonateSaas(c.id);
            const current = localStorage.getItem('trafficai_token');
            if (current) sessionStorage.setItem('__tai_admin_token__', current);
            localStorage.setItem('trafficai_token', r.token);
            window.location.assign('/agenda');
        } catch (e: any) {
            setImpId(null);
            setError(e.message || 'Não consegui entrar na conta do cliente');
        }
    }

    if (userLoading) return null;
    if (!isPlatformAdmin) {
        return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Área restrita ao administrador do sistema.</div>;
    }

    const kpis = [
        { label: 'Receita mensal', value: brl(counts.mrr), hint: 'clientes pagantes', color: 'var(--accent-green)' },
        { label: 'Clientes ativos', value: String(counts.active), hint: 'assinatura em dia', color: 'var(--text-primary)' },
        { label: 'Em teste', value: String(counts.trialing), hint: 'teste grátis rodando', color: 'var(--accent-blue)' },
        { label: 'Teste vencido', value: String(counts.expired), hint: 'não assinaram', color: 'var(--accent-yellow)' },
        { label: 'Pagamento atrasado', value: String(counts.past_due), hint: 'cobrança falhou', color: 'var(--accent-red)' },
    ];
    const sel = rows.find((r) => r.id === selId) || null;
    const imp = rows.find((r) => r.id === impId) || null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {toast && (
                <div className="tai-toast" role="status" aria-live="polite" style={{ position: 'fixed', top: 24, right: 32, zIndex: 80, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'var(--bg-surface)', border: '1px solid rgba(0,210,122,0.45)', borderRadius: 12, boxShadow: '0 18px 40px rgba(0,0,0,0.55)', fontSize: 13 }}>
                    <Check size={16} color="var(--accent-green)" /> {toast}
                </div>
            )}

            <header className="tai-rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Clientes do SaaS</h1>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Quem assina o TrafficAI: plano, situação, uso e acesso à conta de cada um.</p>
                </div>
                <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input className="input" type="search" aria-label="Buscar cliente" placeholder="Nome ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)}
                        style={{ width: 260, padding: '9px 12px 9px 32px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13 }} />
                </div>
            </header>

            {error && <div style={{ padding: '10px 14px', fontSize: 13, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--accent-red)' }}>{error}</div>}

            <section className="tai-grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                {kpis.map((k, i) => (
                    <div key={k.label} className="tai-card tai-rise" style={{ animationDelay: `${60 + i * 50}ms`, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={label11}>{k.label}</span>
                        <span className="tai-mono" style={{ fontSize: 24, fontWeight: 600, color: k.color }}>{k.value}</span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{k.hint}</span>
                    </div>
                ))}
            </section>

            <div className="tai-rise" style={{ animationDelay: '300ms', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {FILTERS.map((f) => {
                    const on = filter === f.key;
                    return (
                        <button key={f.key} type="button" className="tai-chip" aria-pressed={on} onClick={() => setFilter(f.key)} style={{
                            cursor: 'pointer', padding: '7px 13px', borderRadius: 999, font: '600 12.5px var(--font-sans)',
                            border: `1px solid ${on ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(14,165,233,0.16)' : 'transparent',
                            color: on ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}>{f.label} <span className="tai-mono" style={{ opacity: 0.7 }}>{rows.filter(f.test).length}</span></button>
                    );
                })}
            </div>

            <section className="tai-rise" style={{ animationDelay: '360ms', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                <div className="tai-scroll" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#121417' }}>
                                <th style={{ ...th, paddingLeft: 18 }}>Cliente</th>
                                <th style={th}>Plano</th>
                                <th style={th}>Situação</th>
                                <th style={th}>Vence / renova</th>
                                <th style={th}>Contas de anúncio</th>
                                <th style={th}>Último acesso</th>
                                <th style={{ ...th, textAlign: 'right', paddingRight: 18 }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.length === 0 && (
                                <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>{loading ? 'Carregando…' : 'Nenhum cliente nesse filtro.'}</td></tr>
                            )}
                            {visible.map((c) => {
                                const pm = PLAN_META[c.plan || 'trial'] || PLAN_META.trial;
                                const st = SITUATION[c.situation as Situation];
                                const dueIso = c.situation === 'trialing' || c.situation === 'expired' ? c.trial_ends_at : c.situation === 'courtesy' ? c.courtesy_until : c.current_period_end;
                                const dd = daysFrom(dueIso);
                                const dueText = !dueIso ? (c.situation === 'courtesy' ? 'sem prazo' : '—')
                                    : dd! < 0 ? `venceu em ${dateBR(dueIso)}` : c.situation === 'trialing' ? `teste até ${dateBR(dueIso)}` : `renova ${dateBR(dueIso)}`;
                                const pct = Math.min(100, ((c.active_accounts || 0) / (c.max_clients || 1)) * 100);
                                const initials = String(c.name || c.email).trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                                return (
                                    <tr key={c.id} className="tai-row" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', opacity: c.situation === 'suspended' ? 0.6 : 1 }}>
                                        <td style={{ padding: '12px 18px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ width: 36, height: 36, borderRadius: 10, background: pm.bg, color: pm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                    <span style={{ fontWeight: 600 }}>{c.name || '—'}</span>
                                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: 12 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: pm.color, background: pm.bg, padding: '3px 10px', borderRadius: 999 }}>{pm.label}</span>
                                            <div className="tai-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.price_brl ? `${brl(c.price_brl)}/mês` : 'grátis'}</div>
                                        </td>
                                        <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: st.color }}>
                                                <span style={{ width: 7, height: 7, borderRadius: 4, background: st.color }} />{st.label}
                                            </span>
                                        </td>
                                        <td style={{ padding: 12, fontSize: 12.5, whiteSpace: 'nowrap', color: dd != null && dd < 0 ? 'var(--accent-yellow)' : dd != null && dd <= 5 ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>{dueText}</td>
                                        <td style={{ padding: 12, minWidth: 150 }}>
                                            <div className="tai-mono" style={{ fontSize: 12.5 }}>{c.active_accounts || 0} de {c.max_clients}</div>
                                            <div style={{ width: 120, height: 4, borderRadius: 2, background: 'var(--bg-surface-2)', marginTop: 5, overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? 'var(--accent-red)' : pct >= 70 ? 'var(--accent-yellow)' : 'var(--primary)' }} />
                                            </div>
                                        </td>
                                        <td style={{ padding: 12, fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }} title={c.last_seen_at ? new Date(c.last_seen_at).toLocaleString('pt-BR') : ''}>{ago(c.last_seen_at)}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelId(c.id)} style={{ marginRight: 6 }}>Gerenciar</button>
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setImpId(c.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Eye size={13} /> Entrar como</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {sel && <ManagePanel customer={sel} plans={plans} onClose={() => setSelId(null)} onSaved={(msg) => { setSelId(null); flash(msg); load(); }} />}

            {imp && (
                <div className="tai-shade" style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,7,0.62)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setImpId(null)}>
                    <div className="tai-rise" role="dialog" aria-modal="true" aria-labelledby="imp-title" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.55)', animationDuration: '.25s' }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(250,204,21,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-yellow)' }}><Eye size={20} /></div>
                        <h2 id="imp-title" style={{ margin: 0, fontSize: 17 }}>Entrar como {imp.name || imp.email}?</h2>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                            Você vai ver o TrafficAI exatamente como esse cliente vê. O que você mudar vale na conta dele.
                            A entrada fica registrada na Auditoria e a sessão termina sozinha em 1 hora.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setImpId(null)}>Cancelar</button>
                            <button type="button" className="btn btn-primary" onClick={() => impersonate(imp)} autoFocus>Entrar como {String(imp.name || imp.email).split(' ')[0]}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ManagePanel({ customer, plans, onClose, onSaved }: { customer: any; plans: Record<string, any>; onClose: () => void; onSaved: (msg: string) => void }) {
    const [plan, setPlan] = useState<string>(customer.plan || 'trial');
    const [extend, setExtend] = useState(0);
    const [courtesy, setCourtesy] = useState<boolean>(!!customer.courtesy);
    const [courtesyUntil, setCourtesyUntil] = useState<string>(customer.courtesy_until ? String(customer.courtesy_until).slice(0, 10) : '');
    const [history, setHistory] = useState<any[]>([]);
    const initialUaz: 'auto' | 'on' | 'off' = customer.allow_uazapi === true ? 'on' : customer.allow_uazapi === false ? 'off' : 'auto';
    const [uaz, setUaz] = useState<'auto' | 'on' | 'off'>(initialUaz);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => {
        api.getSaasHistory(customer.id).then((r) => setHistory(r || [])).catch(() => setHistory([]));
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [customer.id, onClose]);

    const trialBase = customer.trial_ends_at && new Date(customer.trial_ends_at) > new Date() ? new Date(customer.trial_ends_at) : new Date();
    const newTrialEnd = extend ? new Date(trialBase.getTime() + extend * 86400000) : null;
    const suspended = !!customer.suspended_at;
    const changed = uaz !== initialUaz || plan !== (customer.plan || 'trial') || extend > 0 || courtesy !== !!customer.courtesy || (courtesy && courtesyUntil !== (customer.courtesy_until ? String(customer.courtesy_until).slice(0, 10) : ''));

    async function save() {
        setSaving(true); setErr('');
        try {
            await api.updateSaasSubscription(customer.id, {
                plan, extend_days: extend || undefined,
                ...(uaz !== initialUaz ? { allow_uazapi: uaz === 'auto' ? null : uaz === 'on' } : {}),
                ...(courtesy !== !!customer.courtesy || courtesy ? { courtesy, courtesy_until: courtesy && courtesyUntil ? courtesyUntil : null } : {}),
            });
            onSaved(`Plano de ${customer.name || customer.email} atualizado`);
        } catch (e: any) {
            setErr(e.message || 'Não consegui salvar');
            setSaving(false);
        }
    }

    async function toggleSuspend() {
        const go = window.confirm(suspended ? 'Reativar o acesso desse cliente?' : 'Suspender o acesso desse cliente? Ele (e a equipe dele) não consegue mais entrar até você reativar.');
        if (!go) return;
        setSaving(true); setErr('');
        try {
            await api.setSaasSuspended(customer.id, !suspended);
            onSaved(suspended ? 'Acesso reativado' : 'Acesso suspenso');
        } catch (e: any) {
            setErr(e.message || 'Não consegui alterar');
            setSaving(false);
        }
    }

    const ACTION_LABEL: Record<string, string> = {
        'saas.subscription_changed': 'Plano/assinatura alterado',
        'saas.customer_suspended': 'Acesso suspenso',
        'saas.customer_reactivated': 'Acesso reativado',
        'saas.impersonation_started': 'Entrou como o cliente',
    };

    return (
        <>
            <div className="tai-shade" onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,7,0.62)', zIndex: 60 }} />
            <aside className="tai-panel" role="dialog" aria-modal="true" aria-label={`Gerenciar ${customer.name || customer.email}`} style={{
                position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 100vw)', zIndex: 61, background: '#121417',
                borderLeft: '1px solid rgba(255,255,255,0.09)', padding: 24, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Gerenciar plano</span>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>{customer.name || customer.email}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{customer.email} · cliente desde {dateBR(customer.created_at)}</span>
                    </div>
                    <button type="button" aria-label="Fechar" onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={label11}>Plano</span>
                    {Object.keys(PLAN_META).map((k) => {
                        const on = plan === k, p = plans[k] || {};
                        return (
                            <button key={k} type="button" onClick={() => setPlan(k)} aria-pressed={on} style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', border: `1px solid ${on ? 'var(--primary)' : 'rgba(255,255,255,0.08)'}`,
                                background: on ? 'rgba(14,165,233,0.1)' : 'var(--bg-surface)', transition: 'border-color .15s, background .15s',
                            }}>
                                <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${on ? 'var(--primary)' : 'var(--text-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
                                </span>
                                <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{PLAN_META[k].label}</span>
                                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.max_clients} contas · {p.max_seats} usuário{p.max_seats > 1 ? 's' : ''}</span>
                                </span>
                                <span className="tai-mono" style={{ fontSize: 13, fontWeight: 600 }}>{p.price_brl ? brl(p.price_brl) : 'grátis'}</span>
                            </button>
                        );
                    })}
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Trocar o plano aqui não cobra nada no Stripe — pra cobrança, o cliente assina em Assinatura.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={label11}>Teste grátis</span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13 }}>
                            {newTrialEnd ? <>Vai até <b>{newTrialEnd.toLocaleDateString('pt-BR')}</b></> : customer.trial_ends_at ? <>Vence em <b style={{ color: daysFrom(customer.trial_ends_at)! < 0 ? 'var(--accent-yellow)' : 'var(--text-primary)' }}>{dateBR(customer.trial_ends_at)}</b></> : 'Sem teste'}
                        </span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[7, 15, 30].map((n) => (
                                <button key={n} type="button" onClick={() => setExtend((x) => x + n)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(14,165,233,0.4)', background: 'rgba(14,165,233,0.1)', color: '#7dd3fc', font: '600 12px var(--font-sans)', cursor: 'pointer' }}>+{n} dias</button>
                            ))}
                            {extend > 0 && <button type="button" onClick={() => setExtend(0)} aria-label="Desfazer extensão" style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={12} /></button>}
                        </div>
                    </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={courtesy} onChange={(e) => setCourtesy(e.target.checked)} style={{ marginTop: 3 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flexGrow: 1 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Cortesia (sem cobrança)</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Libera o plano escolhido sem passar pelo Stripe — parceiro, teste estendido ou cliente da agência.</span>
                        {courtesy && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                                Até
                                <input type="date" value={courtesyUntil} onChange={(e) => setCourtesyUntil(e.target.value)} style={{ padding: '5px 8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12.5 }} />
                                <span style={{ color: 'var(--text-muted)' }}>(vazio = sem prazo)</span>
                            </span>
                        )}
                    </span>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={label11}>WhatsApp pela UazAPI</span>
                    <div role="radiogroup" aria-label="UazAPI" style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        {([['auto', 'Pelo plano'], ['on', 'Liberada'], ['off', 'Bloqueada']] as const).map(([k, lbl]) => (
                            <button key={k} type="button" role="radio" aria-checked={uaz === k} onClick={() => setUaz(k)} style={{
                                flex: 1, padding: '7px 8px', borderRadius: 8, border: 'none', cursor: 'pointer', font: '600 12.5px var(--font-sans)',
                                background: uaz === k ? 'var(--primary)' : 'transparent', color: uaz === k ? 'var(--bg-sidebar)' : 'var(--text-muted)',
                            }}>{lbl}</button>
                        ))}
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        {uaz === 'auto'
                            ? ((customer.situation === 'active' || customer.situation === 'past_due') && !courtesy ? 'Assinatura paga: UazAPI liberada.' : 'Conta sem cobrança (teste grátis ou cortesia): só Evolution. Libera sozinha quando assinar um plano pago.')
                            : uaz === 'on' ? 'Pode conectar e usar a UazAPI, mesmo no teste.' : 'Só Evolution, mesmo em plano pago.'}
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={label11}>Histórico</span>
                    {[{ text: 'Cadastro no TrafficAI', when: customer.created_at },
                      ...history.map((h) => ({ text: `${ACTION_LABEL[h.action] || h.action}${h.user_name ? ` · por ${h.user_name}` : ''}`, when: h.created_at })),
                      { text: 'Último acesso', when: customer.last_seen_at }]
                        .filter((h) => h.when).sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 8)
                        .map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-subtle)', marginTop: 7, flexShrink: 0 }} />
                                <span style={{ flexGrow: 1, color: 'var(--text-secondary)' }}>{h.text}</span>
                                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(h.when).toLocaleDateString('pt-BR')}</span>
                            </div>
                        ))}
                </div>

                {err && <div style={{ padding: '9px 12px', fontSize: 13, borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--accent-red)' }}>{err}</div>}

                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" className="btn btn-primary" disabled={saving || !changed} onClick={save} style={{ padding: 12, justifyContent: 'center' }}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
                    <button type="button" disabled={saving} onClick={toggleSuspend} style={{ padding: 11, border: `1px solid ${suspended ? 'rgba(0,210,122,0.4)' : 'rgba(239,68,68,0.4)'}`, borderRadius: 10, background: 'transparent', color: suspended ? 'var(--accent-green)' : '#f87171', font: '600 13px var(--font-sans)', cursor: 'pointer' }}>
                        {suspended ? 'Reativar acesso' : 'Suspender acesso'}
                    </button>
                </div>
            </aside>
        </>
    );
}
