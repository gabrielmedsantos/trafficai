'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
    ClipboardCheck, Play, Pause, X, Check, Plus, Trash2, User, Building2,
    FileText, KeyRound, Search, Wrench, Target, Rocket, Sparkles, PlusCircle,
    Settings2,
} from 'lucide-react';

type Phase = 'contract' | 'access' | 'discovery' | 'setup' | 'planning' | 'golive' | 'custom';
type Owner = 'agency' | 'client';

interface OnboardingItem {
    id: string;
    phase: Phase;
    title: string;
    description: string;
    owner: Owner;
    done: boolean;
    done_at: string | null;
    notes: string;
    order: number;
}

interface Onboarding {
    id: string;
    ad_account_id: string;
    account_name: string;
    status: 'in_progress' | 'completed' | 'paused';
    items: OnboardingItem[];
    total?: number;
    done?: number;
    progress_pct?: number;
    started_at: string;
    completed_at: string | null;
    threshold_percent: number;
}

const PHASE_META: Record<Phase, { label: string; icon: any; color: string; order: number }> = {
    contract:  { label: 'Contratual',      icon: FileText,       color: '#a89f92', order: 1 },
    access:    { label: 'Acessos',         icon: KeyRound,       color: '#f5a45a', order: 2 },
    discovery: { label: 'Discovery',       icon: Search,         color: '#5b8def', order: 3 },
    setup:     { label: 'Setup Técnico',   icon: Wrench,         color: '#ff6b35', order: 4 },
    planning:  { label: 'Planejamento',    icon: Target,         color: '#a960e6', order: 5 },
    golive:    { label: 'Go-Live',         icon: Rocket,         color: '#7bc46c', order: 6 },
    custom:    { label: 'Customizado',     icon: Sparkles,       color: '#a89f92', order: 7 },
};

export default function OnboardingPage() {
    const [items, setItems] = useState<Onboarding[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Onboarding | null>(null);
    const [showStart, setShowStart] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [list, accs] = await Promise.all([
                api.listOnboardings(),
                api.getActiveAccounts().catch(() => []),
            ]);
            setItems(list as any);
            setAccounts(accs as any);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const startForAccount = async (accountId: string) => {
        try {
            const res = await api.startOnboarding(accountId);
            setShowStart(false);
            await load();
            // Abre o novo direto
            const created = (res as any).data || res;
            const acc = accounts.find((a: any) => a.id === accountId);
            setSelected({ ...created, account_name: acc?.account_name || acc?.name || '' });
        } catch (err: any) {
            alert(err.message || 'Erro ao iniciar onboarding');
        }
    };

    // Contas que ainda não têm onboarding
    const availableAccounts = accounts.filter((a: any) =>
        !items.find(o => o.ad_account_id === a.id)
    );

    const inProgress = items.filter(o => o.status === 'in_progress');
    const paused = items.filter(o => o.status === 'paused');
    const completed = items.filter(o => o.status === 'completed');

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ClipboardCheck size={22} color="var(--primary)" />
                        Onboarding de Clientes
                    </h1>
                    <p>Checklist completo pra colocar novos clientes no ar sem esquecer nada</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href="/onboarding/template" className="btn" title="Editar o template padrão usado em novos onboardings">
                        <Settings2 size={14} /> Template
                    </Link>
                    <button className="btn btn-primary" onClick={() => setShowStart(true)}>
                        <Plus size={16} /> Iniciar onboarding
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }} /> Carregando…
                </div>
            ) : items.length === 0 ? (
                <EmptyState onStart={() => setShowStart(true)} />
            ) : (
                <>
                    {inProgress.length > 0 && (
                        <Section title="Em andamento" count={inProgress.length}>
                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                {inProgress.map(o => (
                                    <ClientOnboardingCard key={o.id} o={o} onOpen={() => setSelected(o)} onReload={load} />
                                ))}
                            </div>
                        </Section>
                    )}

                    {paused.length > 0 && (
                        <Section title="Pausados" count={paused.length}>
                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                {paused.map(o => (
                                    <ClientOnboardingCard key={o.id} o={o} onOpen={() => setSelected(o)} onReload={load} />
                                ))}
                            </div>
                        </Section>
                    )}

                    {completed.length > 0 && (
                        <Section title="Concluídos" count={completed.length}>
                            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                                {completed.map(o => (
                                    <ClientOnboardingCard key={o.id} o={o} onOpen={() => setSelected(o)} onReload={load} />
                                ))}
                            </div>
                        </Section>
                    )}
                </>
            )}

            {showStart && (
                <StartModal
                    accounts={availableAccounts}
                    onClose={() => setShowStart(false)}
                    onSelect={startForAccount}
                />
            )}

            {selected && (
                <OnboardingDrawer
                    onboarding={selected}
                    onClose={() => setSelected(null)}
                    onReload={load}
                />
            )}
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onStart }: { onStart: () => void }) {
    return (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <ClipboardCheck size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>Nenhum onboarding em andamento</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', fontSize: 14 }}>
                Quando fechar um cliente novo, inicie o onboarding pra rodar o checklist de 48 tarefas em 6 fases:
                Contratual, Acessos, Discovery, Setup Técnico, Planejamento e Go-Live.
            </p>
            <button className="btn btn-primary" onClick={onStart}>
                <Plus size={16} /> Iniciar primeiro onboarding
            </button>
        </div>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
        <section style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-secondary)', marginBottom: 12 }}>
                {title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({count})</span>
            </h2>
            {children}
        </section>
    );
}

// ─── Card por cliente ─────────────────────────────────────────────────────────

function ClientOnboardingCard({ o, onOpen, onReload }: { o: Onboarding; onOpen: () => void; onReload: () => void }) {
    const pct = o.progress_pct || 0;
    const done = o.done || 0;
    const total = o.total || (o.items?.length || 0);
    const statusMeta = {
        in_progress: { label: 'Em andamento', color: 'var(--primary)' },
        paused: { label: 'Pausado', color: 'var(--text-muted)' },
        completed: { label: 'Concluído', color: 'var(--success)' },
    }[o.status];

    // Blockers = itens pendentes do CLIENTE (agência espera o cliente entregar)
    const blockedByClient = (o.items || []).filter((it: OnboardingItem) => !it.done && it.owner === 'client').length;

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Apagar o onboarding de "${o.account_name}"?\n\nIsso vai remover todo o histórico do checklist. Se quiser voltar depois, tem que iniciar do zero.`)) return;
        try { await api.deleteOnboarding(o.id); onReload(); }
        catch (err: any) { alert(err.message || 'Erro ao apagar'); }
    };

    return (
        <div style={{ position: 'relative' }}>
        <button
            onClick={onOpen}
            className="card"
            style={{
                padding: 18,
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                transition: 'all 150ms ease',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,107,53,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={18} color="var(--primary)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.account_name}
                    </div>
                    <div style={{ fontSize: 11.5, color: statusMeta.color, marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {statusMeta.label}
                    </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--primary)' }}>
                    {pct}%
                </div>
            </div>

            <div style={{ height: 6, background: 'var(--bg-elev)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: pct === 100 ? 'var(--success)' : 'var(--primary)',
                    transition: 'width 300ms ease',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>{done} de {total} feitos</span>
                {blockedByClient > 0 && o.status !== 'completed' && (
                    <span style={{ color: 'var(--warning, #f5a45a)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} /> {blockedByClient} do cliente
                    </span>
                )}
            </div>
        </button>
        <button
            onClick={handleDelete}
            title="Apagar onboarding"
            style={{
                position: 'absolute', top: 12, right: 12,
                width: 28, height: 28, borderRadius: 6,
                background: 'transparent', border: '1px solid transparent',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.5, transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger, #e05a4a)'; e.currentTarget.style.borderColor = 'rgba(224,90,74,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
        >
            <Trash2 size={14} />
        </button>
        </div>
    );
}

// ─── Modal de escolha do cliente ─────────────────────────────────────────────

function StartModal({ accounts, onClose, onSelect }: { accounts: any[]; onClose: () => void; onSelect: (id: string) => void }) {
    return (
        <div className="drawer-overlay" onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '90%', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>Iniciar onboarding</h3>
                    <button onClick={onClose} className="btn btn-icon"><X size={16} /></button>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                    Escolha qual cliente vai começar o onboarding. O template padrão de 48 items em 6 fases será aplicado — você pode editar ou adicionar depois.
                </p>
                {accounts.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', background: 'var(--bg-elev)', borderRadius: 8 }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                            Todos os clientes ativos já têm onboarding. Ative um novo cliente na página Contas primeiro.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                        {accounts.map((a: any) => (
                            <button
                                key={a.id}
                                onClick={() => onSelect(a.id)}
                                className="btn"
                                style={{ justifyContent: 'flex-start', padding: '10px 14px', textAlign: 'left', fontSize: 14 }}
                            >
                                <Building2 size={14} /> {a.account_name || a.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Drawer principal — checklist detalhado ───────────────────────────────────

function OnboardingDrawer({ onboarding, onClose, onReload }: {
    onboarding: Onboarding;
    onClose: () => void;
    onReload: () => void;
}) {
    const [items, setItems] = useState<OnboardingItem[]>(onboarding.items || []);
    const [status, setStatus] = useState(onboarding.status);
    const [addingPhase, setAddingPhase] = useState<Phase | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [newOwner, setNewOwner] = useState<Owner>('agency');
    const [filter, setFilter] = useState<'all' | 'pending' | 'client'>('all');

    const refresh = async () => {
        try {
            const fresh = await api.getOnboarding(onboarding.ad_account_id);
            const data = (fresh as any).data || fresh;
            if (data) {
                setItems(data.items || []);
                setStatus(data.status);
            }
        } catch { /* silent */ }
    };

    const toggle = async (item: OnboardingItem) => {
        // Optimistic
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done, done_at: !i.done ? new Date().toISOString() : null } : i));
        try {
            const res: any = await api.toggleOnboardingItem(onboarding.id, item.id, !item.done);
            if (res?.just_completed && Array.isArray(res?.routines_created) && res.routines_created.length > 0) {
                alert(`🎉 Onboarding concluído!\n\nCriamos automaticamente ${res.routines_created.length} rotinas semanais pro cliente na Agenda:\n\n${res.routines_created.map((t: string) => `• ${t}`).join('\n')}\n\nVocê pode ver/editar em: Menu → Agenda`);
            }
            onReload();
        } catch {
            refresh();
        }
    };

    const removeItem = async (item: OnboardingItem) => {
        if (!confirm(`Remover "${item.title}"?`)) return;
        setItems(prev => prev.filter(i => i.id !== item.id));
        try { await api.deleteOnboardingItem(onboarding.id, item.id); onReload(); }
        catch { refresh(); }
    };

    const addItem = async (phase: Phase) => {
        if (!newTitle.trim()) return;
        try {
            await api.addOnboardingItem(onboarding.id, { phase, title: newTitle, owner: newOwner });
            setNewTitle(''); setAddingPhase(null);
            refresh(); onReload();
        } catch (err: any) { alert(err.message); }
    };

    const togglePause = async () => {
        try {
            if (status === 'paused') await api.resumeOnboarding(onboarding.id);
            else await api.pauseOnboarding(onboarding.id);
            setStatus(status === 'paused' ? 'in_progress' : 'paused');
            onReload();
        } catch { /* silent */ }
    };

    // Filtro
    const visible = items.filter(it => {
        if (filter === 'pending') return !it.done;
        if (filter === 'client') return !it.done && it.owner === 'client';
        return true;
    });

    // Agrupa por fase, ordenado
    const byPhase = new Map<Phase, OnboardingItem[]>();
    (Object.keys(PHASE_META) as Phase[])
        .sort((a, b) => PHASE_META[a].order - PHASE_META[b].order)
        .forEach(p => byPhase.set(p, []));
    visible.forEach(it => {
        const arr = byPhase.get(it.phase) || [];
        arr.push(it);
        byPhase.set(it.phase, arr);
    });

    const total = items.length;
    const done = items.filter(i => i.done).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
        <div className="drawer-overlay" onClick={onClose}>
            <aside className="drawer" onClick={e => e.stopPropagation()} style={{ maxWidth: 760 }}>
                <div className="drawer-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Building2 size={18} color="var(--primary)" />
                            <h3 style={{ margin: 0, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{onboarding.account_name}</h3>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span>Onboarding · {done}/{total} feitos ({pct}%)</span>
                            <span style={{ color: status === 'paused' ? 'var(--text-muted)' : status === 'completed' ? 'var(--success)' : 'var(--primary)' }}>
                                {status === 'paused' ? '⏸ Pausado' : status === 'completed' ? '✓ Concluído' : '● Em andamento'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {status !== 'completed' && (
                            <button className="btn btn-icon" onClick={togglePause} title={status === 'paused' ? 'Retomar' : 'Pausar'}>
                                {status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                            </button>
                        )}
                        <button onClick={onClose} className="btn btn-icon"><X size={16} /></button>
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{ padding: '0 20px', marginBottom: 16 }}>
                    <div style={{ height: 6, background: 'var(--bg-elev)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{
                            width: `${pct}%`, height: '100%',
                            background: pct === 100 ? 'var(--success)' : 'var(--primary)',
                            transition: 'width 300ms ease',
                        }} />
                    </div>
                </div>

                {/* Filtros */}
                <div style={{ padding: '0 20px 16px', display: 'flex', gap: 6 }}>
                    {[
                        { key: 'all', label: `Todos (${items.length})` },
                        { key: 'pending', label: `Pendentes (${items.filter(i => !i.done).length})` },
                        { key: 'client', label: `Aguardando cliente (${items.filter(i => !i.done && i.owner === 'client').length})` },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key as any)}
                            className="btn"
                            style={{
                                padding: '5px 12px',
                                fontSize: 12,
                                background: filter === f.key ? 'var(--primary)' : 'var(--bg-elev)',
                                color: filter === f.key ? '#fff' : 'var(--text-secondary)',
                                border: 'none',
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Array.from(byPhase.entries()).map(([phase, phaseItems]) => {
                        if (phaseItems.length === 0 && phase !== 'custom') return null;
                        const meta = PHASE_META[phase];
                        const PhaseIcon = meta.icon;
                        const phaseDone = phaseItems.filter(i => i.done).length;
                        return (
                            <div key={phase}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 6, background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <PhaseIcon size={13} color={meta.color} />
                                    </div>
                                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: meta.color }}>
                                        {meta.label}
                                    </h4>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                                        {phaseDone}/{phaseItems.length}
                                    </div>
                                    <div style={{ flex: 1 }} />
                                    <button
                                        onClick={() => setAddingPhase(addingPhase === phase ? null : phase)}
                                        className="btn btn-icon"
                                        title={`Adicionar item em ${meta.label}`}
                                        style={{ opacity: 0.6 }}
                                    >
                                        <PlusCircle size={14} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {phaseItems.map(item => <ItemRow key={item.id} item={item} onToggle={() => toggle(item)} onRemove={() => removeItem(item)} />)}
                                </div>

                                {addingPhase === phase && (
                                    <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elev)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                                        <input
                                            className="form-input"
                                            placeholder="Título do novo item"
                                            value={newTitle}
                                            onChange={e => setNewTitle(e.target.value)}
                                            autoFocus
                                            onKeyDown={e => { if (e.key === 'Enter') addItem(phase); }}
                                            style={{ marginBottom: 8 }}
                                        />
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <select className="form-input" value={newOwner} onChange={e => setNewOwner(e.target.value as Owner)} style={{ maxWidth: 160, fontSize: 12 }}>
                                                <option value="agency">Responsável: Agência</option>
                                                <option value="client">Responsável: Cliente</option>
                                            </select>
                                            <div style={{ flex: 1 }} />
                                            <button className="btn" onClick={() => { setAddingPhase(null); setNewTitle(''); }} style={{ fontSize: 12, padding: '5px 10px' }}>Cancelar</button>
                                            <button className="btn btn-primary" onClick={() => addItem(phase)} style={{ fontSize: 12, padding: '5px 10px' }} disabled={!newTitle.trim()}>Adicionar</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </aside>
        </div>
    );
}

function ItemRow({ item, onToggle, onRemove }: { item: OnboardingItem; onToggle: () => void; onRemove: () => void }) {
    return (
        <div style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: 10,
            background: 'var(--bg-elev)',
            borderRadius: 6,
            opacity: item.done ? 0.55 : 1,
            border: item.done ? '1px solid rgba(123,196,108,0.2)' : '1px solid var(--border)',
        }}>
            <button
                onClick={onToggle}
                style={{
                    flexShrink: 0,
                    marginTop: 2,
                    width: 20, height: 20,
                    borderRadius: 5,
                    border: `2px solid ${item.done ? 'var(--success)' : 'var(--border-strong, var(--border))'}`,
                    background: item.done ? 'var(--success)' : 'transparent',
                    color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                }}
                aria-label={item.done ? 'Desmarcar' : 'Marcar como feito'}
            >
                {item.done && <Check size={12} strokeWidth={3} />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500, textDecoration: item.done ? 'line-through' : 'none' }}>
                        {item.title}
                    </div>
                    <span style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: item.owner === 'client' ? 'rgba(245,164,90,0.14)' : 'rgba(91,141,239,0.14)',
                        color: item.owner === 'client' ? '#f5a45a' : '#5b8def',
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3,
                        flexShrink: 0,
                    }}>
                        {item.owner === 'client' ? 'Cliente' : 'Agência'}
                    </span>
                </div>
                {item.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                        {item.description}
                    </div>
                )}
            </div>
            <button onClick={onRemove} className="btn btn-icon" title="Remover" style={{ opacity: 0.4, flexShrink: 0 }}>
                <Trash2 size={13} />
            </button>
        </div>
    );
}
