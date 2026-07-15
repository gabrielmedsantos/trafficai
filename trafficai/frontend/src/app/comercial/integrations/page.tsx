'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plug, MessageCircle, Building2, RefreshCw, Trash2, Check, AlertCircle, X, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './integrations.module.css';

interface Integration {
    id: string;
    type: string;
    name: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    config: any;
    last_event_at: string | null;
    last_error: string | null;
    connected_at: string | null;
    created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    connected: { label: 'Conectado', color: 'var(--accent-green)' },
    connecting: { label: 'Sincronizando…', color: 'var(--accent-yellow)' },
    error: { label: 'Erro', color: 'var(--accent-red)' },
    disconnected: { label: 'Desconectado', color: 'var(--text-muted)' },
};

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [showKommoModal, setShowKommoModal] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        api.listCommercialIntegrations()
            .then(setIntegrations)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh enquanto houver alguma "connecting"
    useEffect(() => {
        const hasConnecting = integrations.some(i => i.status === 'connecting');
        if (!hasConnecting) return;
        const tick = setInterval(load, 5_000);
        return () => clearInterval(tick);
    }, [integrations, load]);

    const handleSync = async (id: string) => {
        setSyncingId(id);
        try {
            await api.syncCommercialIntegration(id);
            load();
        } catch (e: any) {
            alert('Sync falhou: ' + e.message);
        } finally {
            setSyncingId(null);
        }
    };

    const handleDisconnect = async (id: string, name: string) => {
        if (!confirm(`Desconectar "${name}"? Os dados sincronizados serão preservados, mas paramos de receber atualizações.`)) return;
        try {
            await api.disconnectCommercialIntegration(id);
            load();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        }
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div className={styles.title}>
                    <Plug size={22} className={styles.titleIcon} strokeWidth={2} />
                    <h1 className={styles.titleText}>Integrações</h1>
                </div>
                <p className={styles.subtitle}>Conecte seu CRM e canais de atendimento ao Dashboard Comercial</p>
            </header>

            {/* Integrações ativas */}
            {!loading && integrations.length > 0 && (
                <section className={styles.section}>
                    <h2 className={styles.sectionTitle}>Conectadas</h2>
                    <div className={styles.activeList}>
                        {integrations.map(int => {
                            const status = STATUS_LABEL[int.status] || STATUS_LABEL.disconnected!;
                            const ConnIcon = int.type === 'kommo' ? Building2 : MessageCircle;
                            return (
                                <div key={int.id} className={styles.activeCard}>
                                    <div className={styles.activeIcon}>
                                        <ConnIcon size={20} strokeWidth={2} />
                                    </div>
                                    <div className={styles.activeMain}>
                                        <div className={styles.activeName}>{int.name}</div>
                                        <div className={styles.activeMeta}>
                                            <span className={styles.statusBadge} style={{ color: status.color, borderColor: status.color }}>
                                                {int.status === 'connecting' && <Loader2 size={10} className={styles.spin} />}
                                                {int.status === 'connected' && <Check size={10} />}
                                                {int.status === 'error' && <AlertCircle size={10} />}
                                                {status.label}
                                            </span>
                                            <span className={styles.metaText}>Última sync: {fmtDate(int.last_event_at)}</span>
                                            {int.config?.subdomain && (
                                                <span className={styles.metaText}>{int.config.subdomain}.kommo.com</span>
                                            )}
                                        </div>
                                        {int.last_error && (
                                            <div className={styles.errorMsg}>{int.last_error}</div>
                                        )}
                                    </div>
                                    <div className={styles.activeActions}>
                                        <button
                                            onClick={() => handleSync(int.id)}
                                            disabled={syncingId === int.id || int.status === 'connecting'}
                                            className={styles.iconBtn}
                                            title="Sincronizar agora"
                                        >
                                            {syncingId === int.id ? <Loader2 size={14} className={styles.spin} /> : <RefreshCw size={14} />}
                                        </button>
                                        <button
                                            onClick={() => handleDisconnect(int.id, int.name)}
                                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                            title="Desconectar"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Catálogo de integrações */}
            <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Disponíveis</h2>
                <div className={styles.grid}>
                    <IntegrationCard
                        icon={Building2}
                        color="#22c55e"
                        name="Kommo CRM"
                        description="Importa pipelines, deals, vendedores e tarefas. Sincroniza a cada 30min."
                        action={{ label: 'Conectar', onClick: () => setShowKommoModal(true) }}
                    />
                    <IntegrationCard
                        icon={MessageCircle}
                        color="#10b981"
                        name="WhatsApp (Evolution)"
                        description="Conecta seu número via QR Code. Captura conversas e calcula tempo de resposta."
                        action={{ label: 'Conectar', onClick: () => setShowWhatsAppModal(true) }}
                    />
                    <IntegrationCard
                        icon={MessageCircle}
                        color="#3b82f6"
                        name="WhatsApp Cloud API (Meta)"
                        description="Integração oficial via Meta Business. Para volumes maiores e múltiplos números."
                        badge="Em breve"
                    />
                    <IntegrationCard
                        icon={Building2}
                        color="#f97316"
                        name="RD Station"
                        description="Importa funil e leads do RD Station CRM."
                        badge="Em breve"
                    />
                    <IntegrationCard
                        icon={Building2}
                        color="#8b5cf6"
                        name="Pipedrive"
                        description="Importa funil e deals do Pipedrive."
                        badge="Em breve"
                    />
                </div>
            </section>

            {showKommoModal && <KommoConnectModal onClose={() => setShowKommoModal(false)} onConnected={load} />}
            {showWhatsAppModal && <WhatsAppConnectModal onClose={() => setShowWhatsAppModal(false)} onConnected={load} />}
        </div>
    );
}

// ─── Catálogo card ──────────────────────────────────────────────────────────

function IntegrationCard({ icon: Icon, color, name, description, action, badge }: {
    icon: any; color: string; name: string; description: string;
    action?: { label: string; onClick: () => void };
    badge?: string;
}) {
    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.iconWrap} style={{ background: `${color}1a`, color }}>
                    <Icon size={22} strokeWidth={2} />
                </div>
                {badge && <span className={styles.statusComingSoon}>{badge}</span>}
            </div>
            <h3 className={styles.cardName}>{name}</h3>
            <p className={styles.cardDesc}>{description}</p>
            {action ? (
                <button onClick={action.onClick} className={styles.cardBtnPrimary}>{action.label}</button>
            ) : (
                <button className={styles.cardBtn} disabled>Em breve</button>
            )}
        </div>
    );
}

// ─── Modal de conexão Kommo ────────────────────────────────────────────────

function KommoConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
    const [subdomain, setSubdomain] = useState('');
    const [accessToken, setAccessToken] = useState('');
    const [name, setName] = useState('');
    const [clientId, setClientId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        try {
            const cleanSubdomain = subdomain.trim().replace(/^https?:\/\//, '').replace(/\.kommo\.com\/?$/, '');
            await api.connectCommercialKommo({
                subdomain: cleanSubdomain,
                accessToken: accessToken.trim(),
                ...(name.trim() && { name: name.trim() }),
                ...(clientId && { clientId }),
            });
            onConnected();
            onClose();
        } catch (e: any) {
            setError(e.message || 'Erro ao conectar');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div className={styles.modalBackdrop} onClick={onClose} />
            <div className={styles.modal}>
                <header className={styles.modalHeader}>
                    <h2>Conectar Kommo CRM</h2>
                    <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
                </header>
                <form onSubmit={submit} className={styles.modalBody}>
                    <div className={styles.field}>
                        <label>Cliente</label>
                        <ClientPicker
                            value={clientId}
                            onChange={setClientId}
                            placeholder="Selecione um cliente"
                        />
                        <small>Vincula esta integração a um cliente específico (opcional, mas recomendado pra dashboards multi-cliente).</small>
                    </div>

                    <div className={styles.field}>
                        <label>Subdomínio</label>
                        <input
                            type="text" required
                            value={subdomain}
                            onChange={e => setSubdomain(e.target.value)}
                            placeholder="ex: performancesolarcaninde"
                            autoFocus
                        />
                        <small>A parte antes de <code>.kommo.com</code> na URL</small>
                    </div>

                    <div className={styles.field}>
                        <label>Token de longa duração</label>
                        <textarea
                            required
                            value={accessToken}
                            onChange={e => setAccessToken(e.target.value)}
                            placeholder="eyJ0eXAi..."
                            rows={4}
                        />
                        <small>
                            Gere em: <strong>Configurações → Integrações → Criar integração privada → Chaves e escopos</strong>.
                            Marque os escopos <code>crm</code> e <code>notifications</code>.
                        </small>
                    </div>

                    <div className={styles.field}>
                        <label>Nome (opcional)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="ex: Kommo Performance Solar"
                        />
                    </div>

                    {error && <div className={styles.errorBox}>{error}</div>}

                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancelar</button>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary}>
                            {submitting ? <><Loader2 size={14} className={styles.spin} /> Validando...</> : 'Conectar'}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}

// ─── Modal de conexão WhatsApp Evolution ───────────────────────────────────

const WEBHOOK_EVENTS = [
    { id: 'MESSAGES_UPSERT', label: 'Mensagens (recebidas + enviadas)', recommended: true },
    { id: 'CONNECTION_UPDATE', label: 'Status da conexão', recommended: true },
    { id: 'CONTACTS_UPSERT', label: 'Contatos (sincronizar nomes)', recommended: false },
    { id: 'CHATS_UPSERT', label: 'Conversas (lista de chats)', recommended: false },
    { id: 'MESSAGES_UPDATE', label: 'Atualizações de status (entregue/lido)', recommended: false },
];

function WhatsAppConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: () => void }) {
    const [name, setName] = useState('');
    const [clientId, setClientId] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('');
    const [evolutionApiKey, setEvolutionApiKey] = useState('');
    const [selectedEvents, setSelectedEvents] = useState<string[]>(
        WEBHOOK_EVENTS.filter(e => e.recommended).map(e => e.id)
    );
    const [stage, setStage] = useState<'form' | 'qr' | 'connected' | 'error'>('form');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [integrationId, setIntegrationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const toggleEvent = (id: string) => {
        setSelectedEvents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    // Cria instância
    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const r = await api.connectCommercialWhatsApp({
                ...(name.trim() && { name: name.trim() }),
                ...(clientId && { clientId }),
                ...(showAdvanced && evolutionBaseUrl.trim() && { evolutionBaseUrl: evolutionBaseUrl.trim() }),
                ...(showAdvanced && evolutionApiKey.trim() && { evolutionApiKey: evolutionApiKey.trim() }),
                ...(selectedEvents.length > 0 && { webhookEvents: selectedEvents }),
            });
            setIntegrationId(r.integrationId);
            setQrCode(r.qrCode);
            setStage('qr');
        } catch (err: any) {
            setError(err.message);
            setStage('error');
        } finally {
            setSubmitting(false);
        }
    };

    // Polling do QR + status
    useEffect(() => {
        if (stage !== 'qr' || !integrationId) return;
        let stopped = false;
        const tick = async () => {
            if (stopped) return;
            try {
                const r = await api.getCommercialIntegrationQr(integrationId);
                if (stopped) return;
                if (r.status === 'connected') {
                    setStage('connected');
                    setTimeout(() => { onConnected(); onClose(); }, 1500);
                    return;
                }
                if (r.qrCode) setQrCode(r.qrCode);
                if (r.pairingCode) setPairingCode(r.pairingCode);
            } catch (err: any) {
                console.warn('QR poll falhou', err.message);
            }
        };
        // Polling a cada 5s
        const interval = setInterval(tick, 5000);
        // Tick imediato
        tick();
        return () => { stopped = true; clearInterval(interval); };
    }, [stage, integrationId, onClose, onConnected]);

    const renderQr = () => {
        if (!qrCode) {
            return (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <Loader2 size={32} className={styles.spin} style={{ color: 'var(--accent-purple)' }} />
                    <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                        Gerando QR Code…
                    </p>
                </div>
            );
        }
        const src = qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`;
        return (
            <div style={{ textAlign: 'center' }}>
                <img src={src} alt="QR Code" style={{ width: 240, height: 240, background: 'white', borderRadius: 12, padding: 12 }} />
                <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                    Abra o WhatsApp → Aparelhos conectados → Conectar um aparelho<br />
                    e escaneie o código acima.
                </p>
                {pairingCode && (
                    <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        ou use o código: <strong style={{ color: 'var(--accent-purple)' }}>{pairingCode}</strong>
                    </p>
                )}
            </div>
        );
    };

    return (
        <>
            <div className={styles.modalBackdrop} onClick={onClose} />
            <div className={styles.modal}>
                <header className={styles.modalHeader}>
                    <h2>Conectar WhatsApp</h2>
                    <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
                </header>

                {stage === 'form' && (
                    <form onSubmit={create} className={styles.modalBody}>
                        <div className={styles.field}>
                            <label>Cliente</label>
                            <ClientPicker
                                value={clientId}
                                onChange={setClientId}
                                placeholder="Selecione um cliente"
                            />
                            <small>Vincula este número WhatsApp a um cliente específico.</small>
                        </div>
                        <div className={styles.field}>
                            <label>Nome (opcional)</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="ex: WhatsApp Comercial"
                            />
                            <small>Identifica esta conexão na lista de integrações.</small>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowAdvanced(s => !s)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--accent-purple)',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: 0,
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            {showAdvanced ? '▼' : '▶'} Configurações avançadas
                        </button>

                        {showAdvanced && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 14px', background: 'var(--bg-surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                    Por padrão usamos a Evolution API global do TrafficAI.
                                    Use estes campos se você tem uma instância Evolution própria
                                    (ex: servidor dedicado por cliente, mais segurança).
                                </div>

                                <div className={styles.field}>
                                    <label>URL da Evolution API (override)</label>
                                    <input
                                        type="url"
                                        value={evolutionBaseUrl}
                                        onChange={e => setEvolutionBaseUrl(e.target.value)}
                                        placeholder="https://evolution.seudominio.com.br"
                                    />
                                    <small>Deixe vazio pra usar a global do trafficai.</small>
                                </div>

                                <div className={styles.field}>
                                    <label>API Key da Evolution (override)</label>
                                    <input
                                        type="password"
                                        value={evolutionApiKey}
                                        onChange={e => setEvolutionApiKey(e.target.value)}
                                        placeholder="••••••••"
                                    />
                                    <small>Necessária se você forneceu URL própria.</small>
                                </div>

                                <div className={styles.field}>
                                    <label>Eventos de webhook</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                        {WEBHOOK_EVENTS.map(ev => (
                                            <label
                                                key={ev.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    fontSize: 12,
                                                    color: 'var(--text-primary)',
                                                    cursor: 'pointer',
                                                    fontWeight: 400,
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedEvents.includes(ev.id)}
                                                    onChange={() => toggleEvent(ev.id)}
                                                    style={{ accentColor: 'var(--primary)' }}
                                                />
                                                <span>{ev.label}</span>
                                                {ev.recommended && (
                                                    <span style={{
                                                        fontSize: 9,
                                                        background: 'var(--primary-soft)',
                                                        color: 'var(--primary)',
                                                        padding: '1px 6px',
                                                        borderRadius: 8,
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                    }}>recomendado</span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {error && <div className={styles.errorBox}>{error}</div>}
                        <div className={styles.modalActions}>
                            <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancelar</button>
                            <button type="submit" disabled={submitting} className={styles.btnPrimary}>
                                {submitting ? <><Loader2 size={14} className={styles.spin} /> Criando instância…</> : 'Gerar QR Code'}
                            </button>
                        </div>
                    </form>
                )}

                {stage === 'qr' && (
                    <div className={styles.modalBody}>
                        {renderQr()}
                        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                            Aguardando escaneamento… (atualiza a cada 5s)
                        </div>
                    </div>
                )}

                {stage === 'connected' && (
                    <div className={styles.modalBody} style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ fontSize: 48 }}>✅</div>
                        <h3 style={{ margin: '12px 0 6px', color: 'var(--accent-green)' }}>Conectado!</h3>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            Suas próximas conversas começam a aparecer no dashboard automaticamente.
                        </p>
                    </div>
                )}

                {stage === 'error' && (
                    <div className={styles.modalBody}>
                        <div className={styles.errorBox}>{error}</div>
                        <small style={{ display: 'block', marginTop: 8, color: 'var(--text-muted)' }}>
                            Verifique se a Evolution API está configurada nas variáveis de ambiente do backend
                            (EVOLUTION_API_BASE_URL, EVOLUTION_API_KEY).
                        </small>
                        <div className={styles.modalActions}>
                            <button onClick={onClose} className={styles.btnSecondary}>Fechar</button>
                            <button onClick={() => { setStage('form'); setError(null); }} className={styles.btnPrimary}>
                                Tentar de novo
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
