'use client';

/**
 * MetaConnectButton — botão "Conectar Meta Ads" via Embedded Signup.
 * Carrega FB SDK, chama FB.login com response_type=code, envia code pro backend
 * que troca por User Long-Lived Token (60d) e dispara sync inicial.
 *
 * Substitui o copy-paste manual de token.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Facebook, CheckCircle2, Loader2, XCircle, Unlink } from 'lucide-react';

declare global {
    interface Window {
        FB: any;
        fbAsyncInit: () => void;
    }
}

let fbLoadPromise: Promise<void> | null = null;
function loadFbSdk(appId: string, version: string): Promise<void> {
    if (fbLoadPromise) return fbLoadPromise;
    fbLoadPromise = new Promise((resolve) => {
        // Se já tem, resolve
        if (window.FB) return resolve();
        window.fbAsyncInit = function () {
            window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
            resolve();
        };
        const script = document.createElement('script');
        script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
        script.async = true;
        script.defer = true;
        script.crossOrigin = 'anonymous';
        document.body.appendChild(script);
    });
    return fbLoadPromise;
}

export interface MetaConnectButtonProps {
    onConnected?: (result: { meta_user_id: string; meta_user_name: string | null }) => void;
    variant?: 'primary' | 'secondary';
}

export function MetaConnectButton({ onConnected, variant = 'primary' }: MetaConnectButtonProps) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'connecting' | 'connected' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<{ meta_user_id: string | null; token_expires_at: string | null; expired: boolean } | null>(null);

    useEffect(() => {
        api.metaSignupStatus()
            .then(s => {
                setInfo(s);
                setStatus(s.connected && !s.expired ? 'connected' : 'idle');
            })
            .catch(() => setStatus('idle'));
    }, []);

    async function handleConnect() {
        setStatus('connecting'); setError(null);
        try {
            const cfg = await api.metaSignupConfig();
            await loadFbSdk(cfg.appId, cfg.graphApiVersion);

            // FB.login promisificado
            const authResp: any = await new Promise((resolve) => {
                const loginOpts: any = { response_type: 'code', return_scopes: true };
                if (cfg.configId) {
                    loginOpts.config_id = cfg.configId;
                    loginOpts.override_default_response_type = true;
                } else {
                    loginOpts.scope = cfg.scope;
                }
                window.FB.login(resolve, loginOpts);
            });

            if (!authResp || !authResp.authResponse || !authResp.authResponse.code) {
                throw new Error(authResp?.status === 'unknown'
                    ? 'Você cancelou o login'
                    : 'FB.login não retornou code — cancelou ou fechou o popup?');
            }

            const result = await api.metaSignupExchange(authResp.authResponse.code);
            setStatus('connected');
            setInfo({
                meta_user_id: result.meta_user_id,
                token_expires_at: result.token_expires_at,
                expired: false,
            });
            onConnected?.({ meta_user_id: result.meta_user_id, meta_user_name: result.meta_user_name });
        } catch (e: any) {
            setError(e.message || 'Falha na conexão');
            setStatus('error');
        }
    }

    async function handleDisconnect() {
        if (!confirm('Desconectar Meta Ads? Os relatórios param até reconectar.')) return;
        try {
            await api.metaSignupDisconnect();
            setStatus('idle'); setInfo(null);
        } catch (e: any) { alert('Erro: ' + e.message); }
    }

    if (status === 'loading') {
        return (
            <button className="btn" disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="spin" /> Verificando…
            </button>
        );
    }

    if (status === 'connected') {
        const daysLeft = info?.token_expires_at
            ? Math.max(0, Math.floor((new Date(info.token_expires_at).getTime() - Date.now()) / 86400000))
            : null;
        return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, fontSize: 13 }}>
                <CheckCircle2 size={16} color="var(--accent-green)" />
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Meta Ads conectado</span>
                {daysLeft != null && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        · token válido por {daysLeft}d
                    </span>
                )}
                <button className="btn" onClick={handleDisconnect} style={{ padding: 4, marginLeft: 4 }} title="Desconectar">
                    <Unlink size={13} />
                </button>
            </div>
        );
    }

    const btnStyle = variant === 'primary'
        ? { background: '#1877F2', color: '#fff', border: 'none' }
        : { background: 'transparent', border: '1px solid #1877F2', color: '#1877F2' };

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
            <button
                onClick={handleConnect}
                disabled={status === 'connecting'}
                style={{
                    ...btnStyle,
                    padding: '10px 20px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: status === 'connecting' ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                }}
            >
                {status === 'connecting' ? <Loader2 size={16} className="spin" /> : <Facebook size={16} />}
                {status === 'connecting' ? 'Conectando…' : 'Conectar Meta Ads'}
            </button>
            {error && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-red)' }}>
                    <XCircle size={12} /> {error}
                </div>
            )}
        </div>
    );
}
