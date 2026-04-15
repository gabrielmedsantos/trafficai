'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Clock, CheckCircle2, TrendingUp, BarChart3,
    ChevronLeft, ChevronRight, Building2, Zap,
} from 'lucide-react';

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

const TASK_LABELS: Record<string, string> = {
    analysis: 'Análise',
    report: 'Relatório',
    checkin_wed: 'Check-in Qua',
    checkin_fri: 'Check-in Sex',
};

const TASK_COLORS: Record<string, string> = {
    analysis: '#8b5cf6',
    report: '#3b82f6',
    checkin_wed: '#f59e0b',
    checkin_fri: '#10b981',
};

type RangeMode = 'week' | 'month' | 'custom';

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function TeamPage() {
    const [members, setMembers] = useState<MemberStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [rangeMode, setRangeMode] = useState<RangeMode>('week');
    const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
    const [customSince, setCustomSince] = useState(() => toISO(getMonday(new Date())));
    const [customUntil, setCustomUntil] = useState(() => toISO(new Date()));
    const [selectedDept, setSelectedDept] = useState('');
    const [sortBy, setSortBy] = useState<'tasks_done' | 'total_seconds' | 'clients_served'>('tasks_done');

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

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/tasks/team-stats?since=${since}&until=${until}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const json = await res.json();
            if (json.success) setMembers(json.data);
            else if (res.status === 403) setMembers([]);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [since, until]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const departments = Array.from(new Set(members.map(m => m.department || 'Sem área').filter(Boolean)));

    const filtered = members
        .filter(m => !selectedDept || (m.department || 'Sem área') === selectedDept)
        .sort((a, b) => b[sortBy] - a[sortBy]);

    const totalDone = filtered.reduce((s, m) => s + m.tasks_done, 0);
    const totalSeconds = filtered.reduce((s, m) => s + m.total_seconds, 0);
    const totalClients = new Set(filtered.map(m => m.clients_served)).size;

    const rangeLabel = rangeMode === 'week'
        ? `${toISO(weekStart)} → ${toISO(addDays(weekStart, 6))}`
        : rangeMode === 'month'
        ? new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : `${customSince} → ${customUntil}`;

    return (
        <div style={{ padding: '32px 40px', fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 1200 }}>

            {/* Header */}
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Users size={24} color="#10b981" /> Gestão do Time
                </h1>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Acompanhe produtividade, tarefas e tempo de trabalho do time
                </p>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
                {/* Range mode */}
                <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, gap: 2 }}>
                    {(['week', 'month', 'custom'] as RangeMode[]).map(m => (
                        <button key={m} onClick={() => setRangeMode(m)}
                            style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: rangeMode === m ? '#10b981' : 'transparent', color: rangeMode === m ? '#fff' : 'var(--text-muted)', transition: 'all .15s' }}>
                            {m === 'week' ? 'Semana' : m === 'month' ? 'Mês' : 'Período'}
                        </button>
                    ))}
                </div>

                {/* Week navigation */}
                {rangeMode === 'week' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => setWeekStart(d => addDays(d, -7))} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><ChevronLeft size={15} /></button>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 190, textAlign: 'center' }}>{rangeLabel}</span>
                        <button onClick={() => setWeekStart(d => addDays(d, 7))} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><ChevronRight size={15} /></button>
                    </div>
                )}

                {/* Custom range */}
                {rangeMode === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="date" value={customSince} onChange={e => setCustomSince(e.target.value)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→</span>
                        <input type="date" value={customUntil} onChange={e => setCustomUntil(e.target.value)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 10px', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                    </div>
                )}

                {/* Dept filter */}
                {departments.length > 1 && (
                    <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                        <option value="">Todas as áreas</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                )}

                {/* Sort */}
                <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer', marginLeft: 'auto' }}>
                    <option value="tasks_done">Ordenar: Tarefas concluídas</option>
                    <option value="total_seconds">Ordenar: Tempo trabalhado</option>
                    <option value="clients_served">Ordenar: Clientes atendidos</option>
                </select>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
                <SummaryCard icon={CheckCircle2} color="#10b981" label="Tarefas concluídas" value={totalDone} />
                <SummaryCard icon={Clock} color="#6366f1" label="Tempo total trabalhado" value={fmtSeconds(totalSeconds)} />
                <SummaryCard icon={Building2} color="#f59e0b" label="Membros no período" value={filtered.length} />
            </div>

            {/* Team ranking */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 14 }}>Carregando...</div>
            ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <Users size={40} color="var(--text-muted)" style={{ opacity: 0.3, marginBottom: 12 }} />
                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhum dado no período</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, opacity: 0.7 }}>As tarefas precisam ter tempo registrado para aparecer aqui</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filtered.map((member, rank) => (
                        <MemberCard key={member.user_id} member={member} rank={rank + 1} sortBy={sortBy} maxDone={filtered[0]?.tasks_done || 1} maxSeconds={filtered[0]?.total_seconds || 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, color, label, value }: { icon: any; color: string; label: string; value: number | string }) {
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={20} color={color} />
            </div>
            <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
            </div>
        </div>
    );
}

// ─── Member Card ───────────────────────────────────────────────────────────

function MemberCard({ member, rank, sortBy, maxDone, maxSeconds }: {
    member: MemberStats;
    rank: number;
    sortBy: string;
    maxDone: number;
    maxSeconds: number;
}) {
    const completionPct = member.tasks_total > 0
        ? Math.round((member.tasks_done / member.tasks_total) * 100)
        : 0;
    const barWidthDone = maxDone > 0 ? (member.tasks_done / maxDone) * 100 : 0;
    const barWidthTime = maxSeconds > 0 ? (member.total_seconds / maxSeconds) * 100 : 0;

    const rankColors = ['#f59e0b', '#94a3b8', '#cd7c2f'];
    const rankColor = rank <= 3 ? rankColors[rank - 1] : 'var(--text-muted)';

    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                {/* Rank */}
                <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: rankColor, background: `${rankColor}18`, flexShrink: 0 }}>
                    {rank}
                </div>

                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: member.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {getInitials(member.name)}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                        {member.job_title && <span>{member.job_title}</span>}
                        {member.department && (
                            <span style={{ padding: '1px 8px', borderRadius: 20, background: 'rgba(16,185,129,.1)', color: '#10b981', fontWeight: 600, fontSize: 11 }}>
                                {member.department}
                            </span>
                        )}
                    </div>
                </div>

                {/* Key stats */}
                <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                    <Stat label="Concluídas" value={member.tasks_done} color="#10b981" icon={CheckCircle2} />
                    <Stat label="Tempo" value={fmtSeconds(member.total_seconds)} color="#6366f1" icon={Clock} />
                    <Stat label="Clientes" value={member.clients_served} color="#f59e0b" icon={Building2} />
                    <Stat label="Conclusão" value={`${completionPct}%`} color="#3b82f6" icon={TrendingUp} />
                </div>
            </div>

            {/* Progress bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Tarefas concluídas</span>
                        <span>{member.tasks_done} / {member.tasks_total}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${barWidthDone}%`, background: '#10b981', borderRadius: 3, transition: 'width .4s ease' }} />
                    </div>
                </div>

                {member.total_seconds > 0 && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                            <span>Tempo registrado</span>
                            <span>{fmtSeconds(member.total_seconds)}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barWidthTime}%`, background: '#6366f1', borderRadius: 3, transition: 'width .4s ease' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Task breakdown by type */}
            {Object.keys(member.by_type).length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {Object.entries(member.by_type).map(([type, data]) => (
                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: `${TASK_COLORS[type] || '#6366f1'}14`, border: `1px solid ${TASK_COLORS[type] || '#6366f1'}30`, fontSize: 12, fontWeight: 500, color: TASK_COLORS[type] || '#6366f1' }}>
                            <Zap size={10} />
                            {TASK_LABELS[type] || type}: {data.count}
                            {data.total_seconds > 0 && <span style={{ opacity: 0.7, marginLeft: 2 }}>({fmtSeconds(data.total_seconds)})</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Stat mini ─────────────────────────────────────────────────────────────

function Stat({ label, value, color, icon: Icon }: { label: string; value: string | number; color: string; icon: any }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                <Icon size={14} color={color} />{value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
        </div>
    );
}
