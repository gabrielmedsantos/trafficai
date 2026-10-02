'use client';

import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { useCurrentUser } from '@/app/UserContext';
import { endImpersonation } from '@/lib/api';

/** Prazo da sessão de suporte, lido do próprio token (exp do JWT). */
function tokenExp(): number | null {
    try {
        const t = localStorage.getItem('trafficai_token') || '';
        const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch { return null; }
}

/**
 * Faixa fixa no topo durante "Entrar como": deixa claro de quem é a conta,
 * quanto falta pra sessão acabar e devolve o admin pra conta dele.
 */
export default function ImpersonationBanner() {
    const { user } = useCurrentUser();
    const imp = user?.impersonated_by;
    const [left, setLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!imp) { document.body.classList.remove('tai-imp'); return; }
        document.body.classList.add('tai-imp');
        const exp = tokenExp();
        const tick = () => {
            if (!exp) return;
            const ms = exp - Date.now();
            setLeft(Math.max(0, ms));
            if (ms <= 0) endImpersonation();
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => { clearInterval(t); document.body.classList.remove('tai-imp'); };
    }, [imp]);

    if (!imp || !user) return null;
    const mm = left != null ? Math.floor(left / 60000) : null;
    const ss = left != null ? Math.floor((left % 60000) / 1000) : null;

    return (
        <div role="status" className="tai-imp-banner" style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 40, zIndex: 2000, display: 'flex', alignItems: 'center', gap: 14,
            padding: '0 20px', background: 'var(--accent-yellow)', color: '#1f1a00', fontSize: 13, boxShadow: '0 4px 14px rgba(0,0,0,.35)',
        }}>
            <Eye size={17} strokeWidth={2.2} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>Você está vendo como {user.name || user.email}</b>
                <span className="tai-imp-detail"> · {user.email} · o que fizer aqui vale na conta dele</span>
            </span>
            {mm != null && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    sessão termina em {mm}:{String(ss).padStart(2, '0')}
                </span>
            )}
            <button type="button" onClick={() => { if (!endImpersonation()) { localStorage.removeItem('trafficai_token'); window.location.assign('/'); } }} style={{
                marginLeft: mm == null ? 'auto' : 0, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#1f1a00', color: 'var(--accent-yellow)', font: '700 12.5px var(--font-sans)', whiteSpace: 'nowrap',
            }}>
                Voltar pra minha conta
            </button>
        </div>
    );
}
