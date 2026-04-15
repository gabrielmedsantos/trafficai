'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Megaphone,
    Brain,
    Bell,
    TrendingUp,
    Palette,
    Users,
    Settings,
    LogOut,
    Zap,
    Bot,
    FileText,
    CalendarDays,
    Building2,
    Wallet,
    ChevronRight,
    Radio,
    ClipboardList,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAccount } from '@/app/AccountContext';
import AccountSelect from '@/components/AccountSelect';

// ─── Area definitions ──────────────────────────────────────────────────────

const AREAS = [
    {
        id: 'traffic',
        label: 'Tráfego Pago',
        icon: Radio,
        color: '#6366f1',
        routes: ['/dashboard', '/agent', '/campaigns', '/insights', '/predictions', '/alerts', '/rotina', '/reports', '/accounts', '/creative', '/otimizacoes'],
        groups: [
            {
                label: 'Inteligência',
                items: [
                    { href: '/dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
                    { href: '/agent',       label: 'Gestor IA',    icon: Bot },
                    { href: '/insights',    label: 'Insights IA',  icon: Brain },
                ],
            },
            {
                label: 'Campanhas',
                items: [
                    { href: '/campaigns',    label: 'Campanhas',    icon: Megaphone },
                    { href: '/predictions',  label: 'Previsões',    icon: TrendingUp },
                    { href: '/rotina',       label: 'Rotina',       icon: CalendarDays },
                    { href: '/otimizacoes',  label: 'Otimizações',  icon: ClipboardList },
                    { href: '/alerts',       label: 'Alertas',      icon: Bell, showBadge: true },
                ],
            },
            {
                label: 'Resultados',
                items: [
                    { href: '/reports',     label: 'Relatórios',   icon: FileText },
                    { href: '/creative',    label: 'Criativos',    icon: Palette },
                    { href: '/accounts',    label: 'Contas',       icon: Users },
                ],
            },
        ],
    },
    {
        id: 'gestao',
        label: 'Gestão',
        icon: Building2,
        color: '#10b981',
        routes: ['/clientes', '/financeiro', '/team'],
        groups: [
            {
                label: 'CRM & Financeiro',
                items: [
                    { href: '/clientes',    label: 'Clientes',     icon: Building2 },
                    { href: '/financeiro',  label: 'Financeiro',   icon: Wallet },
                ],
            },
            {
                label: 'Time',
                items: [
                    { href: '/team',        label: 'Gestão do Time', icon: Users },
                ],
            },
        ],
    },
] as const;

type AreaId = 'traffic' | 'gestao';

function detectArea(pathname: string): AreaId {
    for (const area of AREAS) {
        if (area.routes.some(r => pathname === r || pathname.startsWith(r + '/'))) {
            return area.id as AreaId;
        }
    }
    return 'traffic';
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function Sidebar() {
    const pathname = usePathname();
    const [unreadAlerts, setUnreadAlerts] = useState(0);
    const [activeArea, setActiveArea] = useState<AreaId>(() => detectArea(pathname || ''));
    const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

    // Keep area in sync with navigation
    useEffect(() => {
        if (pathname) setActiveArea(detectArea(pathname));
    }, [pathname]);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const data = await api.getAlerts();
                setUnreadAlerts(data.unread_count);
            } catch { /* ignore */ }
        };
        fetchAlerts();
        const interval = setInterval(fetchAlerts, 30_000);
        return () => clearInterval(interval);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('trafficai_token');
        window.location.href = '/';
    };

    const currentArea = AREAS.find(a => a.id === activeArea) ?? AREAS[0];

    return (
        <aside className="sidebar">
            {/* ── Brand ── */}
            <div className="sidebar-logo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="logo-icon">
                        <Zap size={17} color="white" />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-.3px' }}>Alfamax</h1>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, letterSpacing: '.3px', textTransform: 'uppercase' }}>Digital</p>
                    </div>
                </div>
            </div>

            {/* ── Account Selector (only visible in traffic area) ── */}
            {activeArea === 'traffic' && (
                <div style={{ padding: '0 10px 8px' }}>
                    <AccountSelect
                        accounts={accounts}
                        value={selectedAccountId || ''}
                        onChange={id => setSelectedAccountId(id || null)}
                        allowAll={true}
                        allLabel="Todas as Contas"
                    />
                </div>
            )}

            {/* ── Area Switcher ── */}
            <div style={{ padding: '4px 10px 12px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Área</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {AREAS.map(area => {
                        const Icon = area.icon;
                        const isActive = activeArea === area.id;
                        return (
                            <button
                                key={area.id}
                                onClick={() => setActiveArea(area.id as AreaId)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '9px 12px', borderRadius: 10,
                                    border: isActive ? `1px solid ${area.color}40` : '1px solid transparent',
                                    background: isActive ? `${area.color}14` : 'transparent',
                                    cursor: 'pointer', textAlign: 'left', width: '100%',
                                    transition: 'all .15s',
                                }}
                            >
                                <div style={{
                                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                                    background: isActive ? `${area.color}22` : 'rgba(255,255,255,.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Icon size={14} color={isActive ? area.color : 'var(--text-muted)'} />
                                </div>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? area.color : 'var(--text-muted)' }}>
                                    {area.label}
                                </span>
                                {isActive && <ChevronRight size={13} color={area.color} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Nav divider ── */}
            <div style={{ height: 1, background: 'var(--border)', margin: '0 10px 10px' }} />

            {/* ── Navigation ── */}
            <nav className="sidebar-nav" style={{ flex: 1 }}>
                {currentArea.groups.map((group: any) => (
                    <div key={group.label}>
                        <div className="nav-group-label">{group.label}</div>
                        {group.items.map((item: any) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                                >
                                    <Icon size={16} className="icon" />
                                    <span>{item.label}</span>
                                    {item.showBadge && unreadAlerts > 0 && (
                                        <span className="sidebar-badge">{unreadAlerts}</span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* ── Bottom ── */}
            <div style={{ padding: '10px', borderTop: '1px solid var(--border)' }}>
                <Link href="/settings" className={`sidebar-link ${pathname === '/settings' ? 'active' : ''}`} style={{ marginBottom: 4 }}>
                    <Settings size={16} className="icon" />
                    <span>Configurações</span>
                </Link>
                <button
                    onClick={handleLogout}
                    className="sidebar-link sidebar-logout"
                    style={{ width: '100%', border: 'none', background: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                >
                    <LogOut size={16} className="icon" />
                    <span>Sair</span>
                </button>
            </div>
        </aside>
    );
}
