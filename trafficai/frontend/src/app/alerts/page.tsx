'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Bell, AlertTriangle, XCircle, Info, Check, CheckCheck, Building2, ChevronDown, ChevronRight, Bot } from 'lucide-react';

interface AlertItem {
    id: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    is_read: boolean;
    created_at: string;
    previous_value?: number;
    current_value?: number;
    account_name?: string;
}

interface AccountGroup {
    account_name: string;
    alerts: AlertItem[];
    unreadCount: number;
    worstSeverity: 'info' | 'warning' | 'critical';
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

function groupByAccount(alerts: AlertItem[]): AccountGroup[] {
    const map = new Map<string, AlertItem[]>();
    for (const a of alerts) {
        const key = a.account_name || 'Sem conta';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(a);
    }
    return Array.from(map.entries()).map(([account_name, items]) => ({
        account_name,
        alerts: items,
        unreadCount: items.filter(a => !a.is_read).length,
        worstSeverity: items.reduce<'info' | 'warning' | 'critical'>((worst, a) =>
            SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[worst] ? a.severity : worst,
            'info'
        ),
    })).sort((a, b) => SEVERITY_ORDER[a.worstSeverity] - SEVERITY_ORDER[b.worstSeverity]);
}

const SEVERITY_COLOR = {
    critical: 'var(--accent-red)',
    warning: 'var(--accent-yellow)',
    info: 'var(--accent-blue, #60a5fa)',
};

const SEVERITY_BG = {
    critical: 'rgba(239,68,68,.12)',
    warning: 'rgba(234,179,8,.12)',
    info: 'rgba(96,165,250,.12)',
};

// Strip emoji from start of title
function stripEmoji(str: string) {
    return str.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\s]+/u, '').trim();
}

// Shorten message to just the key fact — extract campaign name + the core metric change
function shortMessage(message: string): string {
    // Extract content in quotes
    const quoted = message.match(/"([^"]+)"/);
    const campaignName = quoted ? quoted[1] : null;

    // Normalize campaign name: trim brackets-heavy names to last meaningful part
    let name = campaignName ?? '';
    // Try to extract last [TAG] or just truncate
    if (name.length > 40) name = name.substring(0, 38) + '…';

    return name;
}

function timeSince(dateStr: string) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'agora';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function SeverityDot({ severity }: { severity: 'info' | 'warning' | 'critical' }) {
    return (
        <span style={{
            display: 'inline-block',
            width: 7, height: 7,
            borderRadius: '50%',
            background: SEVERITY_COLOR[severity],
            flexShrink: 0,
            marginTop: 1,
        }} />
    );
}

function AlertRow({ alert, onMarkRead, onAskAgent }: { alert: AlertItem; onMarkRead: (id: string, e: React.MouseEvent) => void; onAskAgent: (alert: AlertItem, e: React.MouseEvent) => void }) {
    const campaign = shortMessage(alert.message);
    const title = stripEmoji(alert.title);
    const hasDelta = alert.previous_value != null && alert.current_value != null;

    const fmtVal = (v: number) => {
        const n = Number(v);
        if (isNaN(n)) return String(v);
        if (Math.abs(n) >= 1000) return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        if (Math.abs(n) < 10) return n.toFixed(2);
        return n.toFixed(0);
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            background: !alert.is_read ? 'rgba(255, 107, 53,.03)' : 'transparent',
            transition: 'background .15s',
        }}>
            {/* Unread dot */}
            <div style={{ width: 7, flexShrink: 0 }}>
                {!alert.is_read && (
                    <span style={{ display: 'block', width: 7, height: 7, borderRadius: '50%', background: SEVERITY_COLOR[alert.severity] }} />
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Title */}
                <span style={{
                    fontSize: 12.5,
                    fontWeight: alert.is_read ? 400 : 600,
                    color: alert.is_read ? 'var(--text-secondary)' : 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                }}>
                    {title}
                </span>

                {/* Campaign name */}
                {campaign && (
                    <span style={{
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: 300,
                        flexShrink: 1,
                    }}>
                        {campaign}
                    </span>
                )}

                {/* Delta badge */}
                {hasDelta && (
                    <span style={{
                        fontSize: 11,
                        color: SEVERITY_COLOR[alert.severity],
                        background: SEVERITY_BG[alert.severity],
                        borderRadius: 4,
                        padding: '1px 6px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}>
                        {fmtVal(alert.previous_value as number)} → {fmtVal(alert.current_value as number)}
                    </span>
                )}
            </div>

            {/* Right: time + action */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>
                    {timeSince(alert.created_at)}
                </span>
                <button
                    type="button"
                    onClick={(e) => onAskAgent(alert, e)}
                    title="Perguntar ao Agente sobre isso"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, borderRadius: 6,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        flexShrink: 0,
                    }}
                >
                    <Bot size={11} />
                </button>
                {!alert.is_read && (
                    <button
                        type="button"
                        onClick={(e) => onMarkRead(alert.id, e)}
                        title="Marcar como lido"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: 6,
                            background: 'var(--bg-input)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                    >
                        <Check size={11} />
                    </button>
                )}
            </div>
        </div>
    );
}

const PREVIEW_COUNT = 5;

function AccountGroupCard({
    group,
    onMarkRead,
    onAskAgent,
}: {
    group: AccountGroup;
    onMarkRead: (id: string, e: React.MouseEvent) => void;
    onAskAgent: (alert: AlertItem, e: React.MouseEvent) => void;
}) {
    const [expanded, setExpanded] = useState(group.unreadCount > 0 && group.alerts.length <= 10);
    const [showAll, setShowAll] = useState(false);

    const visible = expanded
        ? (showAll ? group.alerts : group.alerts.slice(0, PREVIEW_COUNT))
        : [];
    const hiddenCount = group.alerts.length - PREVIEW_COUNT;

    return (
        <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--bg-card)' }}>
            {/* Header */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    background: expanded ? 'rgba(255,255,255,.02)' : 'transparent',
                    borderBottom: expanded ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer', textAlign: 'left',
                    border: 'none', outline: 'none',
                }}
            >
                {/* Chevron */}
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>

                {/* Account icon */}
                <span style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: SEVERITY_BG[group.worstSeverity],
                    border: `1px solid ${SEVERITY_COLOR[group.worstSeverity]}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: SEVERITY_COLOR[group.worstSeverity],
                }}>
                    <Building2 size={13} />
                </span>

                {/* Name */}
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                    {group.account_name}
                </span>

                {/* Counts */}
                <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: SEVERITY_COLOR[group.worstSeverity],
                    background: SEVERITY_BG[group.worstSeverity],
                    borderRadius: 20, padding: '2px 8px', flexShrink: 0,
                }}>
                    {group.alerts.length} alerta{group.alerts.length !== 1 ? 's' : ''}
                    {group.unreadCount > 0 && (
                        <span style={{ fontWeight: 700 }}> · {group.unreadCount} novo{group.unreadCount !== 1 ? 's' : ''}</span>
                    )}
                </span>
            </button>

            {/* Alert rows */}
            {expanded && (
                <div>
                    {visible.map((alert) => (
                        <AlertRow key={alert.id} alert={alert} onMarkRead={onMarkRead} onAskAgent={onAskAgent} />
                    ))}

                    {/* Show more / less */}
                    {group.alerts.length > PREVIEW_COUNT && (
                        <button
                            type="button"
                            onClick={() => setShowAll(v => !v)}
                            style={{
                                width: '100%', padding: '8px 16px',
                                fontSize: 12, color: 'var(--text-muted)',
                                background: 'transparent', border: 'none',
                                borderTop: '1px solid var(--border)',
                                cursor: 'pointer', textAlign: 'center',
                            }}
                        >
                            {showAll
                                ? 'Mostrar menos'
                                : `Ver mais ${hiddenCount} alerta${hiddenCount !== 1 ? 's' : ''}`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function AlertsPage() {
    const router = useRouter();
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    function handleAskAgent(alert: AlertItem, e: React.MouseEvent) {
        e.stopPropagation();
        const campaign = shortMessage(alert.message);
        const prompt = `Analise este alerta${alert.account_name ? ` da conta "${alert.account_name}"` : ''}${campaign ? ` (campanha "${campaign}")` : ''}: "${stripEmoji(alert.title)}" — ${alert.message}. O que devo fazer a respeito?`;
        router.push(`/agent?q=${encodeURIComponent(prompt)}`);
    }

    useEffect(() => { loadAlerts(); }, []);

    async function loadAlerts() {
        setLoading(true);
        try {
            const data = await api.getAlerts();
            setAlerts(data.alerts || []);
            setUnreadCount(data.unread_count || 0);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleMarkRead(alertId: string, e: React.MouseEvent) {
        e.stopPropagation();
        await api.markAlertRead(alertId);
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }

    async function handleMarkAllRead() {
        await api.markAllAlertsRead();
        setAlerts([]);
        setUnreadCount(0);
    }

    if (loading) {
        return (
            <div className="fade-in">
                <div className="page-header"><div><h1>Alertas</h1></div></div>
                <div className="loading-spinner"><div className="spinner" /></div>
            </div>
        );
    }

    const groups = groupByAccount(alerts);

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Bell size={28} style={{ color: 'var(--accent-yellow)' }} />
                        Alertas
                        {unreadCount > 0 && (
                            <span className="sidebar-badge">{unreadCount}</span>
                        )}
                    </h1>
                    <p>Notificações automáticas sobre suas campanhas</p>
                </div>
                {unreadCount > 0 && (
                    <button type="button" className="btn btn-secondary" onClick={handleMarkAllRead}>
                        <CheckCheck size={16} /> Marcar tudo como lido
                    </button>
                )}
            </div>

            {groups.length === 0 ? (
                <div className="card empty-state">
                    <Bell size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-yellow)', opacity: 0.4 }} />
                    <h3>Nenhum alerta</h3>
                    <p>O sistema monitora suas campanhas automaticamente e notifica sobre anomalias</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {groups.map((group) => (
                        <AccountGroupCard
                            key={group.account_name}
                            group={group}
                            onMarkRead={handleMarkRead}
                            onAskAgent={handleAskAgent}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
