'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Phone, Mail, Calendar, MessageCircle, RefreshCw, Check } from 'lucide-react';
import { api } from '@/lib/api';
import ClientPicker from '../_components/ClientPicker';
import styles from './tasks.module.css';

interface Task {
    id: string;
    title: string;
    description: string | null;
    type: string | null;
    due_at: string | null;
    completed_at: string | null;
    status: 'pending' | 'completed' | 'overdue' | 'cancelled';
    salesperson_name: string | null;
    salesperson_color: string | null;
    contact_name: string | null;
    deal_value: string | null;
    bucket: 'completed' | 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date';
}

const BUCKETS: { key: Task['bucket']; label: string; color: string }[] = [
    { key: 'overdue', label: 'Atrasadas', color: 'var(--accent-red)' },
    { key: 'today', label: 'Hoje', color: 'var(--accent-yellow)' },
    { key: 'tomorrow', label: 'Amanhã', color: 'var(--accent-blue)' },
    { key: 'this_week', label: 'Esta semana', color: 'var(--accent-purple)' },
    { key: 'later', label: 'Mais tarde', color: 'var(--text-secondary)' },
    { key: 'no_date', label: 'Sem prazo', color: 'var(--text-muted)' },
    { key: 'completed', label: 'Concluídas', color: 'var(--accent-green)' },
];

const ICONS: Record<string, any> = {
    call: Phone, meeting: Calendar, email: Mail,
    whatsapp: MessageCircle, follow_up: RefreshCw,
};

const fmtDue = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const fmtBRL = (v: string | null) => {
    if (!v) return '';
    return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [salespersonId, setSalespersonId] = useState('');
    const [clientId, setClientId] = useState('');
    const [salespeople, setSalespeople] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getCommercialSalespeople(clientId || undefined).then(setSalespeople);
    }, [clientId]);

    const load = useCallback(() => {
        setLoading(true);
        api.getCommercialTasks({
            ...(salespersonId && { salespersonId }),
            ...(clientId && { clientId }),
            noPeriod: true,
        })
            .then(setTasks)
            .finally(() => setLoading(false));
    }, [salespersonId, clientId]);

    useEffect(() => { load(); }, [load]);

    const complete = async (id: string) => {
        await api.completeCommercialTask(id);
        load();
    };

    const grouped = BUCKETS.map(b => ({ ...b, items: tasks.filter(t => t.bucket === b.key) }));

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <div className={styles.title}>
                        <CheckSquare size={22} className={styles.titleIcon} strokeWidth={2} />
                        <h1 className={styles.titleText}>Tarefas</h1>
                    </div>
                    <p className={styles.subtitle}>{tasks.length} tarefas</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <ClientPicker value={clientId} onChange={setClientId} />
                    <select value={salespersonId} onChange={e => setSalespersonId(e.target.value)} className={styles.select}>
                        <option value="">Todos os vendedores</option>
                        {salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
            </header>

            {loading && <div className={styles.empty}>Carregando…</div>}

            {!loading && grouped.map(g => g.items.length > 0 && (
                <section key={g.key} className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.bucketDot} style={{ background: g.color }} />
                        <h2 className={styles.sectionTitle}>{g.label}</h2>
                        <span className={styles.sectionCount}>{g.items.length}</span>
                    </div>
                    <div className={styles.taskList}>
                        {g.items.map(t => {
                            const Icon = ICONS[t.type || ''] || CheckSquare;
                            const done = t.status === 'completed';
                            return (
                                <div key={t.id} className={`${styles.taskCard} ${done ? styles.taskDone : ''}`}>
                                    <button
                                        className={styles.checkBtn}
                                        onClick={() => !done && complete(t.id)}
                                        disabled={done}
                                        title={done ? 'Concluída' : 'Marcar como concluída'}
                                    >
                                        {done ? <Check size={14} /> : null}
                                    </button>
                                    <div className={styles.taskMain}>
                                        <div className={styles.taskTitle}>
                                            <Icon size={12} strokeWidth={2} style={{ marginRight: 6, verticalAlign: '-1px', color: 'var(--text-muted)' }} />
                                            {t.title}
                                        </div>
                                        <div className={styles.taskMeta}>
                                            {t.contact_name && <span>{t.contact_name}</span>}
                                            {t.deal_value && <span>· {fmtBRL(t.deal_value)}</span>}
                                            {t.due_at && <span>· vence {fmtDue(t.due_at)}</span>}
                                        </div>
                                    </div>
                                    {t.salesperson_name && (
                                        <div className={styles.taskSp}>
                                            <span className={styles.spDot} style={{ background: t.salesperson_color || '#6b7388' }} />
                                            {t.salesperson_name}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}

            {!loading && tasks.length === 0 && <div className={styles.empty}>Sem tarefas</div>}
        </div>
    );
}
