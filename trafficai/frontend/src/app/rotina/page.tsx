'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    ChevronLeft, ChevronRight, Plus, X, Check, Trash2, Link as LinkIcon,
    Video, UserPlus, ExternalLink,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const HOUR_HEIGHT = 64; // px por hora no grid
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    color?: string | null;
    colorId?: string | null;
    description?: string | null;
    meetLink?: string | null;
    attendees?: { email: string; status: string }[];
    source: 'google' | 'task';
    taskId?: string | null;
}

interface ReviewTask {
    id: string;
    account_name: string | null;
    schedule_id: string | null;
    scheduled_date: string;
    completed: boolean;
    notes: string | null;
    google_event_id: string | null;
}

interface ReviewSchedule {
    id: string;
    review_time: string;
}

interface EventForm {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    description: string;
    allDay: boolean;
    colorId: string;
    createMeet: boolean;
    attendees: string[];
    guestInput: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Workflow task config for rotina calendar
const WORKFLOW_TASK_CFG = {
    analysis:    { label: 'Análise',       color: '#8b5cf6', time: '09:00', duration: 10 },
    report:      { label: 'Relatório',     color: '#3b82f6', time: '08:30', duration: 10 },
    checkin_wed: { label: 'Check-in',      color: '#f59e0b', time: '10:00', duration: 10 },
    checkin_fri: { label: 'Check-in FDS',  color: '#10b981', time: '10:00', duration: 10 },
} as const;

const GOOGLE_COLORS: Record<string, string> = {
    '1': '#ef4444', '2': '#f97316', '3': '#f59e0b', '4': '#eab308',
    '5': '#22c55e', '6': '#16a34a', '7': '#06b6d4', '8': '#3b82f6',
    '9': '#8b5cf6', '10': '#ec4899', '11': '#6b7280', 'task': '#ff6b35',
};

const COLOR_OPTIONS = [
    { id: '8', label: 'Azul' }, { id: '5', label: 'Verde' }, { id: '1', label: 'Vermelho' },
    { id: '3', label: 'Laranja' }, { id: '9', label: 'Roxo' }, { id: '10', label: 'Rosa' },
    { id: '11', label: 'Cinza' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDays(base: Date): Date[] {
    const d = new Date(base);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const dd = new Date(d); dd.setDate(d.getDate() + i); return dd; });
}

function toDateStr(d: Date): string { return d.toISOString().split('T')[0]; }
function padZ(n: number): string { return n.toString().padStart(2, '0'); }
function fmtTime(iso: string): string {
    try { const d = new Date(iso); return `${padZ(d.getHours())}:${padZ(d.getMinutes())}`; } catch { return ''; }
}

function authHeaders() {
    return { Authorization: `Bearer ${localStorage.getItem('trafficai_token')}`, 'Content-Type': 'application/json' };
}

function evTop(iso: string): number {
    const d = new Date(iso);
    return (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_HEIGHT;
}

function evHeight(s: string, e: string): number {
    const ms = new Date(e).getTime() - new Date(s).getTime();
    return Math.max(ms / 3600000 * HOUR_HEIGHT, 22);
}

interface LayoutEvent extends CalendarEvent {
    col: number;
    totalCols: number;
}

function layoutEvents(events: CalendarEvent[]): LayoutEvent[] {
    if (!events.length) return [];

    // Sort by start time, then by end time desc (longer events first)
    const sorted = [...events].sort((a, b) => {
        const sa = new Date(a.start).getTime(), sb = new Date(b.start).getTime();
        if (sa !== sb) return sa - sb;
        return new Date(b.end).getTime() - new Date(a.end).getTime();
    });

    // Assign columns using a greedy algorithm
    const cols: number[] = new Array(sorted.length).fill(0);
    const endTimes: number[] = []; // end time of the last event in each column

    for (let i = 0; i < sorted.length; i++) {
        const start = new Date(sorted[i].start).getTime();
        // Find first column where last event ended before this one starts
        let assigned = -1;
        for (let c = 0; c < endTimes.length; c++) {
            if (endTimes[c] <= start) { assigned = c; break; }
        }
        if (assigned === -1) { assigned = endTimes.length; endTimes.push(0); }
        cols[i] = assigned;
        endTimes[assigned] = new Date(sorted[i].end).getTime();
    }

    // For each event, compute how many columns its group spans
    const result: LayoutEvent[] = sorted.map((ev, i) => ({ ...ev, col: cols[i], totalCols: 1 }));

    // Find overlapping groups and set totalCols
    for (let i = 0; i < result.length; i++) {
        const startI = new Date(result[i].start).getTime();
        const endI = new Date(result[i].end).getTime();
        let maxCol = result[i].col;
        for (let j = 0; j < result.length; j++) {
            if (i === j) continue;
            const startJ = new Date(result[j].start).getTime();
            const endJ = new Date(result[j].end).getTime();
            if (startJ < endI && endJ > startI) maxCol = Math.max(maxCol, result[j].col);
        }
        result[i].totalCols = maxCol + 1;
    }

    return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function RotinaPage() {
    return (
        <Suspense fallback={<div style={{ padding: 32, color: '#64748b' }}>Carregando...</div>}>
            <CalendarApp />
        </Suspense>
    );
}

// ─── Calendar App ─────────────────────────────────────────────────────────────

function CalendarApp() {
    const searchParams = useSearchParams();
    const gridRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const [colWidths, setColWidths] = useState<number[]>(Array(7).fill(1));
    const dragState = useRef<{ colIdx: number; startX: number; startFr: number } | null>(null);

    const gridCols = `52px ${colWidths.map(w => `${w}fr`).join(' ')}`;

    const startColResize = (colIdx: number, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragState.current = { colIdx, startX: e.clientX, startFr: colWidths[colIdx] };
        const onMove = (ev: MouseEvent) => {
            if (!dragState.current || !calendarRef.current) return;
            const containerW = calendarRef.current.offsetWidth - 52;
            const frPerPx = colWidths.reduce((a, b) => a + b, 0) / containerW;
            const dx = ev.clientX - dragState.current.startX;
            const newFr = Math.max(0.3, dragState.current.startFr + dx * frPerPx);
            setColWidths(w => w.map((v, i) => i === dragState.current!.colIdx ? newFr : v));
        };
        const onUp = () => {
            dragState.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const weekDays = getWeekDays(currentDate);
    const weekStart = toDateStr(weekDays[0]);
    const weekEnd = toDateStr(weekDays[6]);

    const [tasks, setTasks] = useState<ReviewTask[]>([]);
    const [schedules, setSchedules] = useState<ReviewSchedule[]>([]);
    const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
    const [workflowTasks, setWorkflowTasks] = useState<any[]>([]);
    const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; configured: boolean }>({ connected: false, email: null, configured: false });

    const [showModal, setShowModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
    const [form, setForm] = useState<EventForm>({ title: '', date: toDateStr(new Date()), startTime: '09:00', endTime: '10:00', description: '', allDay: false, colorId: '8', createMeet: false, attendees: [], guestInput: '' });
    const [saving, setSaving] = useState(false);

    const [clients, setClients] = useState<{ id: string; name: string; avatar_color: string }[]>([]);
    const [meetingDoneOpen, setMeetingDoneOpen] = useState(false);
    const [meetingClientId, setMeetingClientId] = useState('');
    const [meetingDoneSummary, setMeetingDoneSummary] = useState('');
    const [savingMeeting, setSavingMeeting] = useState(false);

    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

    // ── Scroll to 7h on mount ────────────────────────────────────────────────
    useEffect(() => { if (gridRef.current) gridRef.current.scrollTop = HOUR_HEIGHT * 7; }, []);

    // ── OAuth notifications ───────────────────────────────────────────────────
    useEffect(() => {
        if (searchParams.get('google_connected') === 'true') {
            showToast('Google Calendar conectado!');
            window.history.replaceState({}, '', '/rotina');
        }
        if (searchParams.get('google_error')) {
            const code = searchParams.get('google_error');
            const desc = searchParams.get('google_desc');
            const map: Record<string, string> = {
                'invalid_grant': 'Código expirado — tente novamente',
                'invalid_client': 'Credenciais Google inválidas',
                'access_denied': 'Acesso negado',
                'redirect_uri_mismatch': 'URI não autorizado no Google Cloud Console',
            };
            showToast((code && map[code]) || desc || `Erro OAuth (${code})`, false);
            window.history.replaceState({}, '', '/rotina');
        }
    }, [searchParams]);

    // ── Fetch data ────────────────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        try {
            const [tR, sR, gR, wR, cR] = await Promise.all([
                fetch(`${API}/routine/tasks?start=${weekStart}&end=${weekEnd}`, { headers: authHeaders() }),
                fetch(`${API}/routine/schedule`, { headers: authHeaders() }),
                fetch(`${API}/routine/google/status`, { headers: authHeaders() }),
                fetch(`${API}/tasks?since=${weekStart}&until=${weekEnd}`, { headers: authHeaders() }),
                fetch(`${API}/clients`, { headers: authHeaders() }),
            ]);
            const [tD, sD, gD, wD, cD] = await Promise.all([tR.json(), sR.json(), gR.json(), wR.json(), cR.json()]);
            if (tD.success) setTasks(tD.data);
            if (sD.success) setSchedules(sD.data);
            if (gD.success) setGoogleStatus(gD.data);
            if (wD.success) setWorkflowTasks(wD.data || []);
            if (cD.success) setClients(cD.data.map((c: any) => ({ id: c.id, name: c.name, avatar_color: c.avatar_color })));
        } catch { /* silently */ }
    }, [weekStart, weekEnd]);

    const fetchGoogleEvents = useCallback(async () => {
        if (!googleStatus.connected) { setGoogleEvents([]); return; }
        try {
            const r = await fetch(`${API}/routine/google/events?start=${weekStart}&end=${weekEnd}`, { headers: authHeaders() });
            const d = await r.json();
            if (d.success) setGoogleEvents(d.data.map((e: any) => ({ ...e, source: 'google' })));
        } catch { /* silently */ }
    }, [googleStatus.connected, weekStart, weekEnd]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => { fetchGoogleEvents(); }, [fetchGoogleEvents]);

    // ── Combine tasks + google events ─────────────────────────────────────────
    const allEvents: CalendarEvent[] = [
        ...tasks.map(t => {
            const sched = schedules.find(s => s.id === t.schedule_id);
            const time = sched?.review_time || '09:00';
            const start = new Date(`${t.scheduled_date}T${time}:00`);
            const end = new Date(start.getTime() + 30 * 60 * 1000);
            return {
                id: `task-${t.id}`,
                title: `${t.account_name || 'Revisão'}`,
                start: start.toISOString(), end: end.toISOString(),
                allDay: false, color: GOOGLE_COLORS['task'], colorId: 'task',
                source: 'task' as const, taskId: t.id, description: t.notes,
            };
        }),
        ...workflowTasks
            .filter(t => t.status === 'pending')
            .map(t => {
                const wCfg = WORKFLOW_TASK_CFG[t.type as keyof typeof WORKFLOW_TASK_CFG];
                if (!wCfg) return null;
                const dateStr = String(t.scheduled_date).substring(0, 10);
                const start = new Date(`${dateStr}T${wCfg.time}:00`);
                const end = new Date(start.getTime() + wCfg.duration * 60 * 1000);
                return {
                    id: `wf-${t.id}`,
                    title: `${wCfg.label} — ${t.client_name}`,
                    start: start.toISOString(), end: end.toISOString(),
                    allDay: false, color: wCfg.color, colorId: null,
                    source: 'task' as const, taskId: t.id, description: null,
                } as CalendarEvent;
            })
            .filter((e): e is CalendarEvent => e !== null),
        ...googleEvents,
    ];

    // ── Google connect/disconnect ─────────────────────────────────────────────
    const handleConnect = async () => {
        const r = await fetch(`${API}/routine/google/auth-url`, { headers: authHeaders() });
        const d = await r.json();
        if (d.success) window.location.href = d.data.url;
        else showToast(d.error?.message || 'Google Calendar não configurado', false);
    };
    const handleDisconnect = async () => {
        await fetch(`${API}/routine/google/disconnect`, { method: 'DELETE', headers: authHeaders() });
        setGoogleStatus({ connected: false, email: null, configured: googleStatus.configured });
        setGoogleEvents([]);
        showToast('Google Calendar desconectado');
    };

    // ── Modal open ────────────────────────────────────────────────────────────
    const openCreate = (date: Date, hour = 9) => {
        const h = Math.min(hour, 22);
        setEditingEvent(null);
        setForm({ title: '', date: toDateStr(date), startTime: `${padZ(h)}:00`, endTime: `${padZ(h + 1)}:00`, description: '', allDay: false, colorId: '8', createMeet: false, attendees: [], guestInput: '' });
        setShowModal(true);
    };
    const openEdit = (ev: CalendarEvent) => {
        setEditingEvent(ev);
        setForm({
            title: ev.title,
            date: new Date(ev.start).toISOString().split('T')[0],
            startTime: ev.allDay ? '09:00' : fmtTime(ev.start),
            endTime: ev.allDay ? '10:00' : fmtTime(ev.end),
            description: ev.description || '',
            allDay: ev.allDay,
            colorId: ev.colorId && ev.colorId !== 'task' ? ev.colorId : '8',
            createMeet: false,
            attendees: ev.attendees?.map(a => a.email) || [],
            guestInput: '',
        });
        setMeetingDoneOpen(false);
        setMeetingClientId('');
        setMeetingDoneSummary('');
        setShowModal(true);
    };

    // ── Mark meeting as done ──────────────────────────────────────────────────
    const handleMarkMeeting = async () => {
        if (!editingEvent) return;
        setSavingMeeting(true);
        try {
            const eventDate = new Date(editingEvent.start).toISOString().split('T')[0];
            const r = await fetch(`${API}/routine/meeting-logs`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    google_event_id: editingEvent.id,
                    title: editingEvent.title,
                    event_date: eventDate,
                    summary: meetingDoneSummary || null,
                    completed: true,
                    client_id: meetingClientId || null,
                }),
            });
            const d = await r.json();
            if (d.success) {
                showToast('Reunião marcada como realizada!');
                setMeetingDoneOpen(false);
                setMeetingClientId('');
                setMeetingDoneSummary('');
            } else {
                showToast(d.error?.message || 'Erro ao salvar', false);
            }
        } catch {
            showToast('Erro de conexão', false);
        }
        setSavingMeeting(false);
    };

    // ── Save event ────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!form.title.trim()) { showToast('Digite um título', false); return; }
        if (!googleStatus.connected) { showToast('Conecte o Google Calendar primeiro', false); return; }
        setSaving(true);
        try {
            const body = { title: form.title, date: form.date, startTime: form.startTime, endTime: form.endTime, description: form.description, allDay: form.allDay, colorId: form.colorId, createMeet: form.createMeet, attendees: form.attendees };
            const url = editingEvent ? `${API}/routine/google/event/${editingEvent.id}` : `${API}/routine/google/create-event`;
            const method = editingEvent ? 'PUT' : 'POST';
            const r = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
            const d = await r.json();
            if (d.success) { showToast(editingEvent ? 'Evento atualizado' : 'Evento criado'); setShowModal(false); fetchGoogleEvents(); }
            else showToast(d.error?.message || 'Erro ao salvar', false);
        } catch { showToast('Erro de conexão', false); }
        setSaving(false);
    };

    // ── Delete event ──────────────────────────────────────────────────────────
    const handleDelete = async (eventId: string) => {
        const r = await fetch(`${API}/routine/google/event/${eventId}`, { method: 'DELETE', headers: authHeaders() });
        const d = await r.json();
        if (d.success) { showToast('Evento removido'); setShowModal(false); fetchGoogleEvents(); }
        else showToast(d.error?.message || 'Erro ao remover', false);
    };

    // ── Navigation ────────────────────────────────────────────────────────────
    const today = toDateStr(new Date());
    const monthLabel = (() => {
        const m0 = weekDays[0].getMonth(), m1 = weekDays[6].getMonth();
        const y = weekDays[6].getFullYear();
        return m0 === m1 ? `${MONTH_NAMES[m0]} ${y}` : `${MONTH_SHORT[m0]} – ${MONTH_SHORT[m1]} ${y}`;
    })();

    // ─────────────────────────────────────────────────────────────────────────

    return (
        // Negative margin cancels main-content padding → full-height calendar
        <div style={{ margin: '-36px -40px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.ok ? '#22c55e' : '#ef4444', color: 'white', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 20px rgba(0,0,0,.4)', pointerEvents: 'none' }}>
                    {toast.ok ? '✓ ' : '⚠ '}{toast.msg}
                </div>
            )}

            {/* ── Toolbar ─────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginRight: 4 }}>Agenda</span>

                <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} style={navBtn}><ChevronLeft size={17} /></button>
                    <button onClick={() => setCurrentDate(new Date())} style={{ ...navBtn, padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>Hoje</button>
                    <button onClick={() => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} style={navBtn}><ChevronRight size={17} /></button>
                </div>

                <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', minWidth: 200 }}>{monthLabel}</span>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {googleStatus.configured && (
                        googleStatus.connected ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', borderRadius: 8, padding: '6px 12px' }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                                <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{googleStatus.email}</span>
                                <button onClick={handleDisconnect} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, lineHeight: 1 }}><X size={13} /></button>
                            </div>
                        ) : (
                            <button onClick={handleConnect} style={{ ...navBtn, gap: 6, display: 'flex', alignItems: 'center', padding: '7px 14px', fontSize: 13, fontWeight: 600 }}>
                                <LinkIcon size={14} /> Conectar Google
                            </button>
                        )
                    )}
                    <button onClick={() => openCreate(new Date())} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ff6b35', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        <Plus size={15} /> Novo evento
                    </button>
                </div>
            </div>

            {/* ── Body ──────────────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── Sidebar ───────────────────────────────────────────────────── */}
                <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
                    <button onClick={() => openCreate(new Date())} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, padding: '10px 18px', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.25)', width: '100%' }}>
                        <Plus size={16} /> Criar
                    </button>

                    <MiniCalendar currentDate={currentDate} onDayClick={setCurrentDate} />

                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Calendários</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                                <span style={{ width: 12, height: 12, borderRadius: 3, background: GOOGLE_COLORS['task'], flexShrink: 0 }} />
                                Revisões TrafficAI
                            </div>
                            {googleStatus.connected && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                                    <span style={{ width: 12, height: 12, borderRadius: 3, background: '#3b82f6', flexShrink: 0 }} />
                                    Google Calendar
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Calendar main ─────────────────────────────────────────────── */}
                <div ref={calendarRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                        <div style={{ borderRight: '1px solid var(--border)' }} />
                        {weekDays.map((day, colIdx) => {
                            const isToday = toDateStr(day) === today;
                            return (
                                <div key={toDateStr(day)} style={{ padding: '8px 6px', textAlign: 'center', borderRight: '1px solid var(--border)', position: 'relative' }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? '#ff6b35' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {DAY_SHORT[day.getDay()]}
                                    </div>
                                    <div
                                        onClick={() => setCurrentDate(day)}
                                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', marginTop: 2, background: isToday ? '#ff6b35' : 'transparent', color: isToday ? 'white' : 'var(--text-primary)', fontSize: 18, fontWeight: 700, cursor: 'pointer', transition: 'background .15s' }}
                                        onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = 'rgba(255, 107, 53,.15)'; }}
                                        onMouseLeave={e => { if (!isToday) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        {day.getDate()}
                                    </div>
                                    {/* Resize handle */}
                                    <div
                                        onMouseDown={e => startColResize(colIdx, e)}
                                        title="Arrastar para redimensionar"
                                        style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <div style={{ width: 2, height: 16, borderRadius: 1, background: 'var(--border)', opacity: 0.6 }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Scrollable time grid */}
                    <div ref={gridRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: gridCols, minHeight: HOUR_HEIGHT * 24 }}>

                            {/* Time labels */}
                            <div style={{ borderRight: '1px solid var(--border)' }}>
                                {HOURS.map(h => (
                                    <div key={h} style={{ height: HOUR_HEIGHT, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8 }}>
                                        {h > 0 && <span style={{ fontSize: 11, color: '#475569', marginTop: -6 }}>{padZ(h)}:00</span>}
                                    </div>
                                ))}
                            </div>

                            {/* Day columns */}
                            {weekDays.map(day => {
                                const ds = toDateStr(day);
                                const isToday = ds === today;
                                const dayEvs = allEvents.filter(e => !e.allDay && new Date(e.start).toISOString().startsWith(ds));
                                const laid = layoutEvents(dayEvs);
                                return (
                                    <div key={ds} style={{ borderRight: '1px solid var(--border)', position: 'relative', background: isToday ? 'rgba(255, 107, 53,.025)' : 'transparent' }}>
                                        {HOURS.map(h => (
                                            <div key={h} onClick={() => openCreate(day, h)}
                                                style={{ height: HOUR_HEIGHT, borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 107, 53,.06)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            />
                                        ))}
                                        {isToday && <NowLine />}
                                        {laid.map(ev => <EventBlock key={ev.id} event={ev} onClick={() => ev.source === 'google' ? openEdit(ev) : undefined} />)}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Event Modal ───────────────────────────────────────────────────── */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
                    onClick={() => setShowModal(false)}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 24px 80px rgba(0,0,0,.7)' }}
                        onClick={e => e.stopPropagation()}>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>{editingEvent ? 'Editar evento' : 'Novo evento'}</h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <input autoFocus placeholder="Adicionar título" value={form.title}
                                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                                style={{ background: 'transparent', border: 'none', borderBottom: '2px solid #ff6b35', color: 'var(--text-primary)', fontSize: 17, fontWeight: 600, padding: '4px 0', outline: 'none', width: '100%', fontFamily: 'inherit' }}
                            />

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={form.allDay} onChange={e => setForm(p => ({ ...p, allDay: e.target.checked }))} />
                                Dia inteiro
                            </label>

                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 130 }}>
                                    <label style={lbl}>Data</label>
                                    <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inp} />
                                </div>
                                {!form.allDay && (
                                    <>
                                        <div style={{ flex: 1, minWidth: 95 }}>
                                            <label style={lbl}>Início</label>
                                            <input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} style={inp} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 95 }}>
                                            <label style={lbl}>Fim</label>
                                            <input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} style={inp} />
                                        </div>
                                    </>
                                )}
                            </div>

                            <div>
                                <label style={lbl}>Descrição</label>
                                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Adicionar descrição" rows={2} style={{ ...inp, resize: 'vertical' }} />
                            </div>

                            <div>
                                <label style={lbl}>Cor</label>
                                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                    {COLOR_OPTIONS.map(c => (
                                        <button key={c.id} title={c.label} onClick={() => setForm(p => ({ ...p, colorId: c.id }))}
                                            style={{ width: 24, height: 24, borderRadius: '50%', background: GOOGLE_COLORS[c.id], border: form.colorId === c.id ? '3px solid white' : '2px solid transparent', cursor: 'pointer', boxShadow: form.colorId === c.id ? `0 0 0 2px ${GOOGLE_COLORS[c.id]}` : 'none', transition: 'all .15s' }} />
                                    ))}
                                </div>
                            </div>

                            {/* Google Meet */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <button
                                    onClick={() => setForm(p => ({ ...p, createMeet: !p.createMeet }))}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: form.createMeet ? 'rgba(255, 107, 53,.12)' : 'var(--bg-secondary)', border: `1px solid ${form.createMeet ? '#ff6b35' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', color: form.createMeet ? '#ffa46e' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13, width: '100%', transition: 'all .15s' }}>
                                    <Video size={16} color={form.createMeet ? '#ff6b35' : '#64748b'} />
                                    <span>{form.createMeet ? 'Google Meet adicionado' : 'Adicionar Google Meet'}</span>
                                    {form.createMeet && <Check size={14} style={{ marginLeft: 'auto', color: '#ff6b35' }} />}
                                </button>

                                {/* Meet link existente (edição) */}
                                {editingEvent?.meetLink && (
                                    <a href={editingEvent.meetLink} target="_blank" rel="noreferrer"
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ff6b35', padding: '8px 12px', background: 'rgba(255, 107, 53,.08)', borderRadius: 7, border: '1px solid rgba(255, 107, 53,.25)', textDecoration: 'none', fontWeight: 600 }}>
                                        <Video size={14} />
                                        Abrir reunião Meet
                                        <ExternalLink size={12} style={{ marginLeft: 'auto' }} />
                                    </a>
                                )}
                            </div>

                            {/* Convidados */}
                            <div>
                                <label style={lbl}>Convidar pessoas</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        type="email"
                                        placeholder="email@exemplo.com"
                                        value={form.guestInput}
                                        onChange={e => setForm(p => ({ ...p, guestInput: e.target.value }))}
                                        onKeyDown={e => {
                                            if ((e.key === 'Enter' || e.key === ',') && form.guestInput.includes('@')) {
                                                e.preventDefault();
                                                const email = form.guestInput.trim().replace(/,/g, '');
                                                if (email && !form.attendees.includes(email)) setForm(p => ({ ...p, attendees: [...p.attendees, email], guestInput: '' }));
                                            }
                                        }}
                                        style={{ ...inp, flex: 1 }}
                                    />
                                    <button
                                        onClick={() => {
                                            const email = form.guestInput.trim().replace(/,/g, '');
                                            if (email && email.includes('@') && !form.attendees.includes(email)) setForm(p => ({ ...p, attendees: [...p.attendees, email], guestInput: '' }));
                                        }}
                                        style={{ background: '#ff6b35', color: 'white', border: 'none', borderRadius: 6, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                        <UserPlus size={15} />
                                    </button>
                                </div>

                                {/* Guest chips */}
                                {form.attendees.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                                        {form.attendees.map(email => (
                                            <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255, 107, 53,.12)', border: '1px solid rgba(255, 107, 53,.25)', borderRadius: 20, padding: '3px 10px 3px 12px', fontSize: 12, color: '#ffa46e', fontWeight: 500 }}>
                                                {email}
                                                <button onClick={() => setForm(p => ({ ...p, attendees: p.attendees.filter(a => a !== email) }))}
                                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex' }}>
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {form.attendees.length > 0 && (
                                    <p style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
                                        Convites serão enviados por email ao salvar
                                    </p>
                                )}
                            </div>

                            {/* ── Marcar reunião como realizada ──────────────── */}
                            {editingEvent && editingEvent.source === 'google' && (
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                                    <button
                                        onClick={() => setMeetingDoneOpen(p => !p)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: meetingDoneOpen ? 'rgba(34,197,94,.12)' : 'var(--bg-secondary)', border: `1px solid ${meetingDoneOpen ? '#22c55e' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', color: meetingDoneOpen ? '#22c55e' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13, width: '100%', transition: 'all .15s' }}>
                                        <Check size={15} color={meetingDoneOpen ? '#22c55e' : '#64748b'} />
                                        Marcar reunião como realizada
                                        {meetingDoneOpen && <Check size={13} style={{ marginLeft: 'auto', color: '#22c55e' }} />}
                                    </button>
                                    {meetingDoneOpen && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                                            <div>
                                                <label style={lbl}>Cliente</label>
                                                <select value={meetingClientId} onChange={e => setMeetingClientId(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                                                    <option value="">Sem cliente vinculado</option>
                                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label style={lbl}>Resumo (opcional)</label>
                                                <textarea value={meetingDoneSummary} onChange={e => setMeetingDoneSummary(e.target.value)} placeholder="O que foi discutido..." rows={2} style={{ ...inp, resize: 'vertical' }} />
                                            </div>
                                            <button onClick={handleMarkMeeting} disabled={savingMeeting}
                                                style={{ background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: savingMeeting ? 'wait' : 'pointer', opacity: savingMeeting ? 0.7 : 1 }}>
                                                {savingMeeting ? 'Salvando...' : 'Confirmar reunião'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!googleStatus.connected && (
                                <p style={{ fontSize: 12, color: '#64748b', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    Conecte o Google Calendar para salvar eventos
                                </p>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24, alignItems: 'center' }}>
                            {editingEvent && editingEvent.source === 'google' && (
                                <button onClick={() => handleDelete(editingEvent.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 14px', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    <Trash2 size={14} /> Remover
                                </button>
                            )}
                            <div style={{ flex: 1 }} />
                            <button onClick={() => setShowModal(false)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                style={{ background: '#ff6b35', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: 13, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Salvando...' : <><Check size={14} /> Salvar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({ currentDate, onDayClick }: { currentDate: Date; onDayClick: (d: Date) => void }) {
    const [view, setView] = useState(new Date(currentDate));
    const todayStr = toDateStr(new Date());
    const selectedWeek = getWeekDays(currentDate).map(toDateStr);

    useEffect(() => { setView(new Date(currentDate)); }, [currentDate.getFullYear(), currentDate.getMonth()]);

    const yr = view.getFullYear(), mo = view.getMonth();
    const firstDow = new Date(yr, mo, 1).getDay();
    const offset = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <button onClick={() => setView(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}><ChevronLeft size={15} /></button>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{MONTH_SHORT[mo]} {yr}</span>
                <button onClick={() => setView(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}><ChevronRight size={15} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, textAlign: 'center' }}>
                {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: '#475569', paddingBottom: 4 }}>{d}</div>
                ))}
                {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const ds = `${yr}-${padZ(mo + 1)}-${padZ(day)}`;
                    const isToday = ds === todayStr;
                    const inWeek = selectedWeek.includes(ds);
                    return (
                        <div key={i} onClick={() => onDayClick(new Date(yr, mo, day))}
                            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', cursor: 'pointer', fontSize: 12, fontWeight: isToday ? 700 : 400, background: isToday ? '#ff6b35' : inWeek ? 'rgba(255, 107, 53,.18)' : 'transparent', color: isToday ? 'white' : inWeek ? '#ffa46e' : '#94a3b8', margin: 'auto' }}>
                            {day}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Event Block ──────────────────────────────────────────────────────────────

function EventBlock({ event, onClick }: { event: LayoutEvent; onClick: () => void }) {
    const top = evTop(event.start);
    const height = evHeight(event.start, event.end);
    const color = event.color || (event.colorId ? GOOGLE_COLORS[event.colorId] : '#ff6b35') || '#ff6b35';
    const short = height < 44;
    const isTask = event.source === 'task';

    const GAP = 3;
    const colW = 100 / event.totalCols;
    const leftPct = event.col * colW;
    const widthPct = colW;

    return (
        <div onClick={e => { e.stopPropagation(); onClick(); }}
            title={event.title}
            style={{
                position: 'absolute',
                left: `calc(${leftPct}% + ${GAP}px)`,
                width: `calc(${widthPct}% - ${GAP * 2}px)`,
                top, height,
                background: `${color}22`, borderLeft: `3px solid ${color}`,
                borderRadius: 4, padding: short ? '2px 5px' : '4px 6px',
                cursor: isTask ? 'default' : 'pointer', overflow: 'hidden',
                zIndex: 10, boxSizing: 'border-box', transition: 'opacity .1s',
            }}
            onMouseEnter={e => { if (!isTask) e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            <div style={{ fontSize: short ? 10 : 11, fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.35' }}>
                {event.title}
            </div>
            {!short && (
                <div style={{ fontSize: 10, color: `${color}bb`, marginTop: 1, whiteSpace: 'nowrap' }}>
                    {fmtTime(event.start)} – {fmtTime(event.end)}
                </div>
            )}
        </div>
    );
}

// ─── Current Time Line ────────────────────────────────────────────────────────

function NowLine() {
    const [now, setNow] = useState(new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
    const top = (now.getHours() * 60 + now.getMinutes()) / 60 * HOUR_HEIGHT;
    return (
        <div style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 20, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', left: -5, top: -5, width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ height: 2, background: '#ef4444', marginLeft: 5 }} />
        </div>
    );
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
    background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
    padding: '6px 8px', cursor: 'pointer', color: 'var(--text-secondary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 };

const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)',
    fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};
