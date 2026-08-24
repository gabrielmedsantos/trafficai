'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
    Calendar, Users, ClipboardList, MessageSquare, Coffee, Plus, Trash2,
    Edit3, Check, X, Sparkles, Clock, ChevronRight, Video, ExternalLink, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Kind = 'meeting' | 'checklist_camp' | 'checklist_client' | 'report_send' | 'custom';
type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

interface Routine {
    id: string;
    ad_account_id: string | null;
    ad_account_name?: string | null;
    kind: Kind;
    title: string;
    description: string | null;
    frequency: Frequency;
    days_of_week: number[];
    day_of_month: number | null;
    time_of_day: string | null;
    checklist_items: any[];
    is_active: boolean;
    display_order: number;
    is_done?: boolean;
}

interface DayItems {
    date: string;
    day_of_week: number;
    items: Routine[];
}

const KIND_META: Record<Kind, { label: string; icon: any; color: string }> = {
    meeting:          { label: 'Reunião',                icon: Users,         color: '#5b8def' },
    checklist_camp:   { label: 'Checklist Campanhas',    icon: ClipboardList, color: '#ff6b35' },
    checklist_client: { label: 'Checklist Cliente',      icon: Users,         color: '#f5a45a' },
    report_send:      { label: 'Envio de Relatório',     icon: MessageSquare, color: '#7bc46c' },
    custom:           { label: 'Tarefa',                 icon: Coffee,        color: '#a89f92' },
};

const FREQ_LABEL: Record<Frequency, string> = {
    daily: 'Todo dia',
    weekly: 'Semanal',
    biweekly: 'Quinzenal',
    monthly: 'Mensal',
    custom: 'Personalizada',
};

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
    const [today, setToday] = useState<{ date: string; items: Routine[] } | null>(null);
    const [week, setWeek] = useState<DayItems[]>([]);
    const [routines, setRoutines] = useState<Routine[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Routine | null>(null);
    // Fontes externas unificadas
    const [gcalEvents, setGcalEvents] = useState<any[]>([]);
    const [gcalStatus, setGcalStatus] = useState<{ connected: boolean; email: string | null; configured: boolean }>({ connected: false, email: null, configured: false });
    const [optimTasks, setOptimTasks] = useState<any[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
            const weekEndStr = weekEnd.toISOString().slice(0, 10);

            const [t, w, r, a, gcal, gcalSt, tasks] = await Promise.all([
                api.getRoutinesToday(),
                api.getRoutinesWeek(),
                api.listRoutinesConfig(),
                api.getActiveAccounts().catch(() => []),
                api.getRoutineGoogleEvents(todayStr, weekEndStr),
                api.getRoutineGoogleStatus(),
                api.listOptimizationTasks(todayStr, weekEndStr),
            ]);
            setToday(t as any);
            setWeek(w as any);
            setRoutines(r as any);
            setAccounts(a as any);
            setGcalEvents(Array.isArray(gcal) ? gcal : (gcal as any)?.events || (gcal as any)?.data || []);
            setGcalStatus(gcalSt as any);
            setOptimTasks(Array.isArray(tasks) ? tasks : (tasks as any)?.tasks || (tasks as any)?.data || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleDone = async (routineId: string, isDone: boolean) => {
        try {
            await api.markRoutineDone(routineId, !isDone);
            load();
        } catch { /* silent */ }
    };

    const openNew = () => { setEditing(null); setDrawerOpen(true); };
    const openEdit = (r: Routine) => { setEditing(r); setDrawerOpen(true); };

    const now = new Date();
    const greetings =
        now.getHours() < 12 ? 'Bom dia' :
        now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
    const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    const doneCount = today?.items.filter(i => i.is_done).length || 0;
    const totalCount = today?.items.length || 0;
    const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    return (
        <div className="fade-in">
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Sparkles size={22} color="var(--primary)" />
                        {greetings}
                    </h1>
                    <p style={{ textTransform: 'capitalize' }}>{dateLabel}</p>
                </div>
                <button className="btn btn-primary" onClick={openNew}>
                    <Plus size={16} /> Nova rotina
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }} /> Carregando sua agenda…
                </div>
            ) : (
                <>
                    {/* Progresso do dia */}
                    {totalCount > 0 && (
                        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                        Progresso de hoje
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                                        {doneCount} <span style={{ color: 'var(--text-muted)', fontSize: 18, fontWeight: 500 }}>/ {totalCount}</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: 34, fontWeight: 700, color: progressPct === 100 ? 'var(--success)' : 'var(--primary)' }}>
                                    {progressPct}%
                                </div>
                            </div>
                            <div style={{ height: 8, background: 'var(--bg-elev)', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{
                                    width: `${progressPct}%`,
                                    height: '100%',
                                    background: progressPct === 100 ? 'var(--success)' : 'var(--primary)',
                                    transition: 'width 300ms ease',
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Hoje */}
                    <section style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Calendar size={18} color="var(--primary)" />
                            Hoje
                        </h2>

                        {totalCount === 0 ? (
                            <div className="card" style={{ padding: 40, textAlign: 'center' }}>
                                <Coffee size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
                                <h3 style={{ marginBottom: 8 }}>Sem rotinas configuradas ainda</h3>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: 20, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', fontSize: 14 }}>
                                    Configure sua rotina de trabalho: reuniões semanais, checklists de campanhas, dias de envio de relatório. A agenda vai mostrar tudo automaticamente pra você.
                                </p>
                                <button className="btn btn-primary" onClick={openNew}>
                                    <Plus size={16} /> Criar minha primeira rotina
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 12 }}>
                                {today!.items.map(item => (
                                    <RoutineCard
                                        key={item.id}
                                        item={item}
                                        onToggle={() => toggleDone(item.id, !!item.is_done)}
                                        onEdit={() => openEdit(item)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Eventos do Google Calendar (próximos 7 dias) */}
                    {gcalStatus.connected && gcalEvents.length > 0 && (
                        <section style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                                    <Video size={18} color="#5b8def" />
                                    Reuniões · Google Calendar
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({gcalEvents.length})</span>
                                </h2>
                                <Link href="/rotina" style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    Editar em Rotina <ExternalLink size={12} />
                                </Link>
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {gcalEvents.slice(0, 8).map((ev: any) => {
                                    const start = new Date(ev.start);
                                    const dLabel = start.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
                                    const tLabel = ev.allDay ? 'Dia todo' : start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div key={ev.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, borderLeft: '3px solid #5b8def' }}>
                                            <div style={{ minWidth: 90, fontSize: 12, color: 'var(--text-secondary)' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{dLabel}</div>
                                                <div style={{ fontSize: 11 }}>{tLabel}</div>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {ev.title || 'Sem título'}
                                                </div>
                                                {ev.attendees && ev.attendees.length > 0 && (
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                        {ev.attendees.length} participante{ev.attendees.length > 1 ? 's' : ''}
                                                    </div>
                                                )}
                                            </div>
                                            {ev.meetLink && (
                                                <a href={ev.meetLink} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 11, padding: '4px 10px' }}>
                                                    <Video size={11} /> Entrar
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Otimizações de campanha programadas */}
                    {optimTasks.length > 0 && (
                        <section style={{ marginBottom: 32 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h2 style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                                    <Zap size={18} color="#ff6b35" />
                                    Otimizações de Campanha
                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({optimTasks.length})</span>
                                </h2>
                                <Link href="/otimizacoes" style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    Editar em Otimizações <ExternalLink size={12} />
                                </Link>
                            </div>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {optimTasks.slice(0, 8).map((task: any) => {
                                    const done = task.completed || task.status === 'done' || task.status === 'completed';
                                    const dateStr = task.scheduled_date || task.date || task.due_date;
                                    const d = dateStr ? new Date(dateStr) : null;
                                    return (
                                        <div key={task.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, borderLeft: '3px solid #ff6b35', opacity: done ? 0.55 : 1 }}>
                                            <div style={{ width: 22, height: 22, borderRadius: 6, background: done ? '#7bc46c' : 'transparent', border: `2px solid ${done ? '#7bc46c' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                                {done && <Check size={12} strokeWidth={3} />}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: done ? 'line-through' : 'none' }}>
                                                    {task.title || task.name || task.type || 'Tarefa de otimização'}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {task.account_name && <span>{task.account_name} · </span>}
                                                    {d ? d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Próximos dias */}
                    {week.length > 0 && (
                        <section style={{ marginBottom: 32 }}>
                            <h2 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <ChevronRight size={18} color="var(--primary)" />
                                Próximos dias
                            </h2>
                            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                                {week.slice(1, 7).map(day => {
                                    const d = new Date(day.date + 'T12:00:00');
                                    return (
                                        <div key={day.date} className="card" style={{ padding: 14 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                {DAYS[day.day_of_week]}
                                            </div>
                                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                                {d.getDate()}/{d.getMonth() + 1}
                                            </div>
                                            {day.items.length === 0 ? (
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem compromissos</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    {day.items.slice(0, 3).map(it => {
                                                        const meta = KIND_META[it.kind];
                                                        return (
                                                            <div key={it.id} style={{ fontSize: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
                                                                {it.title}
                                                            </div>
                                                        );
                                                    })}
                                                    {day.items.length > 3 && (
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+ {day.items.length - 3} mais</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Todas as rotinas configuradas */}
                    {routines.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <ClipboardList size={18} color="var(--primary)" />
                                Rotinas configuradas <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>({routines.length})</span>
                            </h2>
                            <div style={{ display: 'grid', gap: 8 }}>
                                {routines.map(r => (
                                    <RoutineListRow key={r.id} r={r} onEdit={() => openEdit(r)} onReload={load} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            {drawerOpen && (
                <RoutineDrawer
                    editing={editing}
                    accounts={accounts}
                    onClose={() => setDrawerOpen(false)}
                    onSaved={() => { setDrawerOpen(false); load(); }}
                />
            )}
        </div>
    );
}

// ─── Card do item do dia ──────────────────────────────────────────────────────

function RoutineCard({ item, onToggle, onEdit }: { item: Routine; onToggle: () => void; onEdit: () => void }) {
    const meta = KIND_META[item.kind];
    const Icon = meta.icon;
    return (
        <div className="card" style={{
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            opacity: item.is_done ? 0.6 : 1,
            borderLeft: `3px solid ${meta.color}`,
        }}>
            <button
                onClick={onToggle}
                style={{
                    flexShrink: 0,
                    width: 26, height: 26,
                    borderRadius: 8,
                    border: `2px solid ${item.is_done ? 'var(--success)' : 'var(--border)'}`,
                    background: item.is_done ? 'var(--success)' : 'transparent',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                }}
                aria-label={item.is_done ? 'Desmarcar' : 'Marcar como feito'}
            >
                {item.is_done && <Check size={14} strokeWidth={3} />}
            </button>

            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} color={meta.color} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', textDecoration: item.is_done ? 'line-through' : 'none' }}>
                        {item.title}
                    </div>
                    {item.ad_account_name && (
                        <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-elev)', borderRadius: 6, color: 'var(--text-secondary)' }}>
                            {item.ad_account_name}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span>{meta.label}</span>
                    {item.time_of_day && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {item.time_of_day.slice(0, 5)}</span>}
                    {item.description && <span>· {item.description.slice(0, 60)}{item.description.length > 60 ? '…' : ''}</span>}
                </div>
            </div>

            <button onClick={onEdit} className="btn btn-icon" title="Editar" style={{ flexShrink: 0 }}>
                <Edit3 size={15} />
            </button>
        </div>
    );
}

// ─── Linha da lista completa ──────────────────────────────────────────────────

function RoutineListRow({ r, onEdit, onReload }: { r: Routine; onEdit: () => void; onReload: () => void }) {
    const meta = KIND_META[r.kind];
    const Icon = meta.icon;
    const [busy, setBusy] = useState(false);

    const toggleActive = async () => {
        setBusy(true);
        try { await api.updateRoutineConfig(r.id, { is_active: !r.is_active }); onReload(); }
        finally { setBusy(false); }
    };
    const del = async () => {
        if (!confirm(`Remover a rotina "${r.title}"?`)) return;
        setBusy(true);
        try { await api.deleteRoutineConfig(r.id); onReload(); }
        finally { setBusy(false); }
    };

    const freqDetail =
        r.frequency === 'daily' ? 'Todo dia' :
        r.frequency === 'weekly' ? (r.days_of_week?.map(d => DAYS[d]).join(', ') || 'Semanal') :
        r.frequency === 'biweekly' ? `A cada 2 sem. (${r.days_of_week?.map(d => DAYS[d]).join(', ') || '—'})` :
        r.frequency === 'monthly' ? `Dia ${r.day_of_month} de cada mês` :
        'Personalizada';

    return (
        <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, opacity: r.is_active ? 1 : 0.55 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} color={meta.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {meta.label} · {freqDetail}
                    {r.ad_account_name && ` · ${r.ad_account_name}`}
                    {r.time_of_day && ` · ${r.time_of_day.slice(0, 5)}`}
                </div>
            </div>
            <button
                onClick={toggleActive}
                disabled={busy}
                className="btn"
                style={{ fontSize: 12, padding: '5px 10px', background: r.is_active ? 'var(--success)' : 'var(--bg-elev)', color: r.is_active ? '#fff' : 'var(--text-secondary)' }}
                title={r.is_active ? 'Pausar rotina' : 'Ativar rotina'}
            >
                {r.is_active ? 'Ativa' : 'Pausada'}
            </button>
            <button onClick={onEdit} className="btn btn-icon" title="Editar"><Edit3 size={14} /></button>
            <button onClick={del} className="btn btn-icon" title="Remover" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
        </div>
    );
}

// ─── Drawer de criação/edição ─────────────────────────────────────────────────

function RoutineDrawer({ editing, accounts, onClose, onSaved }: {
    editing: Routine | null;
    accounts: any[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        kind: editing?.kind || 'meeting' as Kind,
        title: editing?.title || '',
        description: editing?.description || '',
        ad_account_id: editing?.ad_account_id || '',
        frequency: editing?.frequency || 'weekly' as Frequency,
        days_of_week: editing?.days_of_week || [],
        day_of_month: editing?.day_of_month || null as number | null,
        time_of_day: editing?.time_of_day?.slice(0, 5) || '',
        checklist_items: editing?.checklist_items || [] as any[],
        is_active: editing?.is_active ?? true,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const toggleDay = (d: number) => {
        setForm(f => ({
            ...f,
            days_of_week: f.days_of_week.includes(d)
                ? f.days_of_week.filter(x => x !== d)
                : [...f.days_of_week, d].sort()
        }));
    };

    const save = async () => {
        setError('');
        if (!form.title.trim()) { setError('Título é obrigatório'); return; }
        if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.days_of_week.length === 0) {
            setError('Escolha pelo menos 1 dia da semana');
            return;
        }
        if (form.frequency === 'monthly' && !form.day_of_month) {
            setError('Escolha o dia do mês');
            return;
        }
        setSaving(true);
        try {
            const payload: any = {
                ...form,
                ad_account_id: form.ad_account_id || null,
                time_of_day: form.time_of_day || null,
            };
            if (editing) await api.updateRoutineConfig(editing.id, payload);
            else await api.createRoutineConfig(payload);
            onSaved();
        } catch (e: any) {
            setError(e.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <aside className="drawer" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
                <div className="drawer-header">
                    <h3>{editing ? 'Editar rotina' : 'Nova rotina'}</h3>
                    <button onClick={onClose} className="btn btn-icon"><X size={16} /></button>
                </div>

                <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Tipo */}
                    <div className="form-group">
                        <label className="form-label">Tipo</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                            {(Object.keys(KIND_META) as Kind[]).map(k => {
                                const m = KIND_META[k];
                                const Ic = m.icon;
                                const active = form.kind === k;
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => setForm(f => ({ ...f, kind: k }))}
                                        className="btn"
                                        style={{
                                            padding: '10px 12px',
                                            border: active ? `2px solid ${m.color}` : '1px solid var(--border)',
                                            background: active ? `${m.color}12` : 'var(--bg-elev)',
                                            color: active ? m.color : 'var(--text-primary)',
                                            fontSize: 13,
                                            fontWeight: active ? 600 : 500,
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Ic size={14} /> {m.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Título + descrição */}
                    <div className="form-group">
                        <label className="form-label">Título *</label>
                        <input
                            className="form-input"
                            placeholder={
                                form.kind === 'meeting' ? 'Ex: Reunião semanal com cliente X' :
                                form.kind === 'checklist_camp' ? 'Ex: Revisar CTR e CPM das campanhas' :
                                form.kind === 'report_send' ? 'Ex: Enviar relatório semanal' :
                                'Ex: Descrição da tarefa'
                            }
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Descrição (opcional)</label>
                        <textarea
                            className="form-input"
                            rows={2}
                            placeholder="Detalhes ou instruções pra essa rotina"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        />
                    </div>

                    {/* Cliente (opcional) */}
                    <div className="form-group">
                        <label className="form-label">Cliente (deixe em branco = rotina geral)</label>
                        <select
                            className="form-input"
                            value={form.ad_account_id}
                            onChange={e => setForm(f => ({ ...f, ad_account_id: e.target.value }))}
                        >
                            <option value="">— Rotina geral (aplica a todos) —</option>
                            {accounts.map((a: any) => (
                                <option key={a.id} value={a.id}>{a.account_name || a.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Frequência */}
                    <div className="form-group">
                        <label className="form-label">Frequência</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
                            {(Object.keys(FREQ_LABEL) as Frequency[]).map(fr => (
                                <button
                                    key={fr}
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, frequency: fr }))}
                                    className="btn"
                                    style={{
                                        padding: '8px 6px',
                                        fontSize: 12,
                                        border: form.frequency === fr ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: form.frequency === fr ? 'rgba(255,107,53,0.08)' : 'var(--bg-elev)',
                                        color: form.frequency === fr ? 'var(--primary)' : 'var(--text-primary)',
                                        fontWeight: form.frequency === fr ? 600 : 500,
                                    }}
                                >
                                    {FREQ_LABEL[fr]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dias da semana */}
                    {(form.frequency === 'weekly' || form.frequency === 'biweekly') && (
                        <div className="form-group">
                            <label className="form-label">Em quais dias?</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {DAYS.map((d, i) => {
                                    const active = form.days_of_week.includes(i);
                                    return (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => toggleDay(i)}
                                            className="btn"
                                            style={{
                                                width: 48, height: 40,
                                                padding: 0,
                                                border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                background: active ? 'var(--primary)' : 'var(--bg-elev)',
                                                color: active ? '#fff' : 'var(--text-primary)',
                                                fontSize: 13,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {d}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Dia do mês */}
                    {form.frequency === 'monthly' && (
                        <div className="form-group">
                            <label className="form-label">Dia do mês</label>
                            <input
                                type="number"
                                className="form-input"
                                min={1}
                                max={31}
                                placeholder="Ex: 5"
                                value={form.day_of_month || ''}
                                onChange={e => setForm(f => ({ ...f, day_of_month: e.target.value ? Number(e.target.value) : null }))}
                                style={{ maxWidth: 120 }}
                            />
                        </div>
                    )}

                    {/* Hora */}
                    <div className="form-group">
                        <label className="form-label">Hora (opcional)</label>
                        <input
                            type="time"
                            className="form-input"
                            value={form.time_of_day}
                            onChange={e => setForm(f => ({ ...f, time_of_day: e.target.value }))}
                            style={{ maxWidth: 160 }}
                        />
                    </div>

                    {/* Info integração relatório */}
                    {form.kind === 'report_send' && (
                        <div style={{ padding: 14, background: 'rgba(123,196,108,0.08)', border: '1px solid rgba(123,196,108,0.25)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            <strong>📤 Envio automático:</strong> essa rotina vai disparar o envio do relatório WhatsApp do cliente selecionado nos dias/horários configurados aqui. Sobrescreve a configuração antiga da página "Diário WhatsApp".
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ padding: 12, background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: 8, color: 'var(--danger)', fontSize: 13, margin: '0 20px' }}>
                        {error}
                    </div>
                )}

                <div className="drawer-footer" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                        {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar rotina'}
                    </button>
                </div>
            </aside>
        </div>
    );
}
