'use client';

import { useEffect, useState, useCallback } from 'react';
import { Users, Target, Edit2, X, Loader2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './team.module.css';

interface Salesperson {
    salespersonId: string;
    name: string;
    avatarColor: string;
    messagesSent: number;
    avgFirstResponseSeconds: number;
    proposalsSent: number;
    dealsWon: number;
    dealsWonValue: number;
    monthlyGoalValue: number;
    goalProgressPct: number;
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = (v: number) => v.toLocaleString('pt-BR');
const fmtTime = (s: number) => {
    if (!s) return '—';
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.round(s / 60)}min`;
    return `${(s / 3600).toFixed(1)}h`;
};

const PERIODS = [{ v: '7d', l: '7 dias' }, { v: '30d', l: '30 dias' }, { v: '90d', l: '90 dias' }];

export default function TeamPage() {
    const [team, setTeam] = useState<Salesperson[]>([]);
    const [period, setPeriod] = useState('30d');
    const [clientId, setClientId] = useState('');
    const [loading, setLoading] = useState(true);
    const [showGoalsModal, setShowGoalsModal] = useState(false);

    const load = useCallback(() => {
        setLoading(true);
        api.getCommercialTeam({ period, ...(clientId && { clientId }) })
            .then(setTeam)
            .finally(() => setLoading(false));
    }, [period, clientId]);

    useEffect(() => { load(); }, [load]);

    const totalGoal = team.reduce((s, sp) => s + sp.monthlyGoalValue, 0);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <Users size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Vendedores</h1>
                    </div>
                    <p className={styles.subtitle}>
                        Performance no período · Meta total do mês: <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(totalGoal)}</strong>
                    </p>
                </div>
                <div className={styles.filters}>
                    <ClientPicker value={clientId} onChange={setClientId} />
                    {PERIODS.map(p => (
                        <button key={p.v} onClick={() => setPeriod(p.v)}
                            className={`${styles.chip} ${period === p.v ? styles.chipActive : ''}`}>
                            {p.l}
                        </button>
                    ))}
                    <button onClick={() => setShowGoalsModal(true)} className={styles.btnPrimary}>
                        <Target size={13} /> Gerenciar Metas
                    </button>
                </div>
            </header>

            {loading && <div className={styles.empty}>Carregando…</div>}
            {!loading && team.length === 0 && <div className={styles.empty}>Nenhum vendedor cadastrado</div>}

            <div className={styles.grid}>
                {team.map((sp, idx) => (
                    <div key={sp.salespersonId} className={styles.card}>
                        <div className={styles.rank}>#{idx + 1}</div>
                        <div className={styles.cardHeader}>
                            <div className={styles.avatar} style={{ background: sp.avatarColor }}>
                                {sp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </div>
                            <div>
                                <h3 className={styles.cardName}>{sp.name}</h3>
                                <p className={styles.cardSub}>
                                    {sp.dealsWon} ganhos · {fmtBRL(sp.dealsWonValue)}
                                </p>
                            </div>
                        </div>

                        {sp.monthlyGoalValue > 0 && (
                            <div className={styles.goal}>
                                <div className={styles.goalHeader}>
                                    <span>Meta mensal</span>
                                    <span className={styles.goalPct}>{sp.goalProgressPct.toFixed(0)}%</span>
                                </div>
                                <div className={styles.goalBar}>
                                    <div className={styles.goalFill}
                                        style={{ width: `${Math.min(100, sp.goalProgressPct)}%`, background: sp.goalProgressPct >= 100 ? 'var(--accent-green)' : sp.avatarColor }} />
                                </div>
                                <div className={styles.goalText}>
                                    {fmtBRL(sp.dealsWonValue)} de {fmtBRL(sp.monthlyGoalValue)}
                                </div>
                            </div>
                        )}

                        <div className={styles.stats}>
                            <div className={styles.stat}>
                                <div className={styles.statLabel}>Mensagens</div>
                                <div className={styles.statValue}>{fmtNum(sp.messagesSent)}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statLabel}>1ª resposta</div>
                                <div className={styles.statValue}>{fmtTime(sp.avgFirstResponseSeconds)}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statLabel}>Propostas</div>
                                <div className={styles.statValue}>{fmtNum(sp.proposalsSent)}</div>
                            </div>
                            <div className={styles.stat}>
                                <div className={styles.statLabel}>Fechamentos</div>
                                <div className={styles.statValue}>{fmtNum(sp.dealsWon)}</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showGoalsModal && (
                <ManageGoalsModal
                    clientId={clientId}
                    onClose={() => setShowGoalsModal(false)}
                    onSaved={() => { setShowGoalsModal(false); load(); }}
                />
            )}
        </div>
    );
}

// ─── Modal de gestão de metas ──────────────────────────────────────────────

interface AllSalesperson {
    id: string;
    name: string;
    avatar_color: string | null;
    monthly_goal_value: string | number;
    active: boolean;
    external_source: string | null;
}

function ManageGoalsModal({ clientId, onClose, onSaved }: {
    clientId: string;
    onClose: () => void; onSaved: () => void;
}) {
    const [allSps, setAllSps] = useState<AllSalesperson[]>([]);
    const [individualGoals, setIndividualGoals] = useState<Record<string, string>>({});
    const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});
    const [totalGoal, setTotalGoal] = useState<string>('0');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Carrega TODOS os vendedores (incluindo inativos)
    useEffect(() => {
        api.getCommercialSalespeople(clientId || undefined, true)
            .then((rows: any[]) => {
                const list: AllSalesperson[] = rows.map(r => ({
                    id: r.id,
                    name: r.name,
                    avatar_color: r.avatar_color,
                    monthly_goal_value: r.monthly_goal_value,
                    active: r.active,
                    external_source: r.external_source,
                }));
                setAllSps(list);
                const goals: Record<string, string> = {};
                const actives: Record<string, boolean> = {};
                let total = 0;
                list.forEach(sp => {
                    goals[sp.id] = String(Number(sp.monthly_goal_value) || 0);
                    actives[sp.id] = sp.active;
                    if (sp.active) total += Number(sp.monthly_goal_value) || 0;
                });
                setIndividualGoals(goals);
                setActiveMap(actives);
                setTotalGoal(String(total));
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [clientId]);

    const distributeEqually = () => {
        const total = parseFloat(totalGoal) || 0;
        const activeOnes = allSps.filter(sp => activeMap[sp.id]);
        const each = activeOnes.length > 0 ? total / activeOnes.length : 0;
        const goals = { ...individualGoals };
        activeOnes.forEach(sp => { goals[sp.id] = String(Math.round(each)); });
        setIndividualGoals(goals);
    };

    const sumActive = allSps
        .filter(sp => activeMap[sp.id])
        .reduce((s, sp) => s + (parseFloat(individualGoals[sp.id] || '0') || 0), 0);

    const save = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await Promise.all(
                allSps.map(sp =>
                    api.updateCommercialSalesperson(sp.id, {
                        monthly_goal_value: parseFloat(individualGoals[sp.id] || '0') || 0,
                        active: activeMap[sp.id],
                    })
                )
            );
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleActive = (id: string) => {
        setActiveMap({ ...activeMap, [id]: !activeMap[id] });
    };

    const sourceBadge = (src: string | null) => {
        if (src === 'kommo') return { label: 'Kommo', color: '#22c55e' };
        if (src === 'manual') return { label: 'Mock', color: '#f59e0b' };
        return { label: src || '—', color: '#6b7280' };
    };

    return (
        <>
            <div className={styles.modalBackdrop} onClick={onClose} />
            <div className={styles.modal}>
                <header className={styles.modalHeader}>
                    <h2>Gerenciar Metas e Vendedores</h2>
                    <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
                </header>
                <div className={styles.modalBody}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                            <Loader2 size={20} className={styles.spin} /> Carregando…
                        </div>
                    ) : (
                        <>
                            <div className={styles.field}>
                                <label>Meta total do workspace (R$)</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="number"
                                        value={totalGoal}
                                        onChange={e => setTotalGoal(e.target.value)}
                                        placeholder="ex: 200000"
                                        style={{ flex: 1 }}
                                    />
                                    <button type="button" onClick={distributeEqually} className={styles.btnSecondary}>
                                        Distribuir igual
                                    </button>
                                </div>
                                <small>Distribui apenas entre os vendedores ATIVOS abaixo.</small>
                            </div>

                            <div className={styles.field}>
                                <label>Vendedores ({allSps.filter(s => activeMap[s.id]).length} ativos / {allSps.length} total)</label>
                                <small style={{ marginBottom: 8 }}>
                                    Desmarque vendedores duplicados ou inativos. A toggle desativa em todas as listas.
                                </small>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                                    {allSps.map(sp => {
                                        const isActive = activeMap[sp.id] ?? false;
                                        const badge = sourceBadge(sp.external_source);
                                        return (
                                            <div
                                                key={sp.id}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'auto auto 1fr auto auto',
                                                    alignItems: 'center',
                                                    gap: 10,
                                                    padding: '8px 10px',
                                                    background: isActive ? 'var(--bg-surface-2)' : 'rgba(255,255,255,0.02)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 6,
                                                    opacity: isActive ? 1 : 0.55,
                                                }}
                                            >
                                                {/* Toggle ativar/desativar */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleActive(sp.id)}
                                                    title={isActive ? 'Desativar vendedor' : 'Ativar vendedor'}
                                                    style={{
                                                        width: 36, height: 20,
                                                        background: isActive ? 'var(--accent-green)' : 'var(--bg-surface)',
                                                        border: '1px solid ' + (isActive ? 'var(--accent-green)' : 'var(--border)'),
                                                        borderRadius: 10,
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'all 140ms',
                                                    }}
                                                >
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: 1, left: isActive ? 17 : 1,
                                                        width: 16, height: 16,
                                                        background: 'white',
                                                        borderRadius: '50%',
                                                        transition: 'left 140ms',
                                                    }} />
                                                </button>
                                                <span
                                                    style={{
                                                        width: 28, height: 28, borderRadius: '50%',
                                                        background: sp.avatar_color || '#ff6b35',
                                                        color: 'white',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: 11, fontWeight: 600,
                                                    }}
                                                >
                                                    {sp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                                </span>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {sp.name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: 9,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 0.4,
                                                        color: badge.color,
                                                        padding: '1px 6px',
                                                        background: `${badge.color}15`,
                                                        border: `1px solid ${badge.color}30`,
                                                        borderRadius: 8,
                                                        width: 'fit-content',
                                                    }}>
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>R$</span>
                                                <input
                                                    type="number"
                                                    value={individualGoals[sp.id] || ''}
                                                    onChange={e => setIndividualGoals({
                                                        ...individualGoals,
                                                        [sp.id]: e.target.value,
                                                    })}
                                                    disabled={!isActive}
                                                    style={{ width: 110, textAlign: 'right' }}
                                                    placeholder="0"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <small style={{ marginTop: 8 }}>
                                    Soma dos ativos: <strong style={{ color: 'var(--text-primary)' }}>{fmtBRL(sumActive)}</strong>
                                    {Math.abs(sumActive - (parseFloat(totalGoal) || 0)) > 0.01 && (
                                        <span style={{ color: 'var(--accent-yellow)' }}>
                                            {' '}· difere de {fmtBRL(parseFloat(totalGoal) || 0)} (total)
                                        </span>
                                    )}
                                </small>
                            </div>

                            {error && <div className={styles.errorBox}>{error}</div>}

                            <div className={styles.modalActions}>
                                <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancelar</button>
                                <button type="button" onClick={save} disabled={submitting} className={styles.btnPrimary}>
                                    {submitting ? <><Loader2 size={14} className={styles.spin} /> Salvando…</> : <><Check size={13} /> Salvar tudo</>}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
