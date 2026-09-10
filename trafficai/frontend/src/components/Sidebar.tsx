'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Megaphone,
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
    BarChart3,
    MessageSquare,
    Target,
    CheckSquare,
    Share2,
    Plug,
    Briefcase,
    Menu,
    X,
    MessageCircle,
    ClipboardCheck,
    History,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAccount } from '@/app/AccountContext';
import { useCurrentUser } from '@/app/UserContext';
import AccountSelect from '@/components/AccountSelect';

// ─── Area definitions ──────────────────────────────────────────────────────

// Cores por categoria pro selo do ícone de cada item — mesma linguagem visual
// já usada nos cards de KPI do dashboard.
const C = {
    blue:     { color: '#38bdf8', bg: 'rgba(56,189,248,.14)' },
    green:    { color: '#00d27a', bg: 'rgba(0,210,122,.14)' },
    purple:   { color: '#b794f4', bg: 'rgba(183,148,244,.16)' },
    cyan:     { color: '#22d3ee', bg: 'rgba(34,211,238,.16)' },
    orange:   { color: '#ff8b3d', bg: 'rgba(255,139,63,.16)' },
    red:      { color: '#ef4444', bg: 'rgba(239,68,68,.16)' },
    whatsapp: { color: '#25d366', bg: 'rgba(37,211,102,.16)' },
    neutral:  { color: 'var(--text-secondary)', bg: 'rgba(255,255,255,.06)' },
};

const AREAS = [
    {
        id: 'traffic',
        label: 'Tráfego Pago',
        shortLabel: 'Tráfego',
        icon: Radio,
        routes: ['/agenda', '/onboarding', '/dashboard', '/agent', '/campaigns', '/insights', '/predictions', '/alerts', '/rotina', '/reports', '/accounts', '/creative', '/otimizacoes', '/tracking', '/reports/whatsapp', '/templates', '/calendar', '/automation'],
        groups: [
            {
                label: 'Meu dia',
                items: [
                    { href: '/agenda',       label: 'Agenda',          icon: CalendarDays, color: C.blue },
                    { href: '/otimizacoes',  label: 'Fluxo Semanal',     icon: ClipboardList, color: C.blue },
                    { href: '/onboarding',   label: 'Onboarding',      icon: ClipboardCheck, showOnboardingBadge: true, color: C.green },
                ],
            },
            {
                label: 'Inteligência',
                items: [
                    { href: '/dashboard',   label: 'Dashboard',    icon: LayoutDashboard, color: C.cyan },
                    { href: '/agent',       label: 'Gestor IA',    icon: Bot, capability: 'ai_agent', color: C.purple },
                ],
            },
            {
                label: 'Campanhas',
                items: [
                    { href: '/campaigns',    label: 'Campanhas',    icon: Megaphone, color: C.orange },
                    { href: '/google-ads',   label: 'Google Ads',   icon: Radio, color: C.orange },
                    { href: '/predictions',  label: 'Previsões',    icon: TrendingUp, color: C.green },
                    { href: '/alerts',       label: 'Alertas',      icon: Bell, showBadge: true, color: C.red },
                ],
            },
            {
                label: 'Resultados',
                items: [
                    { href: '/reports',           label: 'Relatórios',       icon: FileText, color: C.blue },
                    { href: '/reports/whatsapp',  label: 'Diário WhatsApp',  icon: MessageCircle, color: C.whatsapp },
                    { href: '/creative',          label: 'Criativos',        icon: Palette, capability: 'creatives', color: C.purple },
                    { href: '/tracking',          label: 'Tracking',         icon: Activity, color: C.cyan },
                    { href: '/accounts',          label: 'Contas',           icon: Users, color: C.neutral },
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
                    { href: '/clientes',    label: 'Clientes',     icon: Building2, color: C.blue },
                    { href: '/financeiro',  label: 'Financeiro',   icon: Wallet, color: C.green },
                ],
            },
            {
                label: 'Time',
                items: [
                    { href: '/team',        label: 'Time',         icon: Users, color: C.purple },
                    { href: '/board',       label: 'Demandas',     icon: KanbanSquare, color: C.orange },
                    { href: '/audit-log',   label: 'Auditoria',    icon: History, adminOnly: true, color: C.neutral },
                ],
            },
        ],
    },
    {
        id: 'comercial',
        label: 'Comercial',
        icon: Briefcase,
        routes: ['/comercial'],
        groups: [
            {
                label: 'Visão Geral',
                items: [
                    { href: '/comercial',                label: 'Dashboard',     icon: BarChart3, color: C.cyan },
                    { href: '/comercial/conversations',  label: 'Conversas',     icon: MessageSquare, color: C.whatsapp },
                    { href: '/comercial/leads',          label: 'Leads',         icon: Target, color: C.orange },
                ],
            },
            {
                label: 'Operação',
                items: [
                    { href: '/comercial/team',           label: 'Vendedores',    icon: Users, color: C.purple },
                    { href: '/comercial/tasks',          label: 'Tarefas',       icon: CheckSquare, color: C.blue },
                ],
            },
            {
                label: 'Configuração',
                items: [
                    { href: '/comercial/integrations',   label: 'Integrações',   icon: Plug, color: C.neutral },
                    { href: '/comercial/share-links',    label: 'Compartilhar',  icon: Share2, color: C.neutral },
                ],
            },
        ],
    },
] as const;

type AreaId = 'traffic' | 'gestao' | 'comercial';

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
    const [onboardingActive, setOnboardingActive] = useState(0);
    const [activeArea, setActiveArea] = useState<AreaId>(() => detectArea(pathname || ''));
    const [mobileOpen, setMobileOpen] = useState(false);
    const { accounts, selectedAccountId, setSelectedAccountId } = useAccount();
    const { can, user } = useCurrentUser();

    useEffect(() => {
        if (pathname) setActiveArea(detectArea(pathname));
        // Fecha drawer ao navegar
        setMobileOpen(false);
    }, [pathname]);

    // Trava scroll do body quando o drawer mobile está aberto
    useEffect(() => {
        if (typeof document === 'undefined') return;
        document.body.style.overflow = mobileOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileOpen]);

    useEffect(() => {
        const fetchOnboardingCount = async () => {
            try {
                const s: any = await api.getOnboardingSummary();
                setOnboardingActive(s.active_count || 0);
            } catch { /* ignore */ }
        };
        fetchOnboardingCount();
        const iv = setInterval(fetchOnboardingCount, 60000);
        return () => clearInterval(iv);
    }, []);

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
        <>
            {/* Top bar mobile (hamburger + brand) — só visível em < 900px */}
            <div className="mobile-topbar">
                <button
                    type="button"
                    className="mobile-topbar-btn"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Abrir menu"
                >
                    <Menu size={20} strokeWidth={2} />
                </button>
                <div className="mobile-topbar-brand">
                    <div className="sidebar-brand-mark"><Zap size={14} strokeWidth={2.4} /></div>
                    <span>TrafficAI</span>
                </div>
            </div>

            {/* Backdrop drawer mobile */}
            {mobileOpen && (
                <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
            )}

            <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
            {/* Botão fechar (mobile) */}
            <button
                type="button"
                className="sidebar-close-btn"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
            >
                <X size={18} strokeWidth={2} />
            </button>

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
                <div className="sidebar-segs">
                    {AREAS.map(area => {
                        const Icon = area.icon;
                        const isActive = activeArea === area.id;
                        return (
                            <button
                                key={area.id}
                                onClick={() => setActiveArea(area.id as AreaId)}
                                className={`sidebar-seg ${isActive ? 'active' : ''}`}
                                type="button"
                            >
                                <Icon size={16} strokeWidth={2} />
                                <span className="seg-label">{(area as any).shortLabel || area.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="sidebar-divider" />

            {/* Navegação */}
            <nav className="sidebar-nav">
                {currentArea.groups.map((group: any) => (
                    <div key={group.label} className="sidebar-group-panel">
                        <div className="nav-group-label">{group.label}</div>
                        {group.items.filter((item: any) => (!item.capability || can(item.capability)) && (!item.adminOnly || user?.role === 'admin')).map((item: any) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                                >
                                    <span className="sidebar-link-badge" style={{ background: item.color?.bg, color: item.color?.color }}>
                                        <Icon strokeWidth={1.8} />
                                    </span>
                                    <span>{item.label}</span>
                                    {item.showBadge && unreadAlerts > 0 && (
                                        <span className="sidebar-badge">{unreadAlerts}</span>
                                    )}
                                    {(item as any).showOnboardingBadge && onboardingActive > 0 && (
                                        <span className="sidebar-badge" style={{ background: 'rgba(255,107,53,0.18)', color: 'var(--primary)', border: '1px solid rgba(255,107,53,0.35)' }}>{onboardingActive}</span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* Footer — Integrações, Assinatura e Instalar App moraram pra dentro de Configurações
                pra sobrar só o essencial aqui e o menu caber numa tela só, sem scroll. */}
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
        </>
    );
}
