'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { Calendar, Plus, Video, Users, ChevronLeft, ChevronRight, X, ExternalLink } from 'lucide-react';

type EventRow = {
    id?: string;
    google_event_id?: string;
    title?: string;
    summary?: string;
    description?: string;
    start_at?: string;
    end_at?: string;
    meet_link?: string | null;
    html_link?: string;
    client_id?: string | null;
};

export default function CalendarPage() {
    const [connected, setConnected] = useState<boolean | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [month, setMonth] = useState(() => new Date());
    const [events, setEvents] = useState<EventRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [clients, setClients] = useState<any[]>([]);

    const [form, setForm] = useState({
        title: '',
        description: '',
        date: new Date().toISOString().slice(0, 10),
        startTime: '10:00',
        endTime: '11:00',
        clientId: '',
        attendees: '',
        createMeet: true,
    });

    useEffect(() => {
        api.googleOAuthStatus().then(s => {
            setConnected(s.connected);
            setEmail(s.email);
        }).catch(() => setConnected(false));
        api.getClientsList().then(setClients).catch(() => {});
    }, []);

    useEffect(() => {
        if (!connected) return;
        loadEvents();
    }, [month, connected]);

    async function loadEvents() {
        setLoading(true);
        try {
            const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
            const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59).toISOString();
            const data = await api.googleCalendarList(from, to);
            setEvents(data);
        } catch { setEvents([]); }
        finally { setLoading(false); }
    }

    async function connectGoogle() {
        const { url } = await api.googleOAuthConnect();
        const w = window.open(url, 'g', 'width=500,height=650');
        const iv = setInterval(async () => {
            if (w?.closed) {
                clearInterval(iv);
                const s = await api.googleOAuthStatus();
                setConnected(s.connected);
                setEmail(s.email);
            }
        }, 1000);
    }

    async function createEvent(e: React.FormEvent) {
        e.preventDefault();
        try {
            const startAt = new Date(`${form.date}T${form.startTime}:00-03:00`).toISOString();
            const endAt = new Date(`${form.date}T${form.endTime}:00-03:00`).toISOString();
            const attendees = form.attendees.split(',').map(s => s.trim()).filter(Boolean);
            await api.googleCalendarCreate({
                title: form.title,
                description: form.description,
                startAt, endAt,
                clientId: form.clientId || undefined,
                attendees: attendees.length ? attendees : undefined,
                createMeet: form.createMeet,
            });
            setShowModal(false);
            setForm({ ...form, title: '', description: '', attendees: '' });
            loadEvents();
        } catch (err: any) { alert('Erro: ' + err.message); }
    }

    const eventsByDay = useMemo(() => {
        const m = new Map<string, EventRow[]>();
        for (const ev of events) {
            const d = (ev.start_at || '').slice(0, 10);
            if (!d) continue;
            if (!m.has(d)) m.set(d, []);
            m.get(d)!.push(ev);
        }
        return m;
    }, [events]);

    const days = useMemo(() => buildCalendarGrid(month), [month]);
    const monthName = month.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    if (connected === null) {
        return <div className="fade-in" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>;
    }

    if (!connected) {
        return (
            <div className="fade-in">
                <div className="page-header">
                    <div>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Calendar size={26} /> Agenda / Reuniões</h1>
                        <p>Sincronize com Google Calendar para agendar reuniões com clientes</p>
                    </div>
                </div>
                <div className="card" style={{ padding: 60, textAlign: 'center' }}>
                    <Calendar size={48} style={{ margin: '0 auto 20px', color: 'var(--text-muted)' }} />
                    <h2 style={{ margin: '0 0 12px' }}>Conecte seu Google</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
                        Sincronize agenda e crie reuniões com Google Meet direto do TrafficAI.
                    </p>
                    <button className="btn btn-primary" onClick={connectGoogle}>Conectar Google</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Calendar size={26} /> Agenda / Reuniões</h1>
                    <p>Sincronizado com {email || 'Google'} — todas as reuniões e eventos criam Meet automaticamente</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={16} /> Nova reunião
                </button>
            </div>

            <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                        <ChevronLeft size={16} />
                    </button>
                    <h2 style={{ margin: 0, textTransform: 'capitalize', fontSize: 18 }}>{monthName}</h2>
                    <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                        <ChevronRight size={16} />
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                        <div key={d} style={{ padding: 8, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{d}</div>
                    ))}
                    {days.map((d, i) => {
                        const dayStr = d.date.toISOString().slice(0, 10);
                        const dayEvs = eventsByDay.get(dayStr) || [];
                        const isToday = dayStr === new Date().toISOString().slice(0, 10);
                        return (
                            <div key={i} style={{
                                minHeight: 100, padding: 6, borderRadius: 6,
                                background: d.inMonth ? 'var(--bg-input)' : 'transparent',
                                border: isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
                                opacity: d.inMonth ? 1 : 0.35,
                                overflow: 'hidden',
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: isToday ? 'var(--primary)' : 'var(--text)' }}>{d.date.getDate()}</div>
                                {dayEvs.slice(0, 3).map((ev, j) => (
                                    <div key={j} title={ev.title || ev.summary} style={{
                                        fontSize: 10, padding: '2px 5px', marginBottom: 2, borderRadius: 3,
                                        background: 'var(--primary)', color: '#000',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                    }}>
                                        {ev.meet_link ? <Video size={9} /> : null}
                                        <span>{formatTime(ev.start_at)} {ev.title || ev.summary}</span>
                                    </div>
                                ))}
                                {dayEvs.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>+{dayEvs.length - 3}</div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Lista lateral: próximos eventos */}
            <div className="card" style={{ padding: 20, marginTop: 20 }}>
                <h3 style={{ margin: '0 0 16px' }}>Próximos ({events.length})</h3>
                {loading ? <p style={{ color: 'var(--text-muted)' }}>Carregando…</p> :
                events.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nenhum evento neste mês. Clique "Nova reunião" pra criar.</p> :
                <div style={{ display: 'grid', gap: 10 }}>
                    {events.slice(0, 20).map((ev, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: 12, background: 'var(--bg-input)', borderRadius: 8,
                        }}>
                            <div style={{ minWidth: 60, textAlign: 'center' }}>
                                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{new Date(ev.start_at || 0).getDate()}</div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{new Date(ev.start_at || 0).toLocaleString('pt-BR', { month: 'short' })}</div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{ev.title || ev.summary}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {formatTime(ev.start_at)} - {formatTime(ev.end_at)}
                                    {ev.description && ` · ${ev.description.slice(0, 60)}${ev.description.length > 60 ? '…' : ''}`}
                                </div>
                            </div>
                            {ev.meet_link && (
                                <a href={ev.meet_link} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: 'none', padding: '6px 12px' }}>
                                    <Video size={14} /> Meet
                                </a>
                            )}
                            {ev.html_link && (
                                <a href={ev.html_link} target="_blank" rel="noreferrer" style={{ color: 'var(--text-muted)' }}>
                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </div>
                    ))}
                </div>}
            </div>

            {/* Modal criar evento */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
                }} onClick={() => setShowModal(false)}>
                    <div className="card" style={{ padding: 24, width: '95%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ margin: 0 }}>Nova reunião</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={createEvent} style={{ display: 'grid', gap: 12 }}>
                            <Field label="Título *">
                                <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="input" placeholder="Ex: Reunião mensal — Space Garage" />
                            </Field>
                            <Field label="Descrição / pauta">
                                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input" rows={3} />
                            </Field>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                                <Field label="Data *">
                                    <input required type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="input" />
                                </Field>
                                <Field label="Início">
                                    <input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} className="input" />
                                </Field>
                                <Field label="Fim">
                                    <input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} className="input" />
                                </Field>
                            </div>
                            <Field label="Cliente (opcional)">
                                <select value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} className="input">
                                    <option value="">— nenhum —</option>
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </Field>
                            <Field label="Convidados (emails separados por vírgula)">
                                <input value={form.attendees} onChange={e => setForm({ ...form, attendees: e.target.value })} className="input" placeholder="cliente@empresa.com, socio@empresa.com" />
                            </Field>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
                                <input type="checkbox" checked={form.createMeet} onChange={e => setForm({ ...form, createMeet: e.target.checked })} />
                                <Video size={16} /> Criar link do Google Meet automaticamente
                            </label>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Criar reunião</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>{label}</label>
            {children}
        </div>
    );
}

function formatTime(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function buildCalendarGrid(month: Date): { date: Date; inMonth: boolean }[] {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push({ date: d, inMonth: d.getMonth() === month.getMonth() });
    }
    return days;
}
