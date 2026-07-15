'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAccount } from '@/app/AccountContext';
import {
    Palette, Send, Star, Lightbulb, ThumbsUp, ThumbsDown, Sparkles,
    TrendingUp, Play, ExternalLink, Loader2,
} from 'lucide-react';

type Tab = 'top' | 'manual';

export default function CreativePage() {
    const [tab, setTab] = useState<Tab>('top');

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Palette size={28} style={{ color: 'var(--accent-orange)' }} />
                        Criativos
                    </h1>
                    <p>Análise automática dos top anúncios rodando + revisão manual de textos</p>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
                <TabButton active={tab === 'top'} onClick={() => setTab('top')} icon={<Sparkles size={15} />}>
                    Top Criativos (IA)
                </TabButton>
                <TabButton active={tab === 'manual'} onClick={() => setTab('manual')} icon={<Send size={15} />}>
                    Analisar texto manual
                </TabButton>
            </div>

            {tab === 'top' ? <TopCreativesTab /> : <ManualAnalyzeTab />}
        </div>
    );
}

// ─── Tab 1: Top Criativos automático ────────────────────────────────────────

function TopCreativesTab() {
    const { accounts, selectedAccountId } = useAccount();
    const [accountId, setAccountId] = useState(selectedAccountId || '');
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Awaited<ReturnType<typeof api.analyzeTopCreatives>> | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleAnalyze() {
        if (!accountId) return alert('Selecione uma conta');
        setLoading(true); setError(null); setResult(null);
        try {
            const data = await api.analyzeTopCreatives(accountId, days, 10);
            setResult(data);
        } catch (e: any) {
            setError(e.message || 'Falha ao analisar');
        } finally { setLoading(false); }
    }

    const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const fmtNum = (v: number) => v.toLocaleString('pt-BR');

    return (
        <div>
            {/* Controles */}
            <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: '1 1 260px', margin: 0 }}>
                    <label className="form-label">Conta</label>
                    <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                        <option value="">Selecione…</option>
                        {accounts.map(a => (<option key={a.id} value={a.id}>{a.account_name}</option>))}
                    </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Período</label>
                    <select className="form-input" value={days} onChange={e => setDays(Number(e.target.value))}>
                        <option value={7}>Últimos 7 dias</option>
                        <option value={14}>Últimos 14 dias</option>
                        <option value={30}>Últimos 30 dias</option>
                        <option value={90}>Últimos 90 dias</option>
                    </select>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleAnalyze}
                    disabled={loading || !accountId}
                    style={{ padding: '12px 24px' }}
                >
                    {loading ? <><Loader2 size={16} className="spin" /> Analisando…</> : <><Sparkles size={16} /> Analisar Top 10</>}
                </button>
            </div>

            {error && (
                <div className="card" style={{ background: 'rgba(239,68,68,.08)', borderColor: 'rgba(239,68,68,.2)', color: 'var(--accent-red)' }}>
                    {error}
                </div>
            )}

            {!result && !error && !loading && (
                <div className="card empty-state">
                    <Sparkles size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-orange)', opacity: 0.4 }} />
                    <h3>Rank + análise IA dos top criativos</h3>
                    <p>Selecione uma conta e período. A IA identifica padrões vencedores e sugere próximos criativos.</p>
                </div>
            )}

            {result && (
                <div className="slide-in">
                    {/* Sumário do período */}
                    <div className="stats-grid" style={{ marginBottom: '20px' }}>
                        <StatCard label="Investido" value={fmtBRL(result.totals.spend)} icon={<TrendingUp size={16} />} />
                        <StatCard label="Conversões" value={fmtNum(result.totals.conversions)} accent="green" />
                        <StatCard label="Cliques" value={fmtNum(result.totals.clicks)} />
                        <StatCard label="Impressões" value={fmtNum(result.totals.impressions)} />
                    </div>

                    {/* Summary IA */}
                    <div className="card" style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,.06), rgba(139,92,246,.04))',
                        borderColor: 'rgba(245,158,11,.25)',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-orange)', marginBottom: '10px' }}>
                            <Sparkles size={16} /> Resumo executivo
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: '1.6' }}>
                            {result.analysis.summary}
                        </p>
                    </div>

                    {/* Padrões vencedores */}
                    <div className="card" style={{ marginBottom: '20px' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Star size={16} style={{ color: 'var(--accent-orange)' }} /> Padrões vencedores identificados
                        </h3>
                        {result.analysis.winning_patterns.map((p, i) => (
                            <div key={i} style={{
                                padding: '14px 16px',
                                background: 'var(--bg-secondary)',
                                borderRadius: 'var(--radius-sm)',
                                marginBottom: '12px',
                                borderLeft: '3px solid var(--accent-orange)',
                            }}>
                                <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '14px' }}>{p.pattern}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5', marginBottom: '6px' }}>{p.evidence}</div>
                                {p.ads?.length > 0 && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        Ads: {p.ads.join(', ')}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* 2 colunas: Recomendações + Insights */}
                    <div className="grid-2" style={{ marginBottom: '20px' }}>
                        <div className="card">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', marginBottom: '12px' }}>
                                <Lightbulb size={16} /> Recomendações
                            </h3>
                            <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.7' }}>
                                {result.analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                        <div className="card">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', marginBottom: '12px' }}>
                                <TrendingUp size={16} /> Insights de eficiência
                            </h3>
                            <ul style={{ paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.7' }}>
                                {result.analysis.insights.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                        </div>
                    </div>

                    {/* Grid de top ads */}
                    <div style={{ marginBottom: '20px' }}>
                        <h3 style={{ marginBottom: '12px' }}>Top 10 criativos (por spend)</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
                            {result.top_ads.map((ad, i) => (
                                <div key={ad.ad_id} className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.7)', color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 999, zIndex: 2 }}>#{i + 1}</div>
                                    {ad.thumbnail_url ? (
                                        <a href={ad.permalink_url || '#'} target="_blank" rel="noopener" style={{ display: 'block', aspectRatio: '1/1', background: '#000', position: 'relative' }}>
                                            <img src={ad.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            {ad.media_type === 'VIDEO' && (
                                                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                                                    <div style={{ width: 44, height: 44, background: 'rgba(0,0,0,.6)', borderRadius: '50%', display: 'grid', placeItems: 'center', border: '2px solid #fff' }}>
                                                        <Play size={18} color="#fff" fill="#fff" />
                                                    </div>
                                                </div>
                                            )}
                                        </a>
                                    ) : (
                                        <div style={{ aspectRatio: '1/1', background: 'var(--bg-input)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
                                            sem preview
                                        </div>
                                    )}
                                    <div style={{ padding: '12px 14px' }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ad.ad_name}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                                            <Stat label="Spend" value={fmtBRL(ad.spend)} />
                                            <Stat label={ad.action_type_label} value={String(ad.conversions)} accent="var(--accent-green)" />
                                            <Stat label="CPA" value={ad.cpa > 0 ? fmtBRL(ad.cpa) : '—'} accent="var(--accent-orange)" />
                                            <Stat label="CTR" value={`${ad.ctr.toFixed(2)}%`} />
                                        </div>
                                        {ad.permalink_url && (
                                            <a href={ad.permalink_url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 11, color: 'var(--accent-blue)' }}>
                                                <ExternalLink size={11} /> Abrir no Facebook
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Tab 2: Análise manual de texto ─────────────────────────────────────────

function ManualAnalyzeTab() {
    const [text, setText] = useState('');
    const [context, setContext] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    async function handleAnalyze() {
        if (!text.trim()) return;
        setLoading(true); setResult(null);
        try {
            const data = await api.analyzeCreativeText(text, context);
            setResult(data);
        } catch (err: any) {
            alert('Erro: ' + err.message);
        } finally { setLoading(false); }
    }

    function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
        return (
            <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color }}>{value}/100</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '4px', transition: 'width .6s ease' }} />
                </div>
            </div>
        );
    }

    return (
        <div className="grid-2">
            <div className="card">
                <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: 600 }}>Texto do Anúncio</h3>
                <div className="form-group">
                    <label className="form-label">Texto principal do criativo</label>
                    <textarea
                        className="form-input"
                        placeholder="Cole aqui o texto do seu anúncio, copy, headline ou descrição..."
                        value={text}
                        onChange={e => setText(e.target.value)}
                        style={{ minHeight: '160px' }}
                    />
                </div>
                <div className="form-group">
                    <label className="form-label">Contexto adicional (opcional)</label>
                    <input
                        className="form-input"
                        placeholder="Ex: Produto de emagrecimento, público feminino 25-45 anos"
                        value={context}
                        onChange={e => setContext(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>
                <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading || !text.trim()} style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
                    {loading ? <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} /> : <><Send size={16} /> Analisar com IA</>}
                </button>
            </div>

            <div>
                {result ? (
                    <div className="card slide-in">
                        <h3 style={{ marginBottom: '24px', fontSize: '16px', fontWeight: 600 }}>Resultado da Análise</h3>
                        <ScoreBar value={result.forca_hook} label="Força do Hook" color="var(--accent-blue)" />
                        <ScoreBar value={result.clareza_oferta} label="Clareza da Oferta" color="var(--accent-green)" />
                        <ScoreBar value={result.alinhamento_publico} label="Alinhamento com Público" color="var(--accent-purple)" />
                        <ScoreBar value={result.probabilidade_fadiga} label="Probabilidade de Fadiga" color="var(--accent-red)" />

                        <div style={{ marginTop: '24px' }}>
                            <Box color="green" title="Pontos Fortes" icon={<ThumbsUp size={14} />}>
                                {result.pontos_fortes?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </Box>
                            <Box color="red" title="Pontos Fracos" icon={<ThumbsDown size={14} />}>
                                {result.pontos_fracos?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </Box>
                            <Box color="blue" title="Sugestões de Melhoria" icon={<Lightbulb size={14} />}>
                                {result.sugestoes?.map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </Box>
                        </div>

                        {result.avaliacao_geral && (
                            <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                                <h4 style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>Avaliação Geral</h4>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.6' }}>{result.avaliacao_geral}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="card empty-state">
                        <Palette size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-orange)', opacity: 0.4 }} />
                        <h3>Analise seus criativos</h3>
                        <p>Cole o texto do seu anúncio e receba análises detalhadas com sugestões de melhoria</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function TabButton({ children, active, onClick, icon }: { children: React.ReactNode; active: boolean; onClick: () => void; icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'none',
                border: 'none',
                padding: '10px 18px',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? 'var(--accent-orange)' : 'transparent'}`,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: active ? 700 : 500,
                fontSize: 14,
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: '-1px',
            }}
        >
            {icon} {children}
        </button>
    );
}

function StatCard({ label, value, icon, accent }: { label: string; value: string; icon?: React.ReactNode; accent?: 'green' | 'orange' }) {
    const color = accent === 'green' ? 'var(--accent-green)' : accent === 'orange' ? 'var(--accent-orange)' : 'var(--text-primary)';
    return (
        <div className="stat-card">
            {icon && <div style={{ color: 'var(--text-muted)' }}>{icon}</div>}
            <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
            </div>
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value}</div>
        </div>
    );
}

function Box({ children, color, title, icon }: { children: React.ReactNode; color: 'green' | 'red' | 'blue'; title: string; icon: React.ReactNode }) {
    const colors = {
        green: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.15)', text: 'var(--accent-green)' },
        red: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)', text: 'var(--accent-red)' },
        blue: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)', text: 'var(--accent-blue)' },
    }[color];
    return (
        <div style={{ padding: '16px', background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 'var(--radius-sm)', marginBottom: '12px' }}>
            <h4 style={{ fontSize: '13px', color: colors.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>{icon} {title}</h4>
            <ul style={{ paddingLeft: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>{children}</ul>
        </div>
    );
}
