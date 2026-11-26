'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Abas de "Métricas gerais": a aba Ao vivo em destaque + as páginas de Vendas existentes. */
const TABS = [
    { href: '/vendas', label: 'Geral', color: '#0ea5e9' },
    { href: '/vendas/diario', label: 'Dia a dia', color: '#22d3ee' },
    { href: '/vendas/campanhas', label: 'Campanhas', color: '#b794f4' },
    { href: '/vendas/criativos', label: 'Criativos', color: '#ff6b35' },
    { href: '/vendas/regioes', label: 'Regiões', color: '#00d27a' },
    { href: '/vendas/persona', label: 'Persona', color: '#f472b6' },
    { href: '/vendas/utms', label: 'UTMs', color: '#38bdf8' },
    { href: '/vendas/pedidos', label: 'Pedidos', color: '#facc15' },
    { href: '/vendas/recuperacao', label: 'Recuperação', color: '#ff8b3d' },
];

export const METRICS_TAB_ROUTES = ['/vendas/ao-vivo', ...TABS.map((t) => t.href)];

export function MetricsTabs({ activeNow }: { activeNow?: number | null }) {
    const pathname = usePathname() || '/vendas';
    const live = pathname === '/vendas/ao-vivo';
    return (
        <nav className="tai-mtabs" aria-label="Métricas gerais">
            <Link href="/vendas/ao-vivo" className={`tai-mtab tai-mtab-live${live ? ' on' : ''}`} aria-current={live ? 'page' : undefined}>
                <span className="tai-live-dot" aria-hidden />
                Ao vivo
                {activeNow != null && <em>{activeNow} agora</em>}
            </Link>
            {TABS.map((t) => {
                const on = pathname === t.href;
                return (
                    <Link key={t.href} href={t.href} className={`tai-mtab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
                        <b style={{ background: t.color }} aria-hidden />
                        {t.label}
                    </Link>
                );
            })}
        </nav>
    );
}
