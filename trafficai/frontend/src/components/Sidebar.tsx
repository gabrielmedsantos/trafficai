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
    Radio,
    ClipboardList,
    Activity,
    KanbanSquare,
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
        routes: ['/dashboard', '/agent', '/campaigns', '/insights', '/predictions', '/alerts', '/rotina', '/reports', '/accounts', '/creative', '/otimizacoes', '/tracking'],
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
                    { href: '/otimizacoes',  label: 'Agenda',       icon: ClipboardList },
                    { href: '/alerts',       label: 'Alertas',      icon: Bell, showBadge: true },
                ],
            },
            {
                label: 'Resultados',
                items: [
                    { href: '/reports',     label: 'Relatórios',   icon: FileText },
                    { href: '/creative',    label: 'Criativos',    icon: Palette },
                    { href: '/tracking',    label: 'Tracking',     icon: Activity },
                    { href: '/accounts',    label: 'Contas',       icon: Users },
                ],
            },
        ],
    },
    {
        id: 'gestao',
        label: 'Gestão',
        icon: Building2,
        routes: ['/clientes', '/financeiro', '/team', '/board'],
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
                    { href: '/team',        label: 'Time',         icon: Users },
                    { href: '/board',       label: 'Demandas',     icon: KanbanSquare },
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

export default function Sidebar() {
    const pathname = usePathname();
    const [unreadAlerts, setUnreadAlerts] = useState(0);
    const [activeArea, setActiveArea] = useState<AreaId>(() => detectArea(pathname || ''));
    const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();

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
            {/* Brand */}
            <div className="sidebar-brand">
                <div className="sidebar-brand-mark">
                    <Zap size={16} strokeWidth={2.4} />
                </div>
                <div className="sidebar-brand-name">
                    <span className="brand">Alfamax</span>
                    <span className="product">TrafficAI</span>
                </div>
            </div>

            {/* Account selector (só na área tráfego) */}
            {activeArea === 'traffic' && (
                <AccountSelect
                    accounts={accounts}
                    value={selectedAccountId || ''}
                    onChange={id => setSelectedAccountId(id || null)}
                    allowAll={true}
                    allLabel="Todas as contas"
                />
            )}

            {/* Área */}
            <div className="sidebar-section">
                <div className="sidebar-section-label">Área</div>
                {AREAS.map(area => {
                    const Icon = area.icon;
                    const isActive = activeArea === area.id;
                    return (
                        <button
                            key={area.id}
                            onClick={() => setActiveArea(area.id as AreaId)}
                            className={`sidebar-area ${isActive ? 'active' : ''}`}
                            type="button"
                        >
                            <span className="area-icon">
                                <Icon size={13} strokeWidth={2} />
                            </span>
                            <span>{area.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="sidebar-divider" />

            {/* Navegação */}
            <nav className="sidebar-nav">
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
                                    <Icon className="icon" strokeWidth={1.8} />
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

            {/* Footer */}
            <div className="sidebar-footer">
                <Link
                    href="/settings"
                    className={`sidebar-link ${pathname === '/settings' ? 'active' : ''}`}
                >
                    <Settings className="icon" strokeWidth={1.8} />
                    <span>Configurações</span>
                </Link>
                <button
                    onClick={handleLogout}
                    className="sidebar-link sidebar-logout"
                    type="button"
                >
                    <LogOut className="icon" strokeWidth={1.8} />
                    <span>Sair</span>
                </button>
            </div>
        </aside>
    );
}
