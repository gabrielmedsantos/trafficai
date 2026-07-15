'use client';

import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, X, ChevronRight, Clock, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './conversations.module.css';

interface Conversation {
    id: string;
    contact_name: string | null;
    contact_phone: string;
    channel: string;
    status: 'open' | 'pending' | 'closed';
    last_message_at: string;
    last_message_direction: 'in' | 'out' | null;
    unanswered_since: string | null;
    message_count: number;
    first_response_seconds: number | null;
    salesperson_id: string | null;
    salesperson_name: string | null;
    salesperson_color: string | null;
    source_name: string | null;
    source_color: string | null;
}

interface Message {
    id: string;
    direction: 'in' | 'out';
    content: string | null;
    type: string;
    sent_at: string;
    sender_salesperson_id: string | null;
    media_url: string | null;
}

const fmtRelative = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const min = Math.floor(ms / 60_000);
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    return new Date(iso).toLocaleDateString('pt-BR');
};

const fmtResponseTime = (sec: number | null) => {
    if (sec == null) return '—';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}min`;
    return `${(sec / 3600).toFixed(1)}h`;
};

export default function ConversationsPage() {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterMode, setFilterMode] = useState<'' | 'unanswered'>('');
    const [salespersonId, setSalespersonId] = useState('');
    const [clientId, setClientId] = useState('');
    const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);

    // Suporte a query param ?filter=unanswered (vindo do drill-down do dashboard)
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get('filter') === 'unanswered') setFilterMode('unanswered');
    }, []);

    useEffect(() => {
        api.getCommercialSalespeople(clientId || undefined).then(setSalespeople).catch(() => {});
    }, [clientId]);

    const load = useCallback(() => {
        setLoading(true);
        api.getCommercialConversations({
            ...(filterStatus && { status: filterStatus }),
            ...(filterMode && { filter: filterMode }),
            ...(salespersonId && { salespersonId }),
            ...(clientId && { clientId }),
            noPeriod: true,
            page, limit: 25,
        })
            .then(d => { setConversations(d.rows); setTotal(d.total); })
            .finally(() => setLoading(false));
    }, [filterStatus, filterMode, salespersonId, clientId, page]);

    useEffect(() => { load(); }, [load]);

    const openDrawer = (c: Conversation) => {
        setSelected(c);
        setMessages([]);
        setLoadingMessages(true);
        api.getCommercialConversationMessages(c.id)
            .then(setMessages)
            .finally(() => setLoadingMessages(false));
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <MessageSquare size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Conversas</h1>
                    </div>
                    <p className={styles.subtitle}>{total} conversas{filterMode === 'unanswered' && ' sem resposta'}</p>
                </div>

                <div className={styles.filters}>
                    <ClientPicker value={clientId} onChange={v => { setClientId(v); setPage(1); }} />
                    <button onClick={() => { setFilterStatus(''); setFilterMode(''); setPage(1); }}
                        className={`${styles.chip} ${!filterStatus && !filterMode ? styles.chipActive : ''}`}>
                        Todas
                    </button>
                    <button onClick={() => { setFilterStatus('open'); setFilterMode(''); setPage(1); }}
                        className={`${styles.chip} ${filterStatus === 'open' ? styles.chipActive : ''}`}>
                        Em aberto
                    </button>
                    <button onClick={() => { setFilterStatus('pending'); setFilterMode(''); setPage(1); }}
                        className={`${styles.chip} ${filterStatus === 'pending' ? styles.chipActive : ''}`}>
                        Pendentes
                    </button>
                    <button onClick={() => { setFilterMode('unanswered'); setFilterStatus(''); setPage(1); }}
                        className={`${styles.chip} ${filterMode === 'unanswered' ? styles.chipActive : ''}`}>
                        Sem resposta
                    </button>
                    <button onClick={() => { setFilterStatus('closed'); setFilterMode(''); setPage(1); }}
                        className={`${styles.chip} ${filterStatus === 'closed' ? styles.chipActive : ''}`}>
                        Encerradas
                    </button>
                    <select value={salespersonId} onChange={e => { setSalespersonId(e.target.value); setPage(1); }}
                        className={styles.select}>
                        <option value="">Todos os vendedores</option>
                        {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </header>

            <div className={styles.list}>
                {loading && conversations.length === 0 && (
                    <div className={styles.empty}>Carregando…</div>
                )}
                {!loading && conversations.length === 0 && (
                    <div className={styles.empty}>Nenhuma conversa com esses filtros</div>
                )}
                {conversations.map(c => (
                    <button key={c.id} onClick={() => openDrawer(c)} className={styles.row}>
                        <div className={styles.avatar} style={{ background: c.salesperson_color || 'var(--bg-surface-2)' }}>
                            {(c.contact_name || c.contact_phone).slice(0, 1).toUpperCase()}
                        </div>
                        <div className={styles.rowMain}>
                            <div className={styles.rowName}>
                                {c.contact_name || c.contact_phone}
                                {c.unanswered_since && (
                                    <span className={styles.unansweredBadge}>
                                        <AlertCircle size={11} /> sem resposta
                                    </span>
                                )}
                            </div>
                            <div className={styles.rowMeta}>
                                <span>{c.contact_phone}</span>
                                <span>·</span>
                                <span>{c.message_count} mensagens</span>
                                {c.first_response_seconds != null && (
                                    <>
                                        <span>·</span>
                                        <span>1ª resposta em {fmtResponseTime(c.first_response_seconds)}</span>
                                    </>
                                )}
                                {c.source_name && (
                                    <>
                                        <span>·</span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: 3, background: c.source_color || '#6b7388' }} />
                                            {c.source_name}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className={styles.rowSide}>
                            <div className={styles.rowTime}>
                                <Clock size={11} /> {fmtRelative(c.last_message_at)}
                            </div>
                            <div className={styles.rowSalesperson}>
                                {c.salesperson_name ?? <span className={styles.unassigned}>sem dono</span>}
                            </div>
                        </div>
                        <ChevronRight size={16} className={styles.chev} />
                    </button>
                ))}
            </div>

            {/* Pagination */}
            {total > 25 && (
                <div className={styles.pagination}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className={styles.pageBtn}>
                        ← Anterior
                    </button>
                    <span className={styles.pageInfo}>Página {page} de {Math.ceil(total / 25)}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page * 25 >= total} className={styles.pageBtn}>
                        Próxima →
                    </button>
                </div>
            )}

            {/* Drawer lateral */}
            {selected && (
                <>
                    <div className={styles.drawerBackdrop} onClick={() => setSelected(null)} />
                    <aside className={styles.drawer}>
                        <header className={styles.drawerHeader}>
                            <div>
                                <h3>{selected.contact_name || selected.contact_phone}</h3>
                                <p>{selected.contact_phone} · {selected.message_count} mensagens</p>
                            </div>
                            <button onClick={() => setSelected(null)} className={styles.drawerClose}>
                                <X size={18} />
                            </button>
                        </header>
                        <div className={styles.drawerMessages}>
                            {loadingMessages && <div className={styles.empty}>Carregando mensagens…</div>}
                            {!loadingMessages && messages.length === 0 && <div className={styles.empty}>Sem mensagens</div>}
                            {messages.map(m => (
                                <div key={m.id} className={`${styles.msg} ${m.direction === 'out' ? styles.msgOut : styles.msgIn}`}>
                                    <div className={styles.msgBubble}>
                                        {m.content || <em>(mídia)</em>}
                                    </div>
                                    <div className={styles.msgTime}>
                                        {new Date(m.sent_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </>
            )}
        </div>
    );
}
