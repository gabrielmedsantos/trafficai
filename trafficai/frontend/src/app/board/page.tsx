'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
    Plus, X, Check, Trash2, Pencil, KanbanSquare, List as ListIcon,
    Circle, CheckCircle2, CircleDot, Flag, Calendar, Folder,
    GripVertical,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'todo' | 'doing' | 'done';
type Priority = 'low' | 'normal' | 'high';

interface ChecklistItem { id: string; text: string; done: boolean }

interface Card {
    id: string;
    title: string;
    description: string | null;
    status: Status;
    priority: Priority;
    project: string | null;
    due_date: string | null;
    position: number;
    checklist: ChecklistItem[];
    completed_at: string | null;
    created_at: string;
    updated_at: string;
}

const COLUMNS: { status: Status; label: string; color: string }[] = [
    { status: 'todo',  label: 'A fazer',       color: 'var(--accent-blue)' },
    { status: 'doing', label: 'Em andamento',  color: 'var(--accent-yellow)' },
    { status: 'done',  label: 'Feito',         color: 'var(--accent-green)' },
];

const PRIORITY_LABEL: Record<Priority, string> = {
    low: 'Baixa', normal: 'Normal', high: 'Alta',
};

const PRIORITY_COLOR: Record<Priority, string> = {
    low: 'var(--text-muted)',
    normal: 'var(--accent-blue)',
    high: 'var(--accent-red)',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BoardPage() {
    const [cards, setCards] = useState<Card[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'list' | 'kanban'>('kanban');
    const [editing, setEditing] = useState<Card | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [projectFilter, setProjectFilter] = useState<string>('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.getBoardCards();
            setCards(Array.isArray(data) ? data : []);
        } catch {
            setCards([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = projectFilter
        ? cards.filter(c => (c.project || '').toLowerCase() === projectFilter.toLowerCase())
        : cards;

    const projects = Array.from(new Set(cards.map(c => c.project).filter(Boolean) as string[])).sort();

    // Optimistic update helper
    const patch = (id: string, data: Partial<Card>) => {
        setCards(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    };

    async function moveCard(card: Card, toStatus: Status, toPosition?: number) {
        const prevStatus = card.status;
        const prevCards = cards;

        // Optimistic: update local immediately
        const updated = cards.filter(c => c.id !== card.id);
        const targetPos = toPosition ?? updated.filter(c => c.status === toStatus).length;
        const newCard = { ...card, status: toStatus, position: targetPos };
        updated.splice(
            updated.findIndex(c => c.status === toStatus && c.position >= targetPos),
            0,
            newCard
        );
        // Re-index positions in the destination column
        const reindexed = updated.map(c => {
            if (c.status !== toStatus) return c;
            const colCards = updated.filter(x => x.status === toStatus);
            const idx = colCards.findIndex(x => x.id === c.id);
            return { ...c, position: idx };
        });
        setCards(reindexed);

        try {
            await api.reorderBoardCards([{ id: card.id, status: toStatus, position: targetPos }]);
        } catch {
            // Rollback
            setCards(prevCards);
            alert('Falha ao mover. Tente novamente.');
        }
    }

    async function toggleDone(card: Card) {
        const newStatus: Status = card.status === 'done' ? 'todo' : 'done';
        patch(card.id, { status: newStatus });
        try {
            await api.updateBoardCard(card.id, { status: newStatus });
        } catch {
            patch(card.id, { status: card.status });
        }
    }

    async function toggleChecklistItem(cardId: string, itemId: string) {
        const card = cards.find(c => c.id === cardId);
        if (!card) return;
        const newChecklist = card.checklist.map(it =>
            it.id === itemId ? { ...it, done: !it.done } : it
        );
        patch(cardId, { checklist: newChecklist });
        try { await api.toggleBoardChecklist(cardId, itemId); }
        catch { patch(cardId, { checklist: card.checklist }); }
    }

    async function deleteCard(id: string) {
        if (!confirm('Excluir este card?')) return;
        const prev = cards;
        setCards(cards.filter(c => c.id !== id));
        try { await api.deleteBoardCard(id); }
        catch { setCards(prev); }
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1>Demandas</h1>
                    <p>Tarefas e anotações dos projetos, com check quando concluído.</p>
                </div>
                <div className="page-header-actions">
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowCreate(true)}
                    >
                        <Plus size={14} /> Nova demanda
                    </button>
                </div>
            </div>

            {/* View toggle + filter */}
            <div style={{
                display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap',
            }}>
                <div style={{
                    display: 'inline-flex', background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)', borderRadius: 8, padding: 2,
                }}>
                    <button
                        type="button"
                        className={`btn btn-sm ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setView('kanban')}
                        style={{ borderRadius: 6 }}
                    >
                        <KanbanSquare size={13} /> Kanban
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setView('list')}
                        style={{ borderRadius: 6 }}
                    >
                        <ListIcon size={13} /> Lista
                    </button>
                </div>
                {projects.length > 0 && (
                    <select
                        value={projectFilter}
                        onChange={e => setProjectFilter(e.target.value)}
                        style={{
                            padding: '6px 10px', fontSize: 12,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            borderRadius: 6, color: 'var(--text-primary)',
                        }}
                    >
                        <option value="">Todos os projetos</option>
                        {projects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                )}
                <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                    {filtered.length} {filtered.length === 1 ? 'card' : 'cards'}
                </div>
            </div>

            {loading ? (
                <div className="loading-spinner"><div className="spinner" /></div>
            ) : filtered.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon"><KanbanSquare size={22} /></div>
                        <h3>Nenhuma demanda cadastrada</h3>
                        <p>Crie o primeiro card para começar.</p>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            style={{ marginTop: 16 }}
                            onClick={() => setShowCreate(true)}
                        >
                            <Plus size={14} /> Criar primeira demanda
                        </button>
                    </div>
                </div>
            ) : view === 'kanban' ? (
                <KanbanView
                    cards={filtered}
                    onOpen={c => setEditing(c)}
                    onMove={moveCard}
                    onToggleChecklist={toggleChecklistItem}
                    onDelete={deleteCard}
                />
            ) : (
                <ListView
                    cards={filtered}
                    onOpen={c => setEditing(c)}
                    onToggleDone={toggleDone}
                    onToggleChecklist={toggleChecklistItem}
                    onDelete={deleteCard}
                />
            )}

            {showCreate && (
                <CardFormModal
                    mode="create"
                    onClose={() => setShowCreate(false)}
                    onSaved={() => { setShowCreate(false); load(); }}
                />
            )}

            {editing && (
                <CardFormModal
                    mode="edit"
                    card={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                    onDelete={async () => {
                        if (!confirm('Excluir este card?')) return;
                        await api.deleteBoardCard(editing.id);
                        setEditing(null);
                        load();
                    }}
                />
            )}
        </div>
    );
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function KanbanView({
    cards, onOpen, onMove, onToggleChecklist, onDelete,
}: {
    cards: Card[];
    onOpen: (c: Card) => void;
    onMove: (c: Card, s: Status) => void;
    onToggleChecklist: (cardId: string, itemId: string) => void;
    onDelete: (id: string) => void;
}) {
    const [dragId, setDragId] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<Status | null>(null);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))',
            gap: 12,
            alignItems: 'flex-start',
        }}>
            {COLUMNS.map(col => {
                const colCards = cards
                    .filter(c => c.status === col.status)
                    .sort((a, b) => a.position - b.position);
                const isOver = dragOver === col.status;
                return (
                    <div
                        key={col.status}
                        onDragOver={e => { e.preventDefault(); setDragOver(col.status); }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={e => {
                            e.preventDefault();
                            setDragOver(null);
                            if (!dragId) return;
                            const card = cards.find(c => c.id === dragId);
                            if (card && card.status !== col.status) onMove(card, col.status);
                            setDragId(null);
                        }}
                        style={{
                            background: 'var(--bg-secondary)',
                            border: `1px solid ${isOver ? col.color : 'var(--border)'}`,
                            borderRadius: 10,
                            padding: 10,
                            minHeight: 120,
                            transition: 'border 0.15s',
                        }}
                    >
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                            paddingBottom: 8, borderBottom: '1px solid var(--border)',
                        }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: col.color }} />
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                                {col.label}
                            </div>
                            <div style={{
                                marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)',
                                background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 10,
                            }}>
                                {colCards.length}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {colCards.map(c => (
                                <KanbanCard
                                    key={c.id}
                                    card={c}
                                    draggable
                                    onDragStart={() => setDragId(c.id)}
                                    onDragEnd={() => setDragId(null)}
                                    onOpen={() => onOpen(c)}
                                    onToggleChecklist={itemId => onToggleChecklist(c.id, itemId)}
                                    onDelete={() => onDelete(c.id)}
                                />
                            ))}
                            {colCards.length === 0 && (
                                <div style={{
                                    padding: '16px 8px', fontSize: 12, color: 'var(--text-muted)',
                                    textAlign: 'center', fontStyle: 'italic',
                                }}>
                                    Arraste cards para cá
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function KanbanCard({
    card, draggable, onDragStart, onDragEnd, onOpen, onToggleChecklist, onDelete,
}: {
    card: Card;
    draggable: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
    onOpen: () => void;
    onToggleChecklist: (itemId: string) => void;
    onDelete: () => void;
}) {
    const total = card.checklist.length;
    const done = card.checklist.filter(i => i.done).length;
    const overdue = isOverdue(card.due_date, card.status);

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onOpen}
            style={{
                background: 'var(--bg-tertiary)',
                border: `1px solid ${overdue ? 'var(--accent-red)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'grab',
                userSelect: 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <GripVertical size={13} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
                        textDecoration: card.status === 'done' ? 'line-through' : 'none',
                        opacity: card.status === 'done' ? 0.65 : 1,
                    }}>
                        {card.title}
                    </div>
                    {card.description && (
                        <div style={{
                            fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}>
                            {card.description}
                        </div>
                    )}
                </div>
            </div>

            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {card.priority === 'high' && (
                    <Badge icon={<Flag size={10} />} color={PRIORITY_COLOR.high} label="Alta" />
                )}
                {card.project && (
                    <Badge icon={<Folder size={10} />} color="var(--text-secondary)" label={card.project} />
                )}
                {card.due_date && (
                    <Badge
                        icon={<Calendar size={10} />}
                        color={overdue ? 'var(--accent-red)' : 'var(--text-secondary)'}
                        label={fmtDate(card.due_date)}
                    />
                )}
                {total > 0 && (
                    <Badge
                        icon={<Check size={10} />}
                        color={done === total ? 'var(--accent-green)' : 'var(--text-secondary)'}
                        label={`${done}/${total}`}
                    />
                )}
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    className="btn btn-ghost btn-icon"
                    style={{ marginLeft: 'auto', padding: 3, opacity: 0.6 }}
                    title="Excluir"
                >
                    <Trash2 size={11} />
                </button>
            </div>

            {/* Checklist inline (se tiver e não for muito grande) */}
            {total > 0 && total <= 3 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {card.checklist.map(it => (
                        <div
                            key={it.id}
                            onClick={e => { e.stopPropagation(); onToggleChecklist(it.id); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                                cursor: 'pointer',
                                color: it.done ? 'var(--text-muted)' : 'var(--text-secondary)',
                                textDecoration: it.done ? 'line-through' : 'none',
                            }}
                        >
                            {it.done
                                ? <CheckCircle2 size={12} color="var(--accent-green)" />
                                : <Circle size={12} />}
                            <span>{it.text}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({
    cards, onOpen, onToggleDone, onToggleChecklist, onDelete,
}: {
    cards: Card[];
    onOpen: (c: Card) => void;
    onToggleDone: (c: Card) => void;
    onToggleChecklist: (cardId: string, itemId: string) => void;
    onDelete: (id: string) => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {COLUMNS.map(col => {
                const colCards = cards
                    .filter(c => c.status === col.status)
                    .sort((a, b) => a.position - b.position);
                if (colCards.length === 0) return null;
                return (
                    <div key={col.status}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                            fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                            textTransform: 'uppercase', letterSpacing: 0.6,
                        }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: col.color }} />
                            {col.label}
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                                · {colCards.length}
                            </span>
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            borderRadius: 8, overflow: 'hidden',
                        }}>
                            {colCards.map((c, idx) => (
                                <ListRow
                                    key={c.id}
                                    card={c}
                                    isLast={idx === colCards.length - 1}
                                    onOpen={() => onOpen(c)}
                                    onToggleDone={() => onToggleDone(c)}
                                    onToggleChecklist={itemId => onToggleChecklist(c.id, itemId)}
                                    onDelete={() => onDelete(c.id)}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function ListRow({
    card, isLast, onOpen, onToggleDone, onToggleChecklist, onDelete,
}: {
    card: Card;
    isLast: boolean;
    onOpen: () => void;
    onToggleDone: () => void;
    onToggleChecklist: (itemId: string) => void;
    onDelete: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const total = card.checklist.length;
    const done = card.checklist.filter(i => i.done).length;
    const isDone = card.status === 'done';
    const overdue = isOverdue(card.due_date, card.status);

    return (
        <div style={{
            borderBottom: isLast ? 'none' : '1px solid var(--border)',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            }}>
                <button
                    type="button"
                    onClick={onToggleDone}
                    style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: isDone ? 'var(--accent-green)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center',
                    }}
                    title={isDone ? 'Desmarcar' : 'Marcar como concluído'}
                >
                    {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>

                <div
                    onClick={() => total > 0 ? setExpanded(!expanded) : onOpen()}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                >
                    <div style={{
                        fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)',
                        textDecoration: isDone ? 'line-through' : 'none',
                        opacity: isDone ? 0.6 : 1,
                    }}>
                        {card.title}
                    </div>
                    {card.description && !expanded && (
                        <div style={{
                            fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {card.description}
                        </div>
                    )}
                </div>

                {/* Meta badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    {card.priority === 'high' && (
                        <Badge icon={<Flag size={10} />} color={PRIORITY_COLOR.high} label="Alta" />
                    )}
                    {card.project && (
                        <Badge icon={<Folder size={10} />} color="var(--text-secondary)" label={card.project} />
                    )}
                    {card.due_date && (
                        <Badge
                            icon={<Calendar size={10} />}
                            color={overdue ? 'var(--accent-red)' : 'var(--text-secondary)'}
                            label={fmtDate(card.due_date)}
                        />
                    )}
                    {total > 0 && (
                        <Badge
                            icon={<CircleDot size={10} />}
                            color={done === total ? 'var(--accent-green)' : 'var(--text-secondary)'}
                            label={`${done}/${total}`}
                        />
                    )}
                </div>

                <button
                    type="button"
                    onClick={onOpen}
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Editar"
                >
                    <Pencil size={12} />
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="btn btn-ghost btn-icon btn-sm"
                    title="Excluir"
                >
                    <Trash2 size={12} />
                </button>
            </div>

            {expanded && total > 0 && (
                <div style={{
                    padding: '4px 14px 12px 44px',
                    display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                    {card.checklist.map(it => (
                        <div
                            key={it.id}
                            onClick={() => onToggleChecklist(it.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                                cursor: 'pointer', padding: '3px 0',
                                color: it.done ? 'var(--text-muted)' : 'var(--text-secondary)',
                                textDecoration: it.done ? 'line-through' : 'none',
                            }}
                        >
                            {it.done
                                ? <CheckCircle2 size={13} color="var(--accent-green)" />
                                : <Circle size={13} />}
                            <span>{it.text}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Card Form Modal ──────────────────────────────────────────────────────────

function CardFormModal({
    mode, card, onClose, onSaved, onDelete,
}: {
    mode: 'create' | 'edit';
    card?: Card;
    onClose: () => void;
    onSaved: () => void;
    onDelete?: () => void;
}) {
    const [title, setTitle] = useState(card?.title || '');
    const [description, setDescription] = useState(card?.description || '');
    const [status, setStatus] = useState<Status>(card?.status || 'todo');
    const [priority, setPriority] = useState<Priority>(card?.priority || 'normal');
    const [project, setProject] = useState(card?.project || '');
    const [dueDate, setDueDate] = useState(card?.due_date ? card.due_date.slice(0, 10) : '');
    const [checklist, setChecklist] = useState<ChecklistItem[]>(card?.checklist || []);
    const [newItem, setNewItem] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function save() {
        if (!title.trim()) { setError('Título obrigatório'); return; }
        setSaving(true); setError('');
        try {
            const payload = {
                title: title.trim(),
                description: description.trim() || undefined,
                status,
                priority,
                project: project.trim() || null,
                due_date: dueDate || null,
                checklist,
            };
            if (mode === 'create') await api.createBoardCard(payload);
            else if (card) await api.updateBoardCard(card.id, payload as any);
            onSaved();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar');
        } finally {
            setSaving(false);
        }
    }

    function addChecklistItem() {
        if (!newItem.trim()) return;
        setChecklist([...checklist, {
            id: 'new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            text: newItem.trim(), done: false,
        }]);
        setNewItem('');
    }
    function toggleItem(id: string) {
        setChecklist(checklist.map(i => i.id === id ? { ...i, done: !i.done } : i));
    }
    function removeItem(id: string) {
        setChecklist(checklist.filter(i => i.id !== id));
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-box"
                style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-title">
                        {mode === 'create' ? 'Nova demanda' : 'Editar demanda'}
                    </div>
                    <button className="modal-close" onClick={onClose} type="button"><X size={16} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Título">
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Ex: Ligar pro cliente X"
                            autoFocus
                            style={inputStyle}
                        />
                    </Field>

                    <Field label="Descrição / anotações">
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Contexto, detalhes, links…"
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                        />
                    </Field>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        <Field label="Status">
                            <select
                                value={status}
                                onChange={e => setStatus(e.target.value as Status)}
                                style={inputStyle}
                            >
                                <option value="todo">A fazer</option>
                                <option value="doing">Em andamento</option>
                                <option value="done">Feito</option>
                            </select>
                        </Field>
                        <Field label="Prioridade">
                            <select
                                value={priority}
                                onChange={e => setPriority(e.target.value as Priority)}
                                style={inputStyle}
                            >
                                <option value="low">Baixa</option>
                                <option value="normal">Normal</option>
                                <option value="high">Alta</option>
                            </select>
                        </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                        <Field label="Projeto / cliente">
                            <input
                                type="text"
                                value={project}
                                onChange={e => setProject(e.target.value)}
                                placeholder="Ex: TrafficAI, Duana"
                                style={inputStyle}
                            />
                        </Field>
                        <Field label="Prazo">
                            <input
                                type="date"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                                style={inputStyle}
                            />
                        </Field>
                    </div>

                    <Field label={`Checklist${checklist.length ? ` (${checklist.filter(i => i.done).length}/${checklist.length})` : ''}`}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {checklist.map(it => (
                                <div key={it.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '4px 6px', background: 'var(--bg-tertiary)', borderRadius: 4,
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => toggleItem(it.id)}
                                        style={{
                                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center',
                                            color: it.done ? 'var(--accent-green)' : 'var(--text-muted)',
                                        }}
                                    >
                                        {it.done ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                                    </button>
                                    <span style={{
                                        flex: 1, fontSize: 12.5,
                                        color: it.done ? 'var(--text-muted)' : 'var(--text-primary)',
                                        textDecoration: it.done ? 'line-through' : 'none',
                                    }}>{it.text}</span>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(it.id)}
                                        className="btn btn-ghost btn-icon btn-sm"
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    type="text"
                                    value={newItem}
                                    onChange={e => setNewItem(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                                    placeholder="Adicionar item…"
                                    style={{ ...inputStyle, flex: 1 }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={addChecklistItem}
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>
                    </Field>

                    {error && (
                        <div style={{
                            padding: '8px 10px', fontSize: 12,
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 6, color: 'var(--accent-red)',
                        }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={save}
                            disabled={saving}
                        >
                            {saving ? 'Salvando…' : mode === 'create' ? 'Criar' : 'Salvar'}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Cancelar
                        </button>
                        {mode === 'edit' && onDelete && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={onDelete}
                                style={{ marginLeft: 'auto', color: 'var(--accent-red)' }}
                            >
                                <Trash2 size={13} /> Excluir
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{
                fontSize: 11, color: 'var(--text-muted)', marginBottom: 4,
                fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
            }}>
                {label}
            </div>
            {children}
        </div>
    );
}

function Badge({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10.5, color,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            padding: '1px 6px', borderRadius: 10, fontWeight: 500,
            whiteSpace: 'nowrap',
        }}>
            {icon}
            {label}
        </div>
    );
}

function fmtDate(iso: string) {
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isOverdue(due: string | null, status: Status): boolean {
    if (!due || status === 'done') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(due + 'T00:00:00');
    return d < today;
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: 13,
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    outline: 'none',
};
