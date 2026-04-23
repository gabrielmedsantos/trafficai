'use client';

import { useEffect, useState, useCallback } from 'react';
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    Minus,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    X,
    BarChart3,
    FileText,
    MessageCircle,
    Loader2,
    Calendar,
    Users,
    History,
    ChevronDown,
    ChevronUp,
    Zap,
    Check,
    CalendarDays,
    Circle,
    Flag,
    KanbanSquare,
    AlertTriangle,
} from 'lucide-react';

// ─── Config ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Task {
    id: string;
    client_id: string;
    client_name: string;
    client_company: string | null;
    avatar_color: string;
    type: 'analysis' | 'report' | 'checkin_wed' | 'checkin_fri';
    scheduled_date: string;
    status: 'pending' | 'done' | 'skipped';
    campaign_changes: string | null;
    report_sent: boolean;
    report_data: string | null;
    message_text: string | null;
    message_sent: boolean;
    notes: string | null;
    completed_at: string | null;
    timer_started_at: string | null;
    time_spent_seconds: number;
}

interface TaskForm {
    status: string;
    campaign_changes: string;
    report_sent: boolean;
    report_data: string;
    message_text: string;
    message_sent: boolean;
    notes: string;
}

interface ClientInfo {
    id: string;
    name: string;
    avatar_color: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const TASK_CONFIG = {
    analysis: {
        label: 'Análise de Campanha',
        color: '#8b5cf6',
        bg: 'rgba(139,92,246,.12)',
        description: 'Analisar e otimizar campanhas',
        interval: '7 dias',
        icon: BarChart3,
        duration_minutes: 10,
        default_time: '09:00',
    },
    report: {
        label: 'Relatório Semanal',
        color: '#3b82f6',
        bg: 'rgba(59,130,246,.12)',
        description: 'Segunda-feira — enviar relatório',
        interval: 'Toda segunda',
        icon: FileText,
        duration_minutes: 10,
        default_time: '08:30',
    },
    checkin_wed: {
        label: 'Check-in Quarta',
        color: '#f59e0b',
        bg: 'rgba(245,158,11,.12)',
        description: 'Quarta-feira — mensagem ao cliente',
        interval: 'Toda quarta',
        icon: MessageCircle,
        duration_minutes: 10,
        default_time: '10:00',
    },
    checkin_fri: {
        label: 'Check-in Sexta',
        color: '#10b981',
        bg: 'rgba(16,185,129,.12)',
        description: 'Sexta-feira — mensagem fim de semana',
        interval: 'Toda sexta',
        icon: MessageCircle,
        duration_minutes: 10,
        default_time: '10:00',
    },
} as const;

const DEFAULT_MESSAGES = {
    checkin_wed: (name: string) =>
        `Oi ${name}! Tudo bem? 😊 Passando para saber como estão as campanhas. Tem alguma dúvida ou algo que gostaria de ajustar? Estou à disposição!`,
    checkin_fri: (name: string) =>
        `Oi ${name}! Fechando mais uma semana! 🚀 As campanhas estão seguindo bem. Qualquer dúvida só chamar. Bom fim de semana!`,
};

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── Helpers ───────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d);
    mon.setDate(diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function toISO(d: Date): string {
    return d.toISOString().split('T')[0];
}

function formatDateLabel(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')} – ${String(addDays(d, 6).getDate()).padStart(2, '0')} ${MONTH_LABELS[addDays(d, 6).getMonth()]} ${addDays(d, 6).getFullYear()}`;
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}

function formatCompletedDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatScheduledDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

// ─── API helpers ───────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
            ...(opts?.headers || {}),
        },
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Erro desconhecido');
    return json.data;
}

// ─── Avatar Component ──────────────────────────────────────────────────────

function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: '50%',
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: size * 0.35,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
                letterSpacing: '-0.5px',
            }}
        >
            {getInitials(name)}
        </div>
    );
}

// ─── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Task['status'] }) {
    if (status === 'done') {
        return (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: 'rgba(16,185,129,.15)',
                    color: '#10b981',
                    fontSize: 11,
                    fontWeight: 600,
                }}
            >
                <CheckCircle2 size={10} />
                Concluída
            </span>
        );
    }
    if (status === 'skipped') {
        return (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: 'rgba(156,163,175,.12)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                }}
            >
                <Minus size={10} />
                Pulada
            </span>
        );
    }
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(245,158,11,.12)',
                color: '#f59e0b',
                fontSize: 11,
                fontWeight: 600,
            }}
        >
            <Clock size={10} />
            Pendente
        </span>
    );
}

// ─── Timer display ──────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ─── Task Card ─────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onTimerToggle }: { task: Task; onClick: () => void; onTimerToggle: (task: Task) => void }) {
    const cfg = TASK_CONFIG[task.type];
    const Icon = cfg.icon;
    const isDone = task.status === 'done';
    const isSkipped = task.status === 'skipped';
    const opacity = isDone ? 0.6 : isSkipped ? 0.4 : 1;
    const clickable = task.status === 'pending';
    const isRunning = !!task.timer_started_at;

    // Live elapsed time
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!isRunning) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [isRunning]);

    const elapsed = isRunning
        ? Math.floor((now - new Date(task.timer_started_at!).getTime()) / 1000)
        : 0;
    const totalDisplay = (task.time_spent_seconds || 0) + elapsed;

    return (
        <div
            onClick={clickable ? onClick : undefined}
            style={{
                background: isRunning ? 'rgba(34,197,94,.04)' : 'var(--bg-card)',
                border: isRunning ? `1px solid rgba(34,197,94,.35)` : `1px solid var(--border)`,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: clickable ? 'pointer' : 'default',
                opacity,
                transition: 'all .15s',
                marginBottom: 8,
                borderLeft: `3px solid ${isRunning ? '#22c55e' : cfg.color}`,
            }}
            onMouseEnter={(e) => {
                if (clickable && !isRunning) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-overlay)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color;
                }
            }}
            onMouseLeave={(e) => {
                if (clickable && !isRunning) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                    (e.currentTarget as HTMLDivElement).style.borderLeftColor = cfg.color;
                }
            }}
        >
            {/* Type row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={11} color={cfg.color} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, flex: 1, lineHeight: 1.2 }}>
                    {cfg.label}
                </span>
            </div>

            {/* Client row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <Avatar name={task.client_company || task.client_name} color={task.avatar_color} size={22} />
                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.client_company || task.client_name}
                </span>
            </div>

            {/* Bottom row: status + timer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <StatusBadge status={task.status} />

                {/* Timer — apenas tarefas pending */}
                {task.status === 'pending' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {totalDisplay > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: isRunning ? '#22c55e' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.5px' }}>
                                {fmtSeconds(totalDisplay)}
                            </span>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); onTimerToggle(task); }}
                            title={isRunning ? 'Parar cronômetro' : 'Iniciar cronômetro'}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6, border: `1px solid ${isRunning ? 'rgba(34,197,94,.4)' : 'var(--border)'}`, background: isRunning ? 'rgba(34,197,94,.12)' : 'var(--bg-secondary)', cursor: 'pointer', color: isRunning ? '#22c55e' : 'var(--text-muted)', transition: 'all .15s', flexShrink: 0 }}
                        >
                            {isRunning
                                ? <Minus size={11} />
                                : <Clock size={11} />
                            }
                        </button>
                    </div>
                )}

                {/* Tempo gasto em tarefas concluídas */}
                {task.status === 'done' && task.time_spent_seconds > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        ⏱ {fmtSeconds(task.time_spent_seconds)}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── History Row ───────────────────────────────────────────────────────────

function HistoryRow({ task }: { task: Task }) {
    const [expanded, setExpanded] = useState(false);
    const cfg = TASK_CONFIG[task.type];
    const Icon = cfg.icon;

    const hasDetails =
        task.campaign_changes || task.report_data || task.message_text || task.notes;

    return (
        <div
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                marginBottom: 8,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    cursor: hasDetails ? 'pointer' : 'default',
                }}
                onClick={() => hasDetails && setExpanded(!expanded)}
            >
                {/* Date */}
                <div style={{ width: 68, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                        {formatScheduledDate(task.scheduled_date)}
                    </span>
                </div>

                {/* Client */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 160, flexShrink: 0 }}>
                    <Avatar name={task.client_company || task.client_name} color={task.avatar_color} size={26} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.client_company || task.client_name}
                    </span>
                </div>

                {/* Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    <div
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            background: cfg.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Icon size={12} color={cfg.color} />
                    </div>
                    <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                </div>

                {/* Status */}
                <div style={{ flexShrink: 0 }}>
                    <StatusBadge status={task.status} />
                </div>

                {/* Completed at */}
                <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {formatCompletedDate(task.completed_at)}
                    </span>
                </div>

                {/* Expand toggle */}
                {hasDetails && (
                    <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                )}
            </div>

            {/* Expanded details */}
            {expanded && hasDetails && (
                <div
                    style={{
                        borderTop: '1px solid var(--border)',
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {task.campaign_changes && (
                        <DetailItem label="Alterações" value={task.campaign_changes} />
                    )}
                    {task.report_data && (
                        <DetailItem label="Dados do relatório" value={task.report_data} />
                    )}
                    {task.message_text && (
                        <DetailItem label="Mensagem enviada" value={task.message_text} />
                    )}
                    {task.notes && (
                        <DetailItem label="Observações" value={task.notes} />
                    )}
                    {task.report_sent && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={13} color="#10b981" />
                            <span style={{ fontSize: 12, color: '#10b981' }}>Relatório enviado</span>
                        </div>
                    )}
                    {task.message_sent && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle2 size={13} color="#10b981" />
                            <span style={{ fontSize: 12, color: '#10b981' }}>Mensagem enviada</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function fmtEventTime(iso: string) {
    try {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch { return ''; }
}

function CalendarEventChip({ event, log, onClick }: { event: any; log?: any; onClick: () => void }) {
    const isDone = !!log?.completed_at;
    const color = isDone ? '#10b981' : '#3b82f6';
    const title = event.summary || event.title || 'Evento';
    const startStr = event.start?.dateTime || event.start?.date || event.start || '';
    const endStr = event.end?.dateTime || event.end?.date || event.end || '';
    const isAllDay = !event.start?.dateTime;
    const timeLabel = isAllDay ? 'dia todo' : `${fmtEventTime(startStr)}${endStr ? ` – ${fmtEventTime(endStr)}` : ''}`;

    return (
        <div
            onClick={onClick}
            style={{
                background: isDone ? 'rgba(16,185,129,.08)' : 'rgba(59,130,246,.08)',
                border: `1px solid ${isDone ? 'rgba(16,185,129,.2)' : 'rgba(59,130,246,.2)'}`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 8,
                padding: '7px 10px',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7,
                cursor: 'pointer',
                transition: 'background .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = isDone ? 'rgba(16,185,129,.14)' : 'rgba(59,130,246,.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = isDone ? 'rgba(16,185,129,.08)' : 'rgba(59,130,246,.08)')}
        >
            {isDone
                ? <CheckCircle2 size={13} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
                : <CalendarDays size={13} color={color} style={{ marginTop: 1, flexShrink: 0 }} />
            }
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.7 : 1 }}>
                    {title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {timeLabel}
                    {log?.summary && <span style={{ marginLeft: 6, color: '#10b981' }}>· resumo salvo</span>}
                </div>
            </div>
        </div>
    );
}

function BoardCardChip({ card, onToggle, overdue }: {
    card: any;
    onToggle: () => void;
    overdue?: boolean;
}) {
    const isDone = card.status === 'done';
    const checklist = Array.isArray(card.checklist) ? card.checklist : [];
    const doneCount = checklist.filter((i: any) => i.done).length;
    const borderColor = isDone
        ? '#10b981'
        : overdue ? '#ef4444'
        : card.priority === 'high' ? '#ef4444'
        : '#a855f7';
    const bgColor = isDone
        ? 'rgba(16,185,129,.06)'
        : overdue ? 'rgba(239,68,68,.08)'
        : 'rgba(168,85,247,.06)';
    const hoverColor = isDone
        ? 'rgba(16,185,129,.12)'
        : overdue ? 'rgba(239,68,68,.14)'
        : 'rgba(168,85,247,.12)';

    return (
        <div
            style={{
                background: bgColor,
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${borderColor}`,
                borderRadius: 8,
                padding: '7px 10px',
                marginBottom: 6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                transition: 'background .15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = hoverColor)}
            onMouseLeave={e => (e.currentTarget.style.background = bgColor)}
        >
            <button
                type="button"
                onClick={onToggle}
                title={isDone ? 'Marcar como pendente' : 'Marcar como concluído'}
                style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    color: isDone ? '#10b981' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', marginTop: 1, flexShrink: 0,
                }}
            >
                {isDone ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: isDone ? '#10b981' : 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textDecoration: isDone ? 'line-through' : 'none',
                    opacity: isDone ? 0.65 : 1,
                }}>
                    {card.title}
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2,
                    flexWrap: 'wrap',
                }}>
                    {card.client_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span style={{
                                width: 7, height: 7, borderRadius: 4,
                                background: card.client_avatar_color || '#6366f1',
                                display: 'inline-block',
                            }} />
                            {card.client_name}
                        </span>
                    )}
                    {!card.client_name && (
                        <span style={{ fontStyle: 'italic' }}>Geral</span>
                    )}
                    {overdue && (
                        <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <AlertTriangle size={9} /> atrasado
                        </span>
                    )}
                    {card.priority === 'high' && !overdue && (
                        <span style={{ color: '#ef4444', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <Flag size={9} /> alta
                        </span>
                    )}
                    {checklist.length > 0 && (
                        <span>{doneCount}/{checklist.length}</span>
                    )}
                </div>
            </div>
        </div>
    );
}

function MeetingModal({ event, log, onClose, onSave }: {
    event: any;
    log?: any;
    onClose: () => void;
    onSave: (summary: string, completed: boolean) => Promise<void>;
}) {
    const title = event.summary || event.title || 'Evento';
    const startStr = event.start?.dateTime || event.start?.date || event.start || '';
    const isAllDay = !event.start?.dateTime;
    const timeLabel = isAllDay ? 'dia todo' : fmtEventTime(startStr);
    const [summary, setSummary] = useState(log?.summary || '');
    const [completed, setCompleted] = useState(!!log?.completed_at);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try { await onSave(summary, completed); onClose(); }
        finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(59,130,246,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <CalendarDays size={16} color="#3b82f6" />
                        </div>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{timeLabel}</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: 'var(--bg-overlay)', borderRadius: 10, border: `1px solid ${completed ? '#10b981' : 'var(--border)'}`, transition: 'all .15s' }}>
                        <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Reunião realizada</span>
                        {completed && <CheckCircle2 size={15} color="#10b981" style={{ marginLeft: 'auto' }} />}
                    </label>

                    <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                            Resumo da reunião
                        </label>
                        <textarea
                            value={summary}
                            onChange={e => setSummary(e.target.value)}
                            placeholder="O que foi discutido? Decisões, próximos passos..."
                            rows={4}
                            style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const }}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(16,185,129,.4)' : '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Salvando…</> : <><Check size={14} /> Salvar</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                {label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {value}
            </div>
        </div>
    );
}

// ─── Completion Modal ──────────────────────────────────────────────────────

function CompletionModal({
    task,
    form,
    saving,
    onClose,
    onFormChange,
    onSave,
    onSkip,
}: {
    task: Task;
    form: TaskForm;
    saving: boolean;
    onClose: () => void;
    onFormChange: (update: Partial<TaskForm>) => void;
    onSave: () => void;
    onSkip: () => void;
}) {
    const cfg = TASK_CONFIG[task.type];
    const Icon = cfg.icon;
    const [year, month, day] = task.scheduled_date.split('-');
    const dateLabel = `${day}/${month}/${year}`;

    const textareaStyle = {
        width: '100%',
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        color: 'var(--text)',
        fontSize: 13,
        lineHeight: 1.5,
        resize: 'vertical' as const,
        fontFamily: 'inherit',
        outline: 'none',
        boxSizing: 'border-box' as const,
        minHeight: 80,
    };

    const labelStyle = {
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-muted)',
        marginBottom: 6,
        display: 'block',
        textTransform: 'uppercase' as const,
        letterSpacing: '.4px',
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.6)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 520,
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-md)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '20px 24px 0',
                        borderBottom: '1px solid var(--border)',
                        paddingBottom: 16,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div
                                style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 10,
                                    background: cfg.bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Icon size={16} color={cfg.color} />
                            </div>
                            <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                                    Concluir: {cfg.label}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dateLabel}</div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                padding: 4,
                                borderRadius: 6,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Client info */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            background: 'var(--bg-overlay)',
                            borderRadius: 10,
                        }}
                    >
                        <Avatar name={task.client_company || task.client_name} color={task.avatar_color} size={34} />
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{task.client_company || task.client_name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cfg.description}</div>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* ANALYSIS fields */}
                    {task.type === 'analysis' && (
                        <>
                            <div>
                                <label style={labelStyle}>Alterações Realizadas</label>
                                <textarea
                                    style={{ ...textareaStyle, minHeight: 100 }}
                                    placeholder="Descreva as otimizações e alterações feitas nas campanhas..."
                                    value={form.campaign_changes}
                                    onChange={(e) => onFormChange({ campaign_changes: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Observações</label>
                                <textarea
                                    style={textareaStyle}
                                    placeholder="Observações adicionais..."
                                    value={form.notes}
                                    onChange={(e) => onFormChange({ notes: e.target.value })}
                                />
                            </div>
                        </>
                    )}

                    {/* REPORT fields */}
                    {task.type === 'report' && (
                        <>
                            <div>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        cursor: 'pointer',
                                        padding: '12px 14px',
                                        background: 'var(--bg-overlay)',
                                        borderRadius: 10,
                                        border: `1px solid ${form.report_sent ? '#10b981' : 'var(--border)'}`,
                                        transition: 'all .15s',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.report_sent}
                                        onChange={(e) => onFormChange({ report_sent: e.target.checked })}
                                        style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                                        Relatório enviado ao cliente
                                    </span>
                                    {form.report_sent && <CheckCircle2 size={15} color="#10b981" style={{ marginLeft: 'auto' }} />}
                                </label>
                            </div>
                            <div>
                                <label style={labelStyle}>Dados do Relatório (resultados, métricas)</label>
                                <textarea
                                    style={{ ...textareaStyle, minHeight: 100 }}
                                    placeholder="Ex: CTR 3.2%, CPC R$1.20, ROAS 4.5x, 125 conversões..."
                                    value={form.report_data}
                                    onChange={(e) => onFormChange({ report_data: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={labelStyle}>Observações</label>
                                <textarea
                                    style={textareaStyle}
                                    placeholder="Observações adicionais..."
                                    value={form.notes}
                                    onChange={(e) => onFormChange({ notes: e.target.value })}
                                />
                            </div>
                        </>
                    )}

                    {/* CHECKIN fields */}
                    {(task.type === 'checkin_wed' || task.type === 'checkin_fri') && (
                        <>
                            <div>
                                <label style={labelStyle}>Mensagem para o Cliente</label>
                                <textarea
                                    style={{ ...textareaStyle, minHeight: 110 }}
                                    value={form.message_text}
                                    onChange={(e) => onFormChange({ message_text: e.target.value })}
                                    placeholder="Mensagem que será enviada ao cliente..."
                                />
                            </div>
                            <div>
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        cursor: 'pointer',
                                        padding: '12px 14px',
                                        background: 'var(--bg-overlay)',
                                        borderRadius: 10,
                                        border: `1px solid ${form.message_sent ? '#10b981' : 'var(--border)'}`,
                                        transition: 'all .15s',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.message_sent}
                                        onChange={(e) => onFormChange({ message_sent: e.target.checked })}
                                        style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }}
                                    />
                                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                                        Mensagem enviada
                                    </span>
                                    {form.message_sent && <CheckCircle2 size={15} color="#10b981" style={{ marginLeft: 'auto' }} />}
                                </label>
                            </div>
                            <div>
                                <label style={labelStyle}>Observações</label>
                                <textarea
                                    style={textareaStyle}
                                    placeholder="Observações adicionais..."
                                    value={form.notes}
                                    onChange={(e) => onFormChange({ notes: e.target.value })}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '16px 24px',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'flex-end',
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSkip}
                        disabled={saving}
                        style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'rgba(156,163,175,.1)',
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        Pular
                    </button>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        style={{
                            padding: '9px 20px',
                            borderRadius: 8,
                            border: 'none',
                            background: saving ? 'rgba(16,185,129,.4)' : '#10b981',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        {saving ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Check size={14} />
                                Concluir
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Generate Confirm Modal ─────────────────────────────────────────────────

function GenerateConfirmModal({
    weekLabel,
    generating,
    onConfirm,
    onClose,
}: {
    weekLabel: string;
    generating: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.6)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
            onClick={(e) => e.target === e.currentTarget && !generating && onClose()}
        >
            <div
                style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    width: '100%',
                    maxWidth: 400,
                    padding: 28,
                    boxShadow: 'var(--shadow-md)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: 'rgba(99,102,241,.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Zap size={20} color="#6366f1" />
                    </div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Regerar Semana</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Semana: {weekLabel}</div>
                    </div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 20px' }}>
                    Força a geração das tarefas desta semana para todos os clientes ativos. Tarefas já existentes não serão duplicadas. As tarefas da semana atual são geradas automaticamente.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={generating}
                        style={{
                            padding: '9px 18px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            fontSize: 13,
                            cursor: generating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={generating}
                        style={{
                            padding: '9px 20px',
                            borderRadius: 8,
                            border: 'none',
                            background: generating ? 'rgba(99,102,241,.4)' : '#6366f1',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: generating ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Gerando...
                            </>
                        ) : (
                            <>
                                <Zap size={14} />
                                Gerar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default function OtimizacoesPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
    const [activeTab, setActiveTab] = useState<'agenda' | 'history'>('agenda');
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [taskForm, setTaskForm] = useState<TaskForm>({
        status: '',
        campaign_changes: '',
        report_sent: false,
        report_data: '',
        message_text: '',
        message_sent: false,
        notes: '',
    });
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState<Task[]>([]);
    const [historyClientFilter, setHistoryClientFilter] = useState('');
    const [clients, setClients] = useState<ClientInfo[]>([]);
    const [generating, setGenerating] = useState(false);
    const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
    const [summary, setSummary] = useState({ pending: 0, done: 0, total: 0, clients_pending: 0 });
    const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
    const [meetingLogs, setMeetingLogs] = useState<any[]>([]);
    const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
    const [boardCards, setBoardCards] = useState<any[]>([]);

    // Derived
    const weekSunday = addDays(weekStart, 6);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const weekLabel = formatDateLabel(weekStart);
    const todayStr = toISO(new Date());

    // ─── Data fetchers ────────────────────────────────────────────────────

    const fetchTasks = useCallback(async () => {
        setLoading(true);
        try {
            const weekSince = toISO(weekStart);
            const weekUntil = toISO(addDays(weekStart, 6));
            const data = await apiFetch(`/tasks?since=${weekSince}&until=${weekUntil}`);
            const taskList = Array.isArray(data) ? data : [];
            setTasks(taskList);

            // Auto-generate for current week if empty (no manual action needed)
            const currentWeekMonday = toISO(getMonday(new Date()));
            if (taskList.length === 0 && weekSince === currentWeekMonday) {
                try {
                    await apiFetch('/tasks/generate', {
                        method: 'POST',
                        body: JSON.stringify({ since: weekSince, until: weekUntil }),
                    });
                    const data2 = await apiFetch(`/tasks?since=${weekSince}&until=${weekUntil}`);
                    setTasks(Array.isArray(data2) ? data2 : []);
                } catch { /* silently skip if auto-gen fails */ }
            }
        } catch {
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [weekStart]);

    const fetchSummary = useCallback(async () => {
        try {
            const data = await apiFetch('/tasks/summary');
            setSummary(data);
        } catch { /* ignore */ }
    }, []);

    const fetchHistory = useCallback(async () => {
        try {
            const qs = historyClientFilter ? `?client_id=${historyClientFilter}&limit=100` : '?limit=100';
            const data = await apiFetch(`/tasks/history${qs}`);
            setHistory(Array.isArray(data) ? data : []);
        } catch {
            setHistory([]);
        }
    }, [historyClientFilter]);

    const fetchClients = useCallback(async () => {
        try {
            const data = await apiFetch('/clients?status=ativo');
            setClients(Array.isArray(data) ? data : []);
        } catch {
            setClients([]);
        }
    }, []);

    // ─── Effects ──────────────────────────────────────────────────────────

    useEffect(() => {
        fetchTasks();
        fetchSummary();
    }, [fetchTasks, fetchSummary]);

    useEffect(() => {
        const fetchCalendar = async () => {
            try {
                const since = toISO(weekStart);
                const until = toISO(addDays(weekStart, 6));
                const [status, logs] = await Promise.all([
                    apiFetch('/routine/google/status').catch(() => null),
                    apiFetch(`/routine/meeting-logs?since=${since}&until=${until}`).catch(() => []),
                ]);
                setMeetingLogs(Array.isArray(logs) ? logs : []);
                if (!status?.connected) return;
                const events = await apiFetch(`/routine/google/events?start=${since}&end=${until}`);
                setCalendarEvents(Array.isArray(events) ? events : []);
            } catch { setCalendarEvents([]); }
        };
        fetchCalendar();
    }, [weekStart]);

    // Board cards da semana
    const fetchBoardCards = useCallback(async () => {
        try {
            const all = await apiFetch('/board');
            setBoardCards(Array.isArray(all) ? all : []);
        } catch {
            setBoardCards([]);
        }
    }, []);
    useEffect(() => { fetchBoardCards(); }, [fetchBoardCards]);

    // Toggle done de um card do board direto na agenda
    async function toggleBoardCardDone(card: any) {
        const newStatus = card.status === 'done' ? 'todo' : 'done';
        setBoardCards(prev => prev.map(c => c.id === card.id ? { ...c, status: newStatus } : c));
        try {
            await apiFetch(`/board/${card.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus }),
            });
        } catch {
            // rollback
            setBoardCards(prev => prev.map(c => c.id === card.id ? { ...c, status: card.status } : c));
        }
    }

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
            fetchClients();
        }
    }, [activeTab, fetchHistory, fetchClients]);

    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [historyClientFilter, fetchHistory, activeTab]);

    // ─── Actions ──────────────────────────────────────────────────────────

    const handleGenerateTasks = async () => {
        setGenerating(true);
        try {
            await apiFetch('/tasks/generate', {
                method: 'POST',
                body: JSON.stringify({
                    since: toISO(weekStart),
                    until: toISO(weekSunday),
                }),
            });
            await fetchTasks();
            await fetchSummary();
            setShowGenerateConfirm(false);
        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    const handleOpenTask = (task: Task) => {
        setSelectedTask(task);
        setTaskForm({
            status: task.status,
            campaign_changes: task.campaign_changes || '',
            report_sent: task.report_sent || false,
            report_data: task.report_data || '',
            message_text:
                task.message_text ||
                ((task.type === 'checkin_wed' || task.type === 'checkin_fri')
                    ? DEFAULT_MESSAGES[task.type](task.client_name)
                    : ''),
            message_sent: task.message_sent || false,
            notes: task.notes || '',
        });
    };

    const handleTimerToggle = async (task: Task) => {
        const isRunning = !!task.timer_started_at;
        try {
            const endpoint = isRunning ? `/tasks/${task.id}/timer/stop` : `/tasks/${task.id}/timer/start`;
            const result = await apiFetch(endpoint, { method: 'POST' });
            if (isRunning) {
                setTasks(prev => prev.map(t => t.id === task.id
                    ? { ...t, timer_started_at: null, time_spent_seconds: result.time_spent_seconds ?? t.time_spent_seconds }
                    : t
                ));
            } else {
                setTasks(prev => prev.map(t => t.id === task.id
                    ? { ...t, timer_started_at: result.timer_started_at ?? new Date().toISOString() }
                    : t
                ));
            }
        } catch (e) {
            console.error('Erro no timer', e);
        }
    };

    const handleSaveTask = async (status: 'done' | 'skipped') => {
        if (!selectedTask) return;
        setSaving(true);
        try {
            const updated = await apiFetch(`/tasks/${selectedTask.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    status,
                    campaign_changes: taskForm.campaign_changes || null,
                    report_sent: taskForm.report_sent,
                    report_data: taskForm.report_data || null,
                    message_text: taskForm.message_text || null,
                    message_sent: taskForm.message_sent,
                    notes: taskForm.notes || null,
                }),
            });
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setSelectedTask(null);
            fetchSummary();
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    // ─── Render helpers ───────────────────────────────────────────────────

    const tasksByDate = (dateStr: string) =>
        tasks.filter((t) => String(t.scheduled_date).substring(0, 10) === dateStr);

    const calendarEventsByDate = (dateStr: string) =>
        calendarEvents.filter(e => {
            const start = e.start?.dateTime || e.start?.date || e.start || '';
            return String(start).substring(0, 10) === dateStr;
        });

    const boardCardsByDate = (dateStr: string) =>
        boardCards.filter(c => c.due_date && String(c.due_date).substring(0, 10) === dateStr);

    // Cards atrasados (prazo < hoje, não concluídos) — mostrados na seção de hoje
    const overdueBoardCards = boardCards.filter(c =>
        c.due_date && c.status !== 'done' && String(c.due_date).substring(0, 10) < todayStr
    );

    const pendingCount = tasks.filter((t) => t.status === 'pending').length;
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const clientsWithPending = new Set(
        tasks.filter((t) => t.status === 'pending').map((t) => t.client_id)
    ).size;

    // Get unique clients from history for filter
    const historyClients = Array.from(
        new Map(history.map((t) => [t.client_id, { id: t.client_id, name: t.client_company || t.client_name, avatar_color: t.avatar_color }])).values()
    );

    const handleSaveMeeting = async (summary: string, completed: boolean) => {
        if (!selectedMeeting) return;
        const ev = selectedMeeting;
        const startStr = ev.start?.dateTime || ev.start?.date || ev.start || '';
        const event_date = String(startStr).substring(0, 10);
        const updated = await apiFetch('/routine/meeting-logs', {
            method: 'POST',
            body: JSON.stringify({
                google_event_id: ev.id,
                title: ev.summary || ev.title || 'Evento',
                event_date,
                summary,
                completed,
            }),
        });
        setMeetingLogs(prev => {
            const exists = prev.findIndex(l => l.google_event_id === ev.id);
            if (exists >= 0) return prev.map((l, i) => i === exists ? updated : l);
            return [...prev, updated];
        });
    };

    // ─── Week navigation ──────────────────────────────────────────────────

    const prevWeek = () => setWeekStart((w) => addDays(w, -7));
    const nextWeek = () => setWeekStart((w) => addDays(w, 7));

    // ─── Styles ───────────────────────────────────────────────────────────

    const tabStyle = (active: boolean) => ({
        padding: '8px 20px',
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--primary, #6366f1)' : 'transparent',
        color: active ? '#fff' : 'var(--text-muted)',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all .15s',
    });

    // ─── Render ───────────────────────────────────────────────────────────

    return (
        <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* Keyframes for spinner */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* ── Header ── */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <div
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: 'rgba(99,102,241,.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <ClipboardList size={18} color="#6366f1" />
                            </div>
                            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
                                Agenda
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                            Demandas, análises, relatórios e reuniões — tudo da semana num só lugar
                        </p>
                    </div>

                    {/* Tabs */}
                    <div
                        style={{
                            display: 'flex',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 10,
                            padding: 4,
                            gap: 2,
                        }}
                    >
                        <button style={tabStyle(activeTab === 'agenda')} onClick={() => setActiveTab('agenda')}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Calendar size={14} />
                                Agenda da Semana
                            </span>
                        </button>
                        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <History size={14} />
                                Histórico
                            </span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── AGENDA TAB ── */}
            {activeTab === 'agenda' && (
                <>
                    {/* Week navigator + generate button */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 16,
                            gap: 16,
                            flexWrap: 'wrap',
                        }}
                    >
                        {/* Week nav */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                                onClick={prevWeek}
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div
                                style={{
                                    padding: '7px 16px',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: 'var(--text)',
                                    minWidth: 200,
                                    textAlign: 'center',
                                }}
                            >
                                {weekLabel}
                            </div>
                            <button
                                onClick={nextWeek}
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: 'var(--bg-card)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Right side: summary + generate */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Summary pill */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    padding: '7px 16px',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Clock size={12} color="#f59e0b" />
                                    <strong style={{ color: 'var(--text)' }}>{pendingCount}</strong> pendentes
                                </span>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <CheckCircle2 size={12} color="#10b981" />
                                    <strong style={{ color: 'var(--text)' }}>{doneCount}</strong> concluídas
                                </span>
                                <span style={{ color: 'var(--border)' }}>·</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Users size={12} color="#6366f1" />
                                    <strong style={{ color: 'var(--text)' }}>{clientsWithPending}</strong> clientes
                                </span>
                            </div>

                            {/* Generate button */}
                            <button
                                onClick={() => setShowGenerateConfirm(true)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(99,102,241,.4)',
                                    background: 'rgba(99,102,241,.1)',
                                    color: '#6366f1',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 7,
                                }}
                            >
                                <Zap size={14} />
                                Regerar Semana
                            </button>
                        </div>
                    </div>

                    {/* Loading state */}
                    {loading ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                padding: 60,
                                color: 'var(--text-muted)',
                                fontSize: 14,
                            }}
                        >
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Carregando tarefas...
                        </div>
                    ) : (
                        <>
                            {/* Week grid — Mon to Fri */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: 12,
                                    marginBottom: 16,
                                }}
                            >
                                {weekDays.slice(0, 5).map((day) => {
                                    const dateStr = toISO(day);
                                    const dayTasks = tasksByDate(dateStr);
                                    const isToday = dateStr === todayStr;
                                    const dayName = DAY_LABELS[day.getDay()];
                                    const dayNum = String(day.getDate()).padStart(2, '0');

                                    return (
                                        <div key={dateStr}>
                                            {/* Day header */}
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    marginBottom: 8,
                                                    padding: '8px 12px',
                                                    borderRadius: 10,
                                                    background: isToday
                                                        ? 'rgba(99,102,241,.1)'
                                                        : 'var(--bg-card)',
                                                    border: `1px solid ${isToday ? 'rgba(99,102,241,.3)' : 'var(--border)'}`,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: 700,
                                                        color: isToday ? '#6366f1' : 'var(--text)',
                                                    }}
                                                >
                                                    {dayName} {dayNum}
                                                </span>
                                                {isToday && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            color: '#6366f1',
                                                            background: 'rgba(99,102,241,.15)',
                                                            padding: '2px 7px',
                                                            borderRadius: 20,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '.5px',
                                                        }}
                                                    >
                                                        Hoje
                                                    </span>
                                                )}
                                                {dayTasks.length > 0 && (
                                                    <span
                                                        style={{
                                                            marginLeft: 'auto',
                                                            fontSize: 11,
                                                            color: 'var(--text-muted)',
                                                        }}
                                                    >
                                                        {dayTasks.length}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Task cards + Calendar events + Board cards */}
                                            <div>
                                                {(() => {
                                                    const dayCalEvs = calendarEventsByDate(dateStr);
                                                    const dayBoardCards = boardCardsByDate(dateStr);
                                                    // Atrasados só aparecem no dia de hoje
                                                    const overdueHere = isToday ? overdueBoardCards : [];
                                                    if (dayTasks.length === 0 && dayCalEvs.length === 0 && dayBoardCards.length === 0 && overdueHere.length === 0) return (
                                                        <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border-light)', borderRadius: 10 }}>
                                                            Sem tarefas
                                                        </div>
                                                    );
                                                    return (
                                                        <>
                                                            {overdueHere.map(c => (
                                                                <BoardCardChip
                                                                    key={'overdue-' + c.id}
                                                                    card={c}
                                                                    overdue
                                                                    onToggle={() => toggleBoardCardDone(c)}
                                                                />
                                                            ))}
                                                            {dayBoardCards.map(c => (
                                                                <BoardCardChip
                                                                    key={c.id}
                                                                    card={c}
                                                                    onToggle={() => toggleBoardCardDone(c)}
                                                                />
                                                            ))}
                                                            {dayTasks.map((task) => (
                                                                <TaskCard key={task.id} task={task} onClick={() => handleOpenTask(task)} onTimerToggle={handleTimerToggle} />
                                                            ))}
                                                            {dayCalEvs.length > 0 && (
                                                                <div style={{ marginTop: (dayTasks.length > 0 || dayBoardCards.length > 0) ? 8 : 0 }}>
                                                                    {dayCalEvs.map((ev, i) => {
                                                                        const log = meetingLogs.find(l => l.google_event_id === ev.id);
                                                                        return <CalendarEventChip key={ev.id || i} event={ev} log={log} onClick={() => setSelectedMeeting(ev)} />;
                                                                    })}
                                                                </div>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Weekend (Sat/Sun) — compact, only if tasks exist */}
                            {(() => {
                                const satTasks = tasksByDate(toISO(weekDays[5]));
                                const sunTasks = tasksByDate(toISO(weekDays[6]));
                                const satBoard = boardCardsByDate(toISO(weekDays[5]));
                                const sunBoard = boardCardsByDate(toISO(weekDays[6]));
                                const hasSatSun = satTasks.length > 0 || sunTasks.length > 0 || satBoard.length > 0 || sunBoard.length > 0;
                                if (!hasSatSun) return null;

                                return (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(2, 1fr)',
                                            gap: 12,
                                        }}
                                    >
                                        {weekDays.slice(5).map((day) => {
                                            const dateStr = toISO(day);
                                            const dayTasks = tasksByDate(dateStr);
                                            const dayBoard = boardCardsByDate(dateStr);
                                            if (!dayTasks.length && !dayBoard.length) return null;
                                            const isToday = dateStr === todayStr;
                                            const dayName = DAY_LABELS[day.getDay()];
                                            const dayNum = String(day.getDate()).padStart(2, '0');

                                            return (
                                                <div key={dateStr}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 8,
                                                            marginBottom: 8,
                                                            padding: '8px 12px',
                                                            borderRadius: 10,
                                                            background: isToday ? 'rgba(99,102,241,.1)' : 'var(--bg-card)',
                                                            border: `1px solid ${isToday ? 'rgba(99,102,241,.3)' : 'var(--border)'}`,
                                                        }}
                                                    >
                                                        <span style={{ fontSize: 13, fontWeight: 700, color: isToday ? '#6366f1' : 'var(--text-muted)' }}>
                                                            {dayName} {dayNum}
                                                        </span>
                                                    </div>
                                                    {dayBoard.map(c => (
                                                        <BoardCardChip
                                                            key={c.id}
                                                            card={c}
                                                            onToggle={() => toggleBoardCardDone(c)}
                                                        />
                                                    ))}
                                                    {dayTasks.map((task) => (
                                                        <TaskCard
                                                            key={task.id}
                                                            task={task}
                                                            onClick={() => handleOpenTask(task)}
                                                            onTimerToggle={handleTimerToggle}
                                                        />
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {/* Empty state */}
                            {tasks.length === 0 && (
                                <div
                                    style={{
                                        textAlign: 'center',
                                        padding: '60px 20px',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    <ClipboardList size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                                        Nenhuma tarefa nesta semana
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                        As tarefas da semana atual são geradas automaticamente. Navegue para outra semana ou use "Regerar Semana" para forçar.
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {/* ── HISTORY TAB ── */}
            {activeTab === 'history' && (
                <div>
                    {/* Filters */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 20,
                            flexWrap: 'wrap',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Users size={14} color="var(--text-muted)" />
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Cliente:</span>
                        </div>
                        <select
                            value={historyClientFilter}
                            onChange={(e) => setHistoryClientFilter(e.target.value)}
                            style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: '7px 12px',
                                color: 'var(--text)',
                                fontSize: 13,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                minWidth: 180,
                            }}
                        >
                            <option value="">Todos os clientes</option>
                            {historyClients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={fetchHistory}
                            style={{
                                padding: '7px 14px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-muted)',
                                fontSize: 12,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            <RefreshCw size={13} />
                            Atualizar
                        </button>

                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                            {history.length} registro{history.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Table header */}
                    {history.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '8px 16px',
                                marginBottom: 6,
                            }}
                        >
                            <span style={{ width: 68, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 }}>Data</span>
                            <span style={{ width: 160, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 }}>Cliente</span>
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Tipo</span>
                            <span style={{ width: 90, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 }}>Status</span>
                            <span style={{ width: 100, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0, textAlign: 'right' }}>Concluída em</span>
                            <span style={{ width: 14, flexShrink: 0 }} />
                        </div>
                    )}

                    {/* History rows */}
                    {history.length === 0 ? (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '60px 20px',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <History size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                                Nenhum histórico encontrado
                            </div>
                            <div style={{ fontSize: 13 }}>
                                As tarefas concluídas e puladas aparecerão aqui.
                            </div>
                        </div>
                    ) : (
                        history.map((task) => <HistoryRow key={task.id} task={task} />)
                    )}
                </div>
            )}

            {/* ── Modals ── */}
            {selectedTask && (
                <CompletionModal
                    task={selectedTask}
                    form={taskForm}
                    saving={saving}
                    onClose={() => setSelectedTask(null)}
                    onFormChange={(update) => setTaskForm((f) => ({ ...f, ...update }))}
                    onSave={() => handleSaveTask('done')}
                    onSkip={() => handleSaveTask('skipped')}
                />
            )}

            {showGenerateConfirm && (
                <GenerateConfirmModal
                    weekLabel={weekLabel}
                    generating={generating}
                    onConfirm={handleGenerateTasks}
                    onClose={() => setShowGenerateConfirm(false)}
                />
            )}

            {selectedMeeting && (
                <MeetingModal
                    event={selectedMeeting}
                    log={meetingLogs.find(l => l.google_event_id === selectedMeeting.id)}
                    onClose={() => setSelectedMeeting(null)}
                    onSave={handleSaveMeeting}
                />
            )}
        </div>
    );
}
