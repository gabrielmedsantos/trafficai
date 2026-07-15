'use client';

import { useEffect, useState, useCallback } from 'react';
import { Share2, Plus, Copy, Check, Trash2, Lock, Eye, X, Loader2, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './share-links.module.css';

interface ShareLink {
    id: string;
    token: string;
    name: string;
    filters: any;
    client_id: string | null;
    client_name?: string | null;
    client_color?: string | null;
    expires_at: string | null;
    access_count: number;
    last_accessed_at: string | null;
    active: boolean;
    has_password: boolean;
    created_at: string;
}

const PERIODS = [
    { value: 'today', label: 'Hoje' },
    { value: '7d', label: '7 dias' },
    { value: '30d', label: '30 dias' },
    { value: '90d', label: '90 dias' },
];

const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
}) : '—';

export default function ShareLinksPage() {
    const [links, setLinks] = useState<ShareLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        api.listCommercialShareLinks()
            .then(setLinks)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

    const copyLink = async (link: ShareLink) => {
        const url = `${baseUrl}/d/${link.token}`;
        await navigator.clipboard.writeText(url);
        setCopiedId(link.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Revogar "${name}"? Quem tem o link vai parar de acessar imediatamente.`)) return;
        try {
            await api.deleteCommercialShareLink(id);
            load();
        } catch (e: any) {
            alert(e.message);
        }
    };

    const handleToggleActive = async (link: ShareLink) => {
        try {
            await api.updateCommercialShareLink(link.id, { active: !link.active });
            load();
        } catch (e: any) {
            alert(e.message);
        }
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <Share2 size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Links de Compartilhamento</h1>
                    </div>
                    <p className={styles.subtitle}>Crie URLs públicas read-only do dashboard</p>
                </div>
                <button onClick={() => setShowModal(true)} className={styles.btnPrimary}>
                    <Plus size={14} /> Novo link
                </button>
            </header>

            {loading && <div className={styles.empty}>Carregando…</div>}

            {!loading && links.length === 0 && (
                <div className={styles.emptyBig}>
                    <div className={styles.emptyIcon}>
                        <Share2 size={32} strokeWidth={1.5} />
                    </div>
                    <h2>Nenhum link criado ainda</h2>
                    <p>Compartilhe o dashboard com clientes ou diretoria via URL pública read-only.</p>
                    <button onClick={() => setShowModal(true)} className={styles.btnPrimary} style={{ marginTop: 16 }}>
                        <Plus size={14} /> Criar primeiro link
                    </button>
                </div>
            )}

            {!loading && links.length > 0 && (
                <div className={styles.list}>
                    {links.map(link => {
                        const url = `${baseUrl}/d/${link.token}`;
                        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
                        const period = link.filters?.period || '30d';
                        return (
                            <div key={link.id} className={`${styles.card} ${!link.active || isExpired ? styles.cardInactive : ''}`}>
                                <div className={styles.cardMain}>
                                    <div className={styles.cardName}>
                                        {link.name}
                                        {link.client_name && (
                                            <span className={styles.badge} style={{ background: `${link.client_color}1a`, color: link.client_color || 'var(--accent-purple)', border: `1px solid ${link.client_color || 'var(--accent-purple)'}` }}>
                                                <span style={{ width: 6, height: 6, background: link.client_color || 'var(--accent-purple)', borderRadius: 3, display: 'inline-block', marginRight: 4 }} />
                                                {link.client_name}
                                            </span>
                                        )}
                                        {!link.active && <span className={styles.badge} style={{ background: 'var(--bg-surface-2)', color: 'var(--text-muted)' }}>desativado</span>}
                                        {isExpired && <span className={styles.badge} style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--accent-red)' }}>expirado</span>}
                                        {link.has_password && <span className={styles.badge} style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}><Lock size={9} /> com senha</span>}
                                    </div>
                                    <div className={styles.cardMeta}>
                                        <span>Período: {PERIODS.find(p => p.value === period)?.label || period}</span>
                                        <span>·</span>
                                        <span><Eye size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> {link.access_count} acessos</span>
                                        {link.last_accessed_at && (
                                            <>
                                                <span>·</span>
                                                <span>Último: {fmtDate(link.last_accessed_at)}</span>
                                            </>
                                        )}
                                        {link.expires_at && (
                                            <>
                                                <span>·</span>
                                                <span>Expira em {fmtDate(link.expires_at)}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className={styles.urlBox}>
                                        <code>{url}</code>
                                    </div>
                                </div>
                                <div className={styles.cardActions}>
                                    <button
                                        onClick={() => copyLink(link)}
                                        className={styles.actionBtn}
                                        title="Copiar URL"
                                    >
                                        {copiedId === link.id ? <Check size={14} style={{ color: 'var(--accent-green)' }} /> : <Copy size={14} />}
                                    </button>
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.actionBtn}
                                        title="Abrir em nova aba"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                    <button
                                        onClick={() => handleToggleActive(link)}
                                        className={styles.actionBtn}
                                        title={link.active ? 'Desativar' : 'Reativar'}
                                    >
                                        {link.active ? '🔴' : '🟢'}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(link.id, link.name)}
                                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                        title="Revogar"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && <CreateLinkModal onClose={() => setShowModal(false)} onCreated={load} />}
        </div>
    );
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function CreateLinkModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [clientId, setClientId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            await api.createCommercialShareLink({
                name: name.trim(),
                filters: { ...(clientId && { clientId }) },
                ...(clientId && { clientId }),
                ...(password.trim() && { password: password.trim() }),
                ...(expiresAt && { expiresAt: new Date(expiresAt).toISOString() }),
            });
            onCreated();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <div className={styles.modalBackdrop} onClick={onClose} />
            <div className={styles.modal}>
                <header className={styles.modalHeader}>
                    <h2>Criar link público</h2>
                    <button onClick={onClose} className={styles.modalClose}><X size={18} /></button>
                </header>
                <form onSubmit={submit} className={styles.modalBody}>
                    <div className={styles.field}>
                        <label>Nome *</label>
                        <input
                            type="text" required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="ex: Diretoria — relatório mensal"
                            autoFocus
                        />
                        <small>Identificação interna do link (não aparece pra quem acessa).</small>
                    </div>

                    <div className={styles.field}>
                        <label>Cliente</label>
                        <ClientPicker
                            value={clientId}
                            onChange={setClientId}
                            placeholder="Todos os clientes"
                        />
                        <small>Cliente cujo dashboard será compartilhado. Quem acessar o link escolhe o período (hoje, 7d, 30d, 90d).</small>
                    </div>

                    <div className={styles.field}>
                        <label>Senha (opcional)</label>
                        <input
                            type="text"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="deixe em branco pra acesso livre"
                        />
                        <small>Se preenchida, quem abrir o link precisa digitar a senha.</small>
                    </div>

                    <div className={styles.field}>
                        <label>Expira em (opcional)</label>
                        <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={e => setExpiresAt(e.target.value)}
                        />
                        <small>Após esta data, o link para de funcionar automaticamente.</small>
                    </div>

                    {error && <div className={styles.errorBox}>{error}</div>}

                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.btnSecondary}>Cancelar</button>
                        <button type="submit" disabled={submitting} className={styles.btnPrimary}>
                            {submitting ? <><Loader2 size={14} className={styles.spin} /> Criando…</> : 'Criar link'}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
