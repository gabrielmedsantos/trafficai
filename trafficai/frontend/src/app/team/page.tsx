'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, Clock, CheckCircle2, TrendingUp,
    ChevronLeft, ChevronRight, Building2, X,
    ArrowUpRight,
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
    const [detail, setDetail] = useState<MemberStats | null>(null);

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
        .sort((a, b) => (b as any)[sortBy] - (a as any)[sortBy]);

    const totalDone = filtered.reduce((s, m) => s + m.tasks_done, 0);
    const totalSeconds = filtered.reduce((s, m) => s + m.total_seconds, 0);
    const totalPending = filtered.reduce((s, m) => s + m.tasks_pending, 0);
    const completionPct = filtered.reduce((s, m) => s + m.tasks_total, 0) > 0
        ? Math.round((totalDone / filtered.reduce((s, m) => s + m.tasks_total, 0)) * 100)
        : 0;

    const rangeLabel = rangeMode === 'week'
        ? `${fmtDateBR(toISO(weekStart))} – ${fmtDateBR(toISO(addDays(weekStart, 6)))}`
        : rangeMode === 'month'
        ? new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : `${fmtDateBR(customSince)} – ${fmtDateBR(customUntil)}`;

    const maxDone = filtered[0]?.tasks_done || 1;

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Time</h1>
                    <p>Produtividade, tarefas e tempo trabalhado · {rangeLabel.toLowerCase()}</p>
                </div>
            </div>

            {/* Filter bar */}
            <div className="team-filters">
                <div className="segment-control">
                    {(['week', 'month', 'custom'] as RangeMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setRangeMode(m)}
                            className={rangeMode === m ? 'active' : ''}
                            type="button"
                        >
                            {m === 'week' ? 'Semana' : m === 'month' ? 'Mês' : 'Período'}
                        </button>
                    ))}
                </div>

                {rangeMode === 'week' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-icon btn-sm"
                            onClick={() => setWeekStart(d => addDays(d, -7))}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', minWidth: 170, textAlign: 'center' }}>
                            {rangeLabel}
                        </span>
                        <button
                            type="button"
                            className="btn btn-secondary btn-icon btn-sm"
                            onClick={() => setWeekStart(d => addDays(d, 7))}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}

                {rangeMode === 'custom' && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <input
                            type="date"
                            value={customSince}
                            onChange={e => setCustomSince(e.target.value)}
                            className="form-input"
                            style={{ minHeight: 32, padding: '6px 10px', fontSize: 12.5, width: 150 }}
                        />
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>até</span>
                        <input
                            type="date"
                            value={customUntil}
                            onChange={e => setCustomUntil(e.target.value)}
                            className="form-input"
                            style={{ minHeight: 32, padding: '6px 10px', fontSize: 12.5, width: 150 }}
                        />
                    </div>
                )}

                <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                    {departments.length > 1 && (
                        <select
                            value={selectedDept}
                            onChange={e => setSelectedDept(e.target.value)}
                            className="form-select"
                            style={{ minHeight: 32, padding: '6px 10px', fontSize: 12.5, width: 160 }}
                        >
                            <option value="">Todas as áreas</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    )}

                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as any)}
                        className="form-select"
                        style={{ minHeight: 32, padding: '6px 10px', fontSize: 12.5, width: 200 }}
                    >
                        <option value="tasks_done">Tarefas concluídas</option>
                        <option value="total_seconds">Tempo trabalhado</option>
                        <option value="clients_served">Clientes atendidos</option>
                    </select>
                </div>
            </div>

            {/* Summary cards */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <SummaryCard label="Membros ativos" value={filtered.length} />
                <SummaryCard label="Tarefas concluídas" value={totalDone} />
                <SummaryCard label="Tarefas pendentes" value={totalPending} />
                <SummaryCard label="Tempo total" value={fmtSeconds(totalSeconds)} />
                <SummaryCard label="Taxa de conclusão" value={`${completionPct}%`} />
            </div>

            {/* Team table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="section-header" style={{ padding: '16px 20px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
                    <span className="section-title">Ranking do time</span>
                    <span className="section-subtitle">Clique em um membro para ver o detalhamento</span>
                </div>

                {loading ? (
                    <div className="loading-spinner"><div className="spinner" /></div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon"><Users size={20} /></div>
                        <h3>Nenhum dado no período</h3>
                        <p>As tarefas precisam ter tempo registrado para aparecer aqui.</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 48 }}>#</th>
                                <th>Membro</th>
                                <th>Área</th>
                                <th className="num">Concluídas</th>
                                <th className="num">Pendentes</th>
                                <th className="num">Tempo</th>
                                <th className="num">Clientes</th>
                                <th style={{ width: 140 }}>Desempenho</th>
                                <th style={{ width: 32 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((member, i) => {
                                const pct = member.tasks_total > 0
                                    ? Math.round((member.tasks_done / member.tasks_total) * 100)
                                    : 0;
                                const barWidth = (member.tasks_done / maxDone) * 100;
                                return (
                                    <tr key={member.user_id} onClick={() => setDetail(member)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <span style={{ fontSize: 12.5, fontWeight: 500, color: i < 3 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                                {i + 1}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Avatar color={member.avatar_color} initials={getInitials(member.name)} size={28} />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }} className="truncate">
                                                        {member.name}
                                                    </div>
                                                    {member.job_title && (
                                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                                            {member.job_title}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            {member.department ? (
                                                <span className="badge badge-gray">{member.department}</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                                            )}
                                        </td>
                                        <td className="num" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                            {member.tasks_done}
                                        </td>
                                        <td className="num">{member.tasks_pending}</td>
                                        <td className="num">{fmtSeconds(member.total_seconds)}</td>
                                        <td className="num">{member.clients_served}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${barWidth}%`,
                                                        background: 'var(--primary)',
                                                        borderRadius: 2,
                                                        transition: 'width 300ms ease',
                                                    }} />
                                                </div>
                                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 34, textAlign: 'right' }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Member detail modal */}
            {detail && <MemberDetailModal member={detail} onClose={() => setDetail(null)} rangeLabel={rangeLabel} />}

            <style jsx>{`
                .team-filters {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                }
                .segment-control {
                    display: inline-flex;
                    background: var(--bg-surface);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                    padding: 3px;
                    gap: 2px;
                }
                .segment-control button {
                    padding: 5px 12px;
                    border-radius: 4px;
                    border: none;
                    background: transparent;
                    color: var(--text-muted);
                    font-size: 12.5px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: var(--transition);
                }
                .segment-control button:hover {
                    color: var(--text-primary);
                }
                .segment-control button.active {
                    background: var(--bg-surface-2);
                    color: var(--text-primary);
                    box-shadow: var(--shadow-xs);
                }
            `}</style>
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

// ─── Summary Card ──────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number | string }) {
    return (
        <div className="card stat-card">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
        </div>
    );
}

// ─── Member Detail Modal ───────────────────────────────────────────────────

function MemberDetailModal({ member, onClose, rangeLabel }: { member: MemberStats; onClose: () => void; rangeLabel: string }) {
    const completionPct = member.tasks_total > 0
        ? Math.round((member.tasks_done / member.tasks_total) * 100)
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
                        <Avatar color={member.avatar_color} initials={getInitials(member.name)} size={44} />
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                                {member.name}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {member.job_title || 'Sem cargo'}
                                {member.department && (
                                    <>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{member.department}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} type="button">
                        <X size={16} />
                    </button>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    {member.email}
                </div>

                {/* Mini stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                    <MiniStat icon={CheckCircle2} label="Concluídas" value={member.tasks_done} />
                    <MiniStat icon={Clock} label="Tempo" value={fmtSeconds(member.total_seconds)} />
                    <MiniStat icon={Building2} label="Clientes" value={member.clients_served} />
                    <MiniStat icon={TrendingUp} label="Conclusão" value={`${completionPct}%`} />
                </div>

                {/* Task breakdown */}
                <div style={{ marginBottom: 6 }}>
                    <div className="section-title" style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                        Tarefas ({rangeLabel})
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <ProgressRow label="Concluídas" value={member.tasks_done} max={member.tasks_total} color="var(--accent-green)" />
                        <ProgressRow label="Pendentes" value={member.tasks_pending} max={member.tasks_total} color="var(--accent-yellow)" />
                        <ProgressRow label="Puladas" value={member.tasks_skipped} max={member.tasks_total} color="var(--text-muted)" />
                    </div>
                </div>

                {/* Breakdown by type */}
                {Object.keys(member.by_type).length > 0 && (
                    <div style={{ marginTop: 20 }}>
                        <div className="section-title" style={{ marginBottom: 10, fontSize: 12.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
                            Por tipo
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {Object.entries(member.by_type).map(([type, data]) => (
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

                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
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
