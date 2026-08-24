'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { CheckCircle2, Zap, Star, Building2, Sparkles, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';

interface Subscription {
    plan: string;
    status: string;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    limits: { max_clients: number; max_seats: number; monthly_ai_credits: number };
    usage: { clients: number; ai_credits_used: number };
    has_stripe_customer: boolean;
    is_admin?: boolean;
}

interface Plan {
    id: string; price_brl: number;
    max_clients: number; max_seats: number; monthly_ai_credits: number;
}

function BillingPageInner() {
    const params = useSearchParams();
    const [sub, setSub] = useState<Subscription | null>(null);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        const flag = params?.get('checkout');
        if (flag === 'success') setMsg('✅ Assinatura ativada! Pode levar alguns segundos pra atualizar.');
        if (flag === 'cancel') setMsg('⚠ Checkout cancelado.');
        // Se veio bloqueado mas o user é admin, limpa o param — não deveria estar aqui
        if (params?.get('blocked') === '1' && sub?.is_admin) {
            // não mostra msg de bloqueio, é admin
        } else
        // Fluxo bloqueado — vindo de qualquer rota protegida
        if (params?.get('blocked') === '1') {
            try {
                const raw = typeof window !== 'undefined' ? sessionStorage.getItem('__tai_plan_block__') : null;
                const info = raw ? JSON.parse(raw) : null;
                if (info?.code === 'TRIAL_EXPIRED') {
                    setMsg('⚠️ Seu trial de 7 dias expirou. Escolha um plano abaixo pra continuar usando o TrafficAI.');
                } else if (info?.code === 'PLAN_INACTIVE') {
                    setMsg('⚠️ Sua assinatura não está ativa. Reative ou escolha um novo plano abaixo.');
                } else {
                    setMsg('⚠️ Você precisa de um plano ativo pra acessar essa área.');
                }
            } catch { setMsg('⚠️ Você precisa de um plano ativo pra continuar.'); }
        }
        if (params?.get('welcome') === '1') {
            setMsg('👋 Bem-vindo! Você tem 7 dias grátis pra testar. Confira os planos abaixo pra continuar depois.');
        }
        loadAll();
    }, [params]);

    async function loadAll() {
        setLoading(true);
        try {
            const [s, ps] = await Promise.all([
                api.getSubscription(),
                api.listPlans(),
            ]);
            setSub(s);
            setPlans(ps);
        } catch (e: any) { setMsg('Erro carregando: ' + e.message); }
        finally { setLoading(false); }
    }

    async function subscribe(planId: string) {
        setBusy(planId);
        try {
            const { url } = await api.createCheckout(planId);
            window.location.href = url;
        } catch (e: any) { setMsg('Erro: ' + e.message); setBusy(null); }
    }

    async function openPortal() {
        setBusy('portal');
        try {
            const { url } = await api.openBillingPortal();
            window.location.href = url;
        } catch (e: any) { setMsg('Erro: ' + e.message); setBusy(null); }
    }

    if (loading) {
        return <div className="fade-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>;
    }
    if (!sub) return <div className="fade-in" style={{ padding: 40 }}>Erro ao carregar assinatura.</div>;

    const planIcons: Record<string, React.ReactNode> = {
        starter: <Zap size={20} />, pro: <Star size={20} />, agency: <Building2 size={20} />, elite: <Sparkles size={20} />,
    };
    const statusColor = sub.status === 'active' ? '#22c55e' : sub.status === 'trialing' ? 'var(--primary)' : sub.status === 'past_due' ? '#f59e0b' : '#ef4444';
    const trialDays = sub.trial_ends_at
        ? Math.max(0, Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000))
        : 0;
    const creditsPct = sub.limits.monthly_ai_credits > 0
        ? (sub.usage.ai_credits_used / sub.limits.monthly_ai_credits) * 100 : 0;
    const clientsPct = sub.limits.max_clients > 0
        ? (sub.usage.clients / sub.limits.max_clients) * 100 : 0;

    const planLabels: Record<string, string> = { trial: 'Trial', starter: 'Starter', pro: 'Pro', agency: 'Agency', elite: 'Elite' };

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>💳 Assinatura & Cobrança</h1>
                    <p>Gerencie seu plano, uso e histórico de pagamentos</p>
                </div>
                <button className="btn" onClick={loadAll}><RefreshCw size={16} /> Atualizar</button>
            </div>

            {sub?.is_admin && (
                <div style={{
                    marginBottom: 20,
                    padding: '14px 18px',
                    background: 'linear-gradient(90deg, rgba(211,241,0,.15), rgba(211,241,0,.05))',
                    border: '1px solid rgba(211,241,0,.35)',
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <Sparkles size={18} color="var(--primary)" />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                            Você é admin — acesso ilimitado
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                            Nenhuma restrição de plano se aplica pra sua conta. Os planos abaixo são o que os clientes finais vão ver.
                        </div>
                    </div>
                </div>
            )}

            {msg && (
                <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertCircle size={16} /> <span>{msg}</span>
                </div>
            )}

            {/* Plano atual */}
            <div className="card" style={{ padding: 24, marginBottom: 20, borderTop: `3px solid ${statusColor}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 6 }}>Plano atual</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ color: 'var(--primary)' }}>{planIcons[sub.plan] || <Zap size={20} />}</div>
                            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{planLabels[sub.plan]}</h2>
                            <span style={{
                                fontSize: 11, padding: '4px 10px', borderRadius: 12,
                                background: statusColor + '20', color: statusColor, fontWeight: 800,
                                textTransform: 'uppercase', letterSpacing: '.06em',
                            }}>{sub.status}</span>
                        </div>
                        {sub.status === 'trialing' && (
                            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                🎁 <b>{trialDays} dias restantes</b> no seu trial gratuito
                            </div>
                        )}
                        {sub.current_period_end && sub.status !== 'trialing' && (
                            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                {sub.cancel_at_period_end ? '⚠ Cancela em: ' : '🔄 Próxima cobrança: '}
                                <b>{new Date(sub.current_period_end).toLocaleDateString('pt-BR')}</b>
                            </div>
                        )}
                    </div>

                    {sub.has_stripe_customer && (
                        <button className="btn" onClick={openPortal} disabled={busy === 'portal'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ExternalLink size={14} /> {busy === 'portal' ? 'Abrindo…' : 'Gerenciar cobrança'}
                        </button>
                    )}
                </div>

                {/* Uso */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <UsageBar label="Clientes" used={sub.usage.clients} limit={sub.limits.max_clients} unit="clientes" pct={clientsPct} />
                    <UsageBar label="Créditos IA" used={sub.usage.ai_credits_used} limit={sub.limits.monthly_ai_credits} unit="créditos" pct={creditsPct} />
                    <UsageBar label="Usuários" used={0} limit={sub.limits.max_seats} unit="usuários" pct={0} />
                </div>
            </div>

            {/* Planos disponíveis */}
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '32px 0 16px' }}>
                {sub.plan === 'trial' || sub.plan === 'starter' ? 'Faça upgrade' : 'Comparar planos'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                {plans.map(p => {
                    const isCurrent = p.id === sub.plan;
                    const popular = p.id === 'pro';
                    return (
                        <div key={p.id} className="card" style={{
                            padding: 24,
                            border: `1px solid ${popular ? 'var(--primary)' : 'var(--border)'}`,
                            background: popular ? 'linear-gradient(180deg, rgba(211,241,0,.06), var(--bg-card))' : 'var(--bg-card)',
                            position: 'relative',
                        }}>
                            {popular && (
                                <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: 'var(--primary)', color: 'var(--bg)', padding: '3px 12px', borderRadius: 12, fontSize: 10, fontWeight: 900, letterSpacing: '.1em' }}>POPULAR</div>
                            )}
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800, marginBottom: 6 }}>{planLabels[p.id]}</div>
                            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.02em' }}>R${p.price_brl}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>/mês</span></div>
                            <div style={{ display: 'grid', gap: 6, margin: '18px 0 20px', fontSize: 12.5, color: 'var(--text-muted)' }}>
                                <div>👥 <b style={{ color: 'var(--text)' }}>{p.max_clients}</b> clientes</div>
                                <div>🤖 <b style={{ color: 'var(--text)' }}>{p.monthly_ai_credits}</b> créditos IA/mês</div>
                                <div>👤 <b style={{ color: 'var(--text)' }}>{p.max_seats}</b> usuários</div>
                            </div>
                            {isCurrent ? (
                                <div style={{ padding: 10, textAlign: 'center', background: 'var(--bg-input)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700 }}>
                                    <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    Plano atual
                                </div>
                            ) : (
                                <button
                                    className="btn"
                                    onClick={() => subscribe(p.id)}
                                    disabled={!!busy}
                                    style={{
                                        width: '100%', padding: 12,
                                        background: popular ? 'var(--primary)' : 'transparent',
                                        color: popular ? 'var(--bg)' : 'var(--text)',
                                        border: popular ? 'none' : '1px solid var(--border)',
                                        fontWeight: 800, cursor: busy ? 'wait' : 'pointer',
                                    }}
                                >
                                    {busy === p.id ? 'Redirecionando…' : 'Assinar'}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function UsageBar({ label, used, limit, unit, pct }: { label: string; used: number; limit: number; unit: string; pct: number }) {
    const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : 'var(--primary)';
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 800 }}>{used}<span style={{ color: 'var(--text-muted)' }}>/{limit}</span></span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>{unit}</div>
        </div>
    );
}

export default function BillingPage() {
    return (
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Carregando…</div>}>
            <BillingPageInner />
        </Suspense>
    );
}
