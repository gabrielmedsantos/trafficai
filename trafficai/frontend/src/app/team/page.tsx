'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Clock, CheckCircle2, TrendingUp,
    ChevronLeft, ChevronRight, Building2, X,
    ArrowUpRight, Plus, Pencil, Trash2, Mail,
} from 'lucide-react';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MemberStats {
    user_id: string;
    name: string;
    email: string;
    department: string | null;
    job_title: string | null;
    avatar_color: string;
    tasks_done: number;
    tasks_pending: number;
    tasks_skipped: number;
    tasks_total: number;
    total_seconds: number;
    clients_served: number;
    by_type: Record<string, { count: number; total_seconds: number }>;
}

interface Member {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'member';
    department: string | null;
    job_title: string | null;
    avatar_color: string;
    capabilities?: string[] | null;
    created_at?: string;
    updated_at?: string;
}

interface MemberForm {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'member';
    department: string;
    job_title: string;
    avatar_color: string;
    capabilities: string[] | null;
}

// Permissão de equipe por funcionalidade — admins sempre têm acesso total,
// independente do que estiver aqui. `null` = sem restrição (default).
const CAPABILITIES: { key: string; label: string }[] = [
    { key: 'meta_campaigns', label: 'Gerenciar Campanhas Meta' },
    { key: 'google_campaigns', label: 'Gerenciar Campanhas Google' },
    { key: 'ai_agent', label: 'Acesso ao Agente IA' },
    { key: 'compiled_data', label: 'Dados Compilados' },
    { key: 'creatives', label: 'Criativos' },
    { key: 'metrics', label: 'Métricas' },
    { key: 'balance_alerts', label: 'Alerta de Saldo' },
    { key: 'dashboard_share', label: 'Compartilhar Dashboard' },
    { key: 'whatsapp_connections', label: 'Conexões WhatsApp' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function toISO(d: Date): string { return d.toISOString().split('T')[0]; }
function addDays(d: Date, n: number): Date {
    const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function fmtDateBR(iso: string): string {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const TASK_LABELS: Record<string, string> = {
    analysis: 'Análise',
    report: 'Relatório',
    checkin_wed: 'Check-in Qua',
    checkin_fri: 'Check-in Sex',
};

const AVATAR_COLORS = ['#ff6b35', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

const DEFAULT_FORM: MemberForm = {
    name: '',
    email: '',
    password: '',
    role: 'member',
    department: '',
    job_title: '',
    avatar_color: '#ff6b35',
    capabilities: null,
};

type RangeMode = 'week' | 'month' | 'custom';

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function TeamPage() {
    const [members, setMembers] = useState<MemberStats[]>([]);
    const [memberIndex, setMemberIndex] = useState<Record<string, Member>>({});
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [rangeMode, setRangeMode] = useState<RangeMode>('week');
    const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
    const [customSince, setCustomSince] = useState(() => toISO(getMonday(new Date())));
    const [customUntil, setCustomUntil] = useState(() => toISO(new Date()));
    const [selectedDept, setSelectedDept] = useState('');
    const [sortBy, setSortBy] = useState<'tasks_done' | 'total_seconds' | 'clients_served'>('tasks_done');
    const [detail, setDetail] = useState<MemberStats | null>(null);
    const [drawerTab, setDrawerTab] = useState<'overview' | 'breakdown'>('overview');
    const [editing, setEditing] = useState<Member | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const isAdmin = currentUser?.role === 'admin';

    const since = rangeMode === 'week'
        ? toISO(weekStart)
        : rangeMode === 'month'
        ? toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
        : customSince;

    const until = rangeMode === 'week'
        ? toISO(addDays(weekStart, 6))
        : rangeMode === 'month'
        ? toISO(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
        : customUntil;

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, membersList, me] = await Promise.all([
                fetch(`${API}/tasks/team-stats?since=${since}&until=${until}`, {
                    headers: { Authorization: `Bearer ${token()}` },
                }).then(r => r.json()),
                api.getTeamMembers().catch(() => []),
                api.getMe().catch(() => null),
            ]);

            if (statsRes.success) {
                setMembers(statsRes.data);
            } else {
                setMembers([]);
            }

            setCurrentUser(me);

            const idx: Record<string, Member> = {};
            for (const m of membersList || []) idx[m.id] = m;
            setMemberIndex(idx);
        } catch (err) {
            console.error('Team fetch failed', err);
        } finally {
            setLoading(false);
        }
    }, [since, until]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const departments = Array.from(new Set(members.map(m => m.department || 'Sem área').filter(Boolean)));

    const filtered = members
        .filter(m => !selectedDept || (m.department || 'Sem área') === selectedDept)
        .sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]);

    const totalDone = filtered.reduce((s, m) => s + m.tasks_done, 0);
    const totalSeconds = filtered.reduce((s, m) => s + m.total_seconds, 0);
    const totalPending = filtered.reduce((s, m) => s + m.tasks_pending, 0);
    const totalAll = filtered.reduce((s, m) => s + m.tasks_total, 0);
    const completionPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

    const rangeLabel = rangeMode === 'week'
        ? `${fmtDateBR(toISO(weekStart))} – ${fmtDateBR(toISO(addDays(weekStart, 6)))}`
        : rangeMode === 'month'
        ? new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : `${fmtDateBR(customSince)} – ${fmtDateBR(customUntil)}`;

    const maxDone = Math.max(1, ...filtered.map(m => m.tasks_done));

    // Top performer + needs-attention pra banner
    const topPerformer = filtered.length > 1 && totalDone > 0 ? filtered[0] : null;
    const needsAttention = filtered.filter(m => m.tasks_total > 0 && m.tasks_done / m.tasks_total < 0.5);

    return (
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* ─── Header ─── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Time</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                        {filtered.length} membro{filtered.length !== 1 ? 's' : ''} · {totalDone} tarefa{totalDone !== 1 ? 's' : ''} · {fmtSeconds(totalSeconds)} · {completionPct}% conclusão
                    </p>
                </div>
                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                        <Plus size={16} /> Adicionar membro
                    </button>
                )}
            </div>

            {/* ─── Filter bar ─── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Segmented control: período */}
                <div style={{ display: 'inline-flex', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                    {(['week', 'month', 'custom'] as RangeMode[]).map(m => (
                        <button key={m} type="button" onClick={() => setRangeMode(m)}
                            style={{
                                padding: '6px 14px',
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: rangeMode === m ? '#fff' : 'var(--text-muted)',
                                background: rangeMode === m ? 'var(--primary)' : 'transparent',
                                border: 'none', borderRadius: 6, cursor: 'pointer',
                                transition: 'background 150ms ease, color 150ms ease',
                            }}>
                            {m === 'week' ? 'Semana' : m === 'month' ? 'Mês' : 'Personalizado'}
                        </button>
                    ))}
                </div>

                {/* Navegador de período */}
                {rangeMode === 'week' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '4px 8px' }}>
                        <button type="button" onClick={() => setWeekStart(d => addDays(d, -7))}
                            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6 }}>
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', minWidth: 150, textAlign: 'center' }}>{rangeLabel}</span>
                        <button type="button" onClick={() => setWeekStart(d => addDays(d, 7))}
                            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 6 }}>
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}

                {rangeMode === 'custom' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input type="date" value={customSince} onChange={e => setCustomSince(e.target.value)}
                            style={{ padding: '7px 10px', fontSize: 12.5, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>até</span>
                        <input type="date" value={customUntil} onChange={e => setCustomUntil(e.target.value)}
                            style={{ padding: '7px 10px', fontSize: 12.5, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none' }} />
                    </div>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    {departments.length > 1 && (
                        <div style={{ position: 'relative' }}>
                            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                                style={{ padding: '7px 30px 7px 12px', fontSize: 12.5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', outline: 'none', appearance: 'none' }}>
                                <option value="">Todas as áreas</option>
                                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ position: 'relative' }}>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                            style={{ padding: '7px 30px 7px 12px', fontSize: 12.5, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', cursor: 'pointer', outline: 'none', appearance: 'none', fontWeight: 500 }}>
                            <option value="tasks_done">↓ Tarefas concluídas</option>
                            <option value="total_seconds">↓ Tempo trabalhado</option>
                            <option value="clients_served">↓ Clientes atendidos</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ─── KPI cards ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 22 }}>
                {[
                    { label: 'Membros ativos', value: filtered.length },
                    { label: 'Tarefas concluídas', value: totalDone, color: 'var(--accent-green)' },
                    { label: 'Tarefas pendentes', value: totalPending, color: totalPending > 0 ? 'var(--accent-yellow)' : undefined },
                    { label: 'Tempo total', value: fmtSeconds(totalSeconds) },
                    { label: 'Taxa de conclusão', value: `${completionPct}%`, color: completionPct >= 80 ? 'var(--accent-green)' : completionPct >= 50 ? undefined : 'var(--accent-yellow)' },
                ].map(k => (
                    <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{k.label}</div>
                        <div className="num" style={{ fontSize: 22, fontWeight: 700, color: k.color || 'var(--text)', marginTop: 4 }}>{k.value}</div>
                    </div>
                ))}
            </div>

            {/* ─── Hint quando só tem admin ─── */}
            {!loading && filtered.length <= 1 && isAdmin && (
                <div style={{
                    padding: '14px 18px',
                    background: 'rgba(255, 107, 53, 0.07)',
                    border: '1px solid rgba(255, 107, 53, 0.22)',
                    borderRadius: 12,
                    marginBottom: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16, flexWrap: 'wrap',
                }}>
                    <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Você ainda é o único no time</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Adicione gestores e analistas pra acompanhar a produtividade individual.</div>
                    </div>
                    <button type="button" onClick={() => setShowCreate(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={14} /> Adicionar membro
                    </button>
                </div>
            )}

            {/* ─── Top performer banner ─── */}
            {topPerformer && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '12px 16px',
                    background: 'linear-gradient(90deg, rgba(255,107,53,.08), transparent)',
                    border: '1px solid var(--border)',
                    borderLeft: '3px solid var(--primary)',
                    borderRadius: 12,
                    marginBottom: 18,
                }}>
                    <Avatar color={topPerformer.avatar_color} initials={getInitials(topPerformer.name)} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 2 }}>Top performer no período</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                            {topPerformer.name}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                                · {topPerformer.tasks_done} tarefas · {fmtSeconds(topPerformer.total_seconds)} · {topPerformer.clients_served} clientes
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Needs attention banner ─── */}
            {needsAttention.length > 0 && filtered.length > 2 && (
                <div style={{
                    padding: '14px 18px',
                    background: 'rgba(239,68,68,.05)',
                    border: '1px solid rgba(239,68,68,.2)',
                    borderRadius: 12,
                    marginBottom: 18,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#ef4444' }}>
                            {needsAttention.length} {needsAttention.length === 1 ? 'membro precisa' : 'membros precisam'} de atenção
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>· Menos de 50% das tarefas concluídas</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {needsAttention.slice(0, 6).map(m => (
                            <button key={m.user_id} onClick={() => { setDetail(m); setDrawerTab('overview'); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 999, cursor: 'pointer' }}>
                                <Avatar color={m.avatar_color} initials={getInitials(m.name)} size={20} />
                                <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{m.name}</span>
                                <span style={{ fontSize: 11, color: '#ef4444' }}>{Math.round((m.tasks_done / m.tasks_total) * 100)}%</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Ranking table ─── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text-muted)' }}>
                    <Users size={36} style={{ opacity: .3, marginBottom: 10 }} />
                    <p style={{ margin: 0, fontSize: 14.5 }}>Nenhum membro no período</p>
                    <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>Adicione pessoas ao time para começar a acompanhar.</p>
                </div>
            ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '48px minmax(220px, 2fr) 130px 110px 110px 130px 100px 150px 40px',
                        gap: 12,
                        padding: '12px 20px',
                        background: 'var(--bg-surface-2)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: 'var(--text-muted)',
                    }}>
                        <div>#</div>
                        <div>Membro</div>
                        <div>Área</div>
                        <div style={{ textAlign: 'right' }}>Concluídas</div>
                        <div style={{ textAlign: 'right' }}>Pendentes</div>
                        <div style={{ textAlign: 'right' }}>Tempo</div>
                        <div style={{ textAlign: 'right' }}>Clientes</div>
                        <div>Desempenho</div>
                        <div></div>
                    </div>

                    {filtered.map((member, i) => {
                        const pct = member.tasks_total > 0 ? Math.round((member.tasks_done / member.tasks_total) * 100) : 0;
                        const barWidth = (member.tasks_done / maxDone) * 100;
                        const perfColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                        const medalColor = i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--text-muted)';

                        return (
                            <div key={member.user_id}
                                onClick={() => { setDetail(member); setDrawerTab('overview'); }}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '48px minmax(220px, 2fr) 130px 110px 110px 130px 100px 150px 40px',
                                    gap: 12,
                                    padding: '14px 20px',
                                    alignItems: 'center',
                                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                                    cursor: 'pointer',
                                    transition: 'background .12s',
                                }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                                {/* # */}
                                <div style={{ fontSize: 13, fontWeight: 700, color: medalColor }}>
                                    {i + 1}
                                </div>

                                {/* Membro */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                    <Avatar color={member.avatar_color} initials={getInitials(member.name)} size={30} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {member.name}
                                        </div>
                                        {member.job_title && (
                                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {member.job_title}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Área */}
                                <div>
                                    {member.department ? (
                                        <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 500, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{member.department}</span>
                                    ) : (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                    )}
                                </div>

                                {/* Concluídas */}
                                <div className="num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                                    {member.tasks_done}
                                </div>

                                {/* Pendentes */}
                                <div className="num" style={{ textAlign: 'right', fontSize: 13.5, color: member.tasks_pending > 0 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                                    {member.tasks_pending || '—'}
                                </div>

                                {/* Tempo */}
                                <div className="num" style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                                    {member.total_seconds > 0 ? fmtSeconds(member.total_seconds) : '—'}
                                </div>

                                {/* Clientes */}
                                <div className="num" style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)' }}>
                                    {member.clients_served || '—'}
                                </div>

                                {/* Desempenho */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${barWidth}%`, background: perfColor, borderRadius: 3, transition: 'width 300ms ease' }} />
                                    </div>
                                    <span className="num" style={{ fontSize: 11.5, color: perfColor, minWidth: 32, textAlign: 'right', fontWeight: 600 }}>{pct}%</span>
                                </div>

                                {/* Arrow */}
                                <div>
                                    <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Drawer único (substitui o modal de detalhe) ─── */}
            {detail && (() => {
                const stats = detail;
                const cPct = stats.tasks_total > 0 ? Math.round((stats.tasks_done / stats.tasks_total) * 100) : 0;
                return (
                    <>
                        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200 }} />
                        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            {/* Header */}
                            <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                                <Avatar color={stats.avatar_color} initials={getInitials(stats.name)} size={46} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: 16.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats.name}</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                        {stats.job_title || 'Sem cargo'}
                                        {stats.department && <> · {stats.department}</>}
                                    </div>
                                </div>
                                {isAdmin && (
                                    <button onClick={() => { const r = memberIndex[stats.user_id]; if (r) { setEditing(r); setDetail(null); } }}
                                        title="Editar" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                        <Pencil size={14} />
                                    </button>
                                )}
                                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
                                {[
                                    { k: 'overview' as const, label: 'Visão geral' },
                                    { k: 'breakdown' as const, label: `Por tipo${Object.keys(stats.by_type).length ? ` · ${Object.keys(stats.by_type).length}` : ''}` },
                                ].map(t => (
                                    <button key={t.k} onClick={() => setDrawerTab(t.k)}
                                        style={{
                                            padding: '11px 16px', fontSize: 13.5,
                                            fontWeight: drawerTab === t.k ? 600 : 500,
                                            color: drawerTab === t.k ? 'var(--text)' : 'var(--text-muted)',
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            marginBottom: -1,
                                            borderBottom: `2px solid ${drawerTab === t.k ? 'var(--primary)' : 'transparent'}`,
                                        }}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            {/* Tab: Overview */}
                            {drawerTab === 'overview' && (
                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* Contato */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                        <Mail size={13} color="var(--text-muted)" />
                                        <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{stats.email}</span>
                                    </div>

                                    {/* KPI grid */}
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 10 }}>Período · {rangeLabel}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                                            {[
                                                { icon: CheckCircle2, label: 'Concluídas', value: stats.tasks_done },
                                                { icon: Clock, label: 'Tempo', value: fmtSeconds(stats.total_seconds) },
                                                { icon: Building2, label: 'Clientes', value: stats.clients_served },
                                                { icon: TrendingUp, label: 'Conclusão', value: `${cPct}%`, color: cPct >= 80 ? 'var(--accent-green)' : cPct >= 50 ? 'var(--accent-yellow)' : 'var(--accent-red)' },
                                            ].map(k => (
                                                <div key={k.label} style={{ padding: '11px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                                                        <k.icon size={11} color="var(--text-muted)" />
                                                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }}>{k.label}</span>
                                                    </div>
                                                    <div className="num" style={{ fontSize: 16.5, fontWeight: 700, color: k.color || 'var(--text)' }}>{k.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Progress: concluídas / pendentes / puladas */}
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 10 }}>Tarefas</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            <ProgressRow label="Concluídas" value={stats.tasks_done} max={stats.tasks_total} color="#10b981" />
                                            <ProgressRow label="Pendentes" value={stats.tasks_pending} max={stats.tasks_total} color="#f59e0b" />
                                            <ProgressRow label="Puladas" value={stats.tasks_skipped} max={stats.tasks_total} color="var(--text-muted)" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tab: Por tipo */}
                            {drawerTab === 'breakdown' && (
                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                                    {Object.keys(stats.by_type).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13.5 }}>
                                            Nenhum tipo de tarefa no período
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {Object.entries(stats.by_type)
                                                .sort((a, b) => b[1].count - a[1].count)
                                                .map(([type, data]) => (
                                                    <div key={type} style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        padding: '12px 14px',
                                                        background: 'var(--bg-surface-2)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: 10,
                                                    }}>
                                                        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{TASK_LABELS[type] || type}</span>
                                                        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{data.count} {data.count === 1 ? 'tarefa' : 'tarefas'}</span>
                                                            {data.total_seconds > 0 && (
                                                                <span className="num" style={{ fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 70, textAlign: 'right' }}>{fmtSeconds(data.total_seconds)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                );
            })()}

            {/* Create modal */}
            {showCreate && (
                <MemberFormModal
                    mode="create"
                    onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); fetchAll(); }}
                />
            )}

            {/* Edit modal */}
            {editing && (
                <MemberFormModal
                    mode="edit"
                    member={editing}
                    currentUserId={currentUser?.id}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); fetchAll(); }}
                />
            )}
        </div>
    );
}

// ─── Avatar ────────────────────────────────────────────────────────────────

function Avatar({ color, initials, size = 32 }: { color: string; initials: string; size?: number }) {
    return (
        <div
            style={{
                width: size,
                height: size,
                minWidth: size,
                borderRadius: size * 0.25,
                background: color,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.round(size * 0.38),
                fontWeight: 600,
                color: '#fff',
                letterSpacing: '-0.2px',
            }}
        >
            {initials}
        </div>
    );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="card stat-card">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
        </div>
    );
}

// ─── Member Detail Modal ───────────────────────────────────────────────────

function MemberDetailModal({ stats, onClose, rangeLabel, canEdit, onEdit }: {
    stats: MemberStats;
    onClose: () => void;
    rangeLabel: string;
    canEdit: boolean;
    onEdit: () => void;
}) {
    const completionPct = stats.tasks_total > 0
        ? Math.round((stats.tasks_done / stats.tasks_total) * 100)
        : 0;

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar color={stats.avatar_color} initials={getInitials(stats.name)} size={44} />
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                                {stats.name}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {stats.job_title || 'Sem cargo'}
                                {stats.department && (
                                    <>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{stats.department}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={12} /> {stats.email}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                    <MiniStat icon={CheckCircle2} label="Concluídas" value={stats.tasks_done} />
                    <MiniStat icon={Clock} label="Tempo" value={fmtSeconds(stats.total_seconds)} />
                    <MiniStat icon={Building2} label="Clientes" value={stats.clients_served} />
                    <MiniStat icon={TrendingUp} label="Conclusão" value={`${completionPct}%`} />
                </div>

                <div style={{ marginBottom: 6 }}>
                    <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                        Tarefas · {rangeLabel}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <ProgressRow label="Concluídas" value={stats.tasks_done} max={stats.tasks_total} color="var(--accent-green)" />
                        <ProgressRow label="Pendentes" value={stats.tasks_pending} max={stats.tasks_total} color="var(--accent-yellow)" />
                        <ProgressRow label="Puladas" value={stats.tasks_skipped} max={stats.tasks_total} color="var(--text-muted)" />
                    </div>
                </div>

                {Object.keys(stats.by_type).length > 0 && (
                    <div style={{ marginTop: 20 }}>
                        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                            Por tipo
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {Object.entries(stats.by_type).map(([type, data]) => (
                                <div
                                    key={type}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '10px 0',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                        {TASK_LABELS[type] || type}
                                    </span>
                                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                                            {data.count} {data.count === 1 ? 'tarefa' : 'tarefas'}
                                        </span>
                                        {data.total_seconds > 0 && (
                                            <span className="mono" style={{ fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
                                                {fmtSeconds(data.total_seconds)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {canEdit ? (
                        <button className="btn btn-secondary btn-sm" onClick={onEdit} type="button">
                            <Pencil size={13} /> Editar membro
                        </button>
                    ) : <span />}
                    <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
    return (
        <div style={{
            padding: '12px 14px',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon size={12} style={{ color: 'var(--text-muted)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 500 }}>
                    {label}
                </span>
            </div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                {value}
            </div>
        </div>
    );
}

function ProgressRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
    const pct = max > 0 ? (value / max) * 100 : 0;
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span className="num" style={{ color: 'var(--text-muted)' }}>{value} / {max}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 2,
                    transition: 'width 300ms ease',
                }} />
            </div>
        </div>
    );
}

// ─── Member Form Modal (create + edit) ─────────────────────────────────────

function MemberFormModal({ mode, member, currentUserId, onClose, onSaved }: {
    mode: 'create' | 'edit';
    member?: Member;
    currentUserId?: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState<MemberForm>(() => {
        if (member) {
            return {
                name: member.name,
                email: member.email,
                password: '',
                role: member.role,
                department: member.department || '',
                job_title: member.job_title || '',
                avatar_color: member.avatar_color || '#ff6b35',
                capabilities: member.capabilities ?? null,
            };
        }
        return DEFAULT_FORM;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isRestricted = form.capabilities !== null;
    const toggleRestrict = () => setForm(f => ({ ...f, capabilities: f.capabilities === null ? [] : null }));
    const toggleCap = (key: string) => setForm(f => {
        const current = f.capabilities || [];
        const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
        return { ...f, capabilities: next };
    });

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const update = (key: keyof MemberForm, v: string) => setForm(f => ({ ...f, [key]: v }));

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        if (!form.name.trim() || !form.email.trim()) {
            setError('Nome e email são obrigatórios.');
            return;
        }
        if (mode === 'create' && form.password.length < 8) {
            setError('A senha precisa ter no mínimo 8 caracteres.');
            return;
        }
        if (mode === 'edit' && form.password && form.password.length < 8) {
            setError('A nova senha precisa ter no mínimo 8 caracteres.');
            return;
        }

        setSaving(true);
        try {
            if (mode === 'create') {
                await api.createTeamMember({
                    name: form.name.trim(),
                    email: form.email.trim(),
                    password: form.password,
                    role: form.role,
                    department: form.department.trim() || undefined,
                    job_title: form.job_title.trim() || undefined,
                    avatar_color: form.avatar_color,
                    capabilities: form.capabilities,
                });
            } else if (member) {
                const payload: any = {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    role: form.role,
                    department: form.department.trim(),
                    job_title: form.job_title.trim(),
                    avatar_color: form.avatar_color,
                    capabilities: form.capabilities,
                };
                if (form.password) payload.password = form.password;
                await api.updateTeamMember(member.id, payload);
            }
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!member) return;
        if (!confirm(`Remover "${member.name}" do time? Esta ação é permanente.`)) return;
        setSaving(true);
        try {
            await api.deleteTeamMember(member.id);
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Erro ao remover');
            setSaving(false);
        }
    }

    const canDelete = mode === 'edit' && member && member.id !== currentUserId;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <form className="modal-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar color={form.avatar_color} initials={getInitials(form.name || '??')} size={40} />
                        <div className="modal-title">
                            {mode === 'create' ? 'Adicionar membro' : 'Editar membro'}
                        </div>
                    </div>
                    <button className="modal-close" type="button" onClick={onClose}><X size={16} /></button>
                </div>

                {error && (
                    <div style={{
                        padding: '10px 12px',
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.22)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#fca5a5',
                        fontSize: 12.5,
                        marginBottom: 12,
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                        <label className="form-label">Nome</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.name}
                            onChange={e => update('name', e.target.value)}
                            autoFocus
                            required
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-input"
                            value={form.email}
                            onChange={e => update('email', e.target.value)}
                            required
                            autoComplete="off"
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">
                            {mode === 'create' ? 'Senha' : 'Nova senha (opcional)'}
                        </label>
                        <input
                            type="password"
                            className="form-input"
                            value={form.password}
                            onChange={e => update('password', e.target.value)}
                            placeholder={mode === 'edit' ? 'Deixe em branco para manter' : 'Min. 8 caracteres'}
                            autoComplete="new-password"
                            minLength={mode === 'create' ? 8 : undefined}
                            required={mode === 'create'}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Cargo</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.job_title}
                            onChange={e => update('job_title', e.target.value)}
                            placeholder="Ex: Gestor de Tráfego"
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Área / Departamento</label>
                        <input
                            type="text"
                            className="form-input"
                            value={form.department}
                            onChange={e => update('department', e.target.value)}
                            placeholder="Ex: Tráfego, Criativo, CS"
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Permissão</label>
                        <select
                            className="form-select"
                            value={form.role}
                            onChange={e => update('role', e.target.value)}
                        >
                            <option value="member">Membro</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>

                    {form.role === 'member' && (
                        <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>Permissões por funcionalidade</span>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: 12.5, cursor: 'pointer', textTransform: 'none' }}>
                                    <input type="checkbox" checked={!isRestricted} onChange={toggleRestrict} />
                                    Acesso total
                                </label>
                            </label>
                            {isRestricted && (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                                    padding: 12, marginTop: 4,
                                    background: 'var(--bg-surface-2, rgba(255,255,255,.03))',
                                    border: '1px solid var(--border)', borderRadius: 8,
                                }}>
                                    {CAPABILITIES.map(cap => (
                                        <label key={cap.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={(form.capabilities || []).includes(cap.key)}
                                                onChange={() => toggleCap(cap.key)}
                                            />
                                            {cap.label}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                        <label className="form-label">Cor do avatar</label>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {AVATAR_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => update('avatar_color', c)}
                                    style={{
                                        width: 30,
                                        height: 30,
                                        borderRadius: 8,
                                        background: c,
                                        border: form.avatar_color === c ? '2px solid #fff' : '2px solid transparent',
                                        boxShadow: form.avatar_color === c ? '0 0 0 2px var(--primary)' : 'none',
                                        cursor: 'pointer',
                                        transition: 'var(--transition)',
                                    }}
                                    aria-label={`Cor ${c}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    {canDelete ? (
                        <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={handleDelete}
                            disabled={saving}
                        >
                            <Trash2 size={13} /> Remover
                        </button>
                    ) : <span />}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                            {saving ? 'Salvando…' : mode === 'create' ? 'Criar membro' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
