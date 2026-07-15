'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MetaConnectButton } from '@/components/MetaConnectButton';
import { Facebook, Search, Cloud, CheckCircle2, XCircle, MessageCircle, Instagram, Loader2 } from 'lucide-react';

interface IntegrationCard {
    id: string;
    name: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    status: 'connected' | 'disconnected' | 'loading';
    action: React.ReactNode;
}

export default function IntegrationsPage() {
    const [metaStatus, setMetaStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
    const [gaStatus, setGaStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
    const [googleStatus, setGoogleStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
    const [googleEmail, setGoogleEmail] = useState<string | null>(null);

    useEffect(() => {
        api.metaSignupStatus().then(s => setMetaStatus(s.connected && !s.expired ? 'connected' : 'disconnected')).catch(() => setMetaStatus('disconnected'));
        api.gaGetCredentials().then((c: any) => setGaStatus(c?.has_refresh ? 'connected' : 'disconnected')).catch(() => setGaStatus('disconnected'));
        api.googleOAuthStatus().then(s => {
            setGoogleStatus(s.connected ? 'connected' : 'disconnected');
            setGoogleEmail(s.email);
        }).catch(() => setGoogleStatus('disconnected'));
    }, []);

    async function connectGoogle() {
        try {
            const { url } = await api.googleOAuthConnect();
            const w = window.open(url, 'google-oauth', 'width=500,height=650');
            const check = setInterval(async () => {
                if (w?.closed) {
                    clearInterval(check);
                    const s = await api.googleOAuthStatus();
                    setGoogleStatus(s.connected ? 'connected' : 'disconnected');
                    setGoogleEmail(s.email);
                }
            }, 1000);
        } catch (e: any) { alert('Erro: ' + e.message); }
    }
    async function disconnectGoogle() {
        if (!confirm('Desconectar Google Drive e Calendar?')) return;
        await api.googleOAuthDisconnect();
        setGoogleStatus('disconnected');
        setGoogleEmail(null);
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        🔌 Integrações
                    </h1>
                    <p>Conecte suas contas e gerencie suas integrações num só lugar</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>

                <IntegrationCard
                    icon={<Facebook size={22} />}
                    color="#1877F2"
                    name="Meta Ads (Facebook + Instagram)"
                    desc="Campanhas e métricas de desempenho de todas as suas contas Meta"
                    status={metaStatus}
                    action={<MetaConnectButton onConnected={() => setMetaStatus('connected')} />}
                />

                <IntegrationCard
                    icon={<Search size={22} />}
                    color="#4285F4"
                    name="Google Ads"
                    desc="Contas Google e clientes de anúncios via MCC"
                    status={gaStatus}
                    action={<a href="/google-ads" className="btn btn-primary" style={{ textDecoration: 'none' }}>Gerenciar</a>}
                    badge="BETA"
                />

                <IntegrationCard
                    icon={<Cloud size={22} />}
                    color="#0F9D58"
                    name="Google Drive + Agenda"
                    desc={googleEmail ? `Conectado: ${googleEmail} — sync de PDFs pro Drive + eventos no Calendar` : 'Upload de PDFs no Drive + eventos e Meet no Calendar'}
                    status={googleStatus}
                    action={googleStatus === 'connected'
                        ? <button className="btn" onClick={disconnectGoogle}>Desconectar</button>
                        : <button className="btn btn-primary" onClick={connectGoogle}>Conectar Google</button>}
                />

                <IntegrationCard
                    icon={<MessageCircle size={22} />}
                    color="#25D366"
                    name="WhatsApp (Evolution API)"
                    desc="Envio de relatórios diários + notificações + tracking CTWA de anúncios"
                    status="connected"
                    action={<a href="/comercial/integrations" className="btn" style={{ textDecoration: 'none' }}>Configurar</a>}
                />

                <IntegrationCard
                    icon={<Instagram size={22} />}
                    color="#E4405F"
                    name="Instagram Business"
                    desc="Publica posts + responde DMs via IG Business API"
                    status="disconnected"
                    action={<a href="/comercial/integrations" className="btn" style={{ textDecoration: 'none' }}>Conectar</a>}
                />

            </div>
        </div>
    );
}

function IntegrationCard({ icon, color, name, desc, status, action, badge }: {
    icon: React.ReactNode; color: string; name: string; desc: string;
    status: 'loading' | 'connected' | 'disconnected'; action: React.ReactNode; badge?: string;
}) {
    return (
        <div className="card" style={{
            padding: 24,
            borderTop: `3px solid ${status === 'connected' ? 'var(--primary)' : color}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 220,
        }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                    width: 44, height: 44, borderRadius: 10,
                    background: `${color}18`, color,
                    display: 'grid', placeItems: 'center',
                    flexShrink: 0,
                }}>{icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{name}</h3>
                        {badge && (
                            <span style={{
                                fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase',
                                padding: '2px 6px', background: 'var(--bg-input)', color: 'var(--text-muted)',
                                borderRadius: 4, fontWeight: 700,
                            }}>{badge}</span>
                        )}
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>{desc}</p>
                </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    {status === 'loading' ? (
                        <><Loader2 size={12} className="spin" /><span style={{ color: 'var(--text-muted)' }}>Verificando…</span></>
                    ) : status === 'connected' ? (
                        <><CheckCircle2 size={13} color="var(--accent-green)" /><span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Conectado</span></>
                    ) : (
                        <><XCircle size={13} color="var(--text-muted)" /><span style={{ color: 'var(--text-muted)' }}>Desconectado</span></>
                    )}
                </div>
                <div>{action}</div>
            </div>
        </div>
    );
}
