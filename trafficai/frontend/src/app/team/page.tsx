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

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

const DEFAULT_FORM: MemberForm = {
    name: '',
    email: '',
    password: '',
    role: 'member',
    department: '',
    job_title: '',
    avatar_color: '#6366f1',
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

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1>Time</h1>
                    <p>Produtividade, tarefas e tempo trabalhado · {rangeLabel.toLowerCase()}</p>
                </div>
                <div className="page-header-actions">
                    {isAdmin && (
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus size={14} /> Adicionar membro
                        </button>
                    )}
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

            {/* Hint quando só tem admin sem outros membros */}
            {!loading && filtered.length <= 1 && isAdmin && (
                <div
                    style={{
                        padding: '14px 18px',
                        background: 'var(--primary-soft)',
                        border: '1px solid rgba(99, 102, 241, 0.22)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                    }}
                >
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                            Você ainda é o único no time
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            Adicione seus gestores e analistas para acompanhar a produtividade de cada um.
                        </div>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowCreate(true)}
                    >
                        <Plus size={14} /> Adicionar membro
                    </button>
                </div>
            )}

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
                        <h3>Nenhum membro no período</h3>
                        <p>Adicione pessoas ao time para começar a acompanhar.</p>
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

            {/* Detail modal */}
            {detail && (
                <MemberDetailModal
                    stats={detail}
                    rangeLabel={rangeLabel}
                    onClose={() => setDetail(null)}
                    canEdit={isAdmin}
                    onEdit={() => {
                        const record = memberIndex[detail.user_id];
                        if (record) {
                            setEditing(record);
                            setDetail(null);
                        }
                    }}
                />
            )}

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
                avatar_color: member.avatar_color || '#6366f1',
            };
        }
        return DEFAULT_FORM;
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

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
                });
            } else if (member) {
                const payload: any = {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    role: form.role,
                    department: form.department.trim(),
                    job_title: form.job_title.trim(),
                    avatar_color: form.avatar_color,
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
