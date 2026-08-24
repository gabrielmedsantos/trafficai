'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    Settings2, ChevronLeft, Save, RotateCcw, Plus, Trash2, GripVertical,
    FileText, KeyRound, Search, Wrench, Target, Rocket, Sparkles, Check,
} from 'lucide-react';

type Phase = 'contract' | 'access' | 'discovery' | 'setup' | 'planning' | 'golive' | 'custom';
type Owner = 'agency' | 'client';

interface TemplateItem {
    phase: Phase;
    title: string;
    description: string;
    owner: Owner;
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

export default function TemplateEditorPage() {
    const [items, setItems] = useState<TemplateItem[]>([]);
    const [isCustom, setIsCustom] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [savedFeedback, setSavedFeedback] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.getOnboardingTemplate();
            setItems((res as any).items || []);
            setIsCustom((res as any).is_custom || false);
            setDirty(false);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true);
        try {
            await api.saveOnboardingTemplate(items);
            setDirty(false);
            setIsCustom(true);
            setSavedFeedback(true);
            setTimeout(() => setSavedFeedback(false), 2500);
        } catch (err: any) {
            alert(err.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!confirm('Restaurar o template padrão? Suas customizações serão perdidas.')) return;
        await api.resetOnboardingTemplate();
        load();
    };

    const updateItem = (idx: number, patch: Partial<TemplateItem>) => {
        setItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it));
        setDirty(true);
    };
    const addItem = (phase: Phase) => {
        setItems(items => [...items, { phase, title: '', description: '', owner: 'agency' }]);
        setDirty(true);
    };
    const removeItem = (idx: number) => {
        setItems(items => items.filter((_, i) => i !== idx));
        setDirty(true);
    };
    const moveItem = (idx: number, direction: -1 | 1) => {
        setItems(items => {
            const copy = [...items];
            const target = idx + direction;
            if (target < 0 || target >= copy.length) return copy;
            [copy[idx], copy[target]] = [copy[target], copy[idx]];
            return copy;
        });
        setDirty(true);
    };

    // Agrupa por fase
    const byPhase = new Map<Phase, { item: TemplateItem; originalIdx: number }[]>();
    (Object.keys(PHASE_META) as Phase[])
        .sort((a, b) => PHASE_META[a].order - PHASE_META[b].order)
        .forEach(p => byPhase.set(p, []));
    items.forEach((it, idx) => {
        const arr = byPhase.get(it.phase) || [];
        arr.push({ item: it, originalIdx: idx });
        byPhase.set(it.phase, arr);
    });

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Link href="/onboarding" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 12.5, textDecoration: 'none' }}>
                            <ChevronLeft size={14} /> Onboarding
                        </Link>
                    </div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Settings2 size={22} color="var(--primary)" /> Template de Onboarding
                    </h1>
                    <p>
                        {isCustom
                            ? 'Você tem um template customizado. Todo novo cliente vai usar essa versão.'
                            : 'Você está usando o template padrão. Edite abaixo pra criar sua versão.'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {isCustom && (
                        <button className="btn" onClick={reset} title="Voltar ao template padrão">
                            <RotateCcw size={14} /> Padrão
                        </button>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={save}
                        disabled={saving || !dirty}
                        style={{ opacity: (!dirty && !saving) ? 0.6 : 1 }}
                    >
                        {savedFeedback ? <><Check size={14} /> Salvo</> : saving ? 'Salvando…' : <><Save size={14} /> {dirty ? 'Salvar alterações' : 'Salvo'}</>}
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }} /> Carregando template…
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 840 }}>
                    {Array.from(byPhase.entries()).map(([phase, phaseItems]) => {
                        const meta = PHASE_META[phase];
                        const Icon = meta.icon;
                        return (
                            <div key={phase} className="card" style={{ padding: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 6, background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={15} color={meta.color} />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: meta.color, flex: 1 }}>
                                        {meta.label}
                                    </h3>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{phaseItems.length} item{phaseItems.length !== 1 ? 's' : ''}</div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {phaseItems.map(({ item, originalIdx }, subIdx) => (
                                        <ItemEditor
                                            key={`${originalIdx}-${item.title.slice(0, 10)}`}
                                            item={item}
                                            onChange={patch => updateItem(originalIdx, patch)}
                                            onRemove={() => removeItem(originalIdx)}
                                            onMoveUp={subIdx > 0 ? () => moveItem(originalIdx, -1) : null}
                                            onMoveDown={subIdx < phaseItems.length - 1 ? () => moveItem(originalIdx, 1) : null}
                                        />
                                    ))}
                                </div>

                                <button
                                    onClick={() => addItem(phase)}
                                    className="btn"
                                    style={{ marginTop: 10, fontSize: 12.5, padding: '8px 12px', width: '100%', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)' }}
                                >
                                    <Plus size={13} /> Adicionar item em {meta.label}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {dirty && !loading && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24,
                    background: 'var(--primary)', color: '#fff',
                    padding: '12px 20px', borderRadius: 10,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    display: 'flex', alignItems: 'center', gap: 12,
                    fontSize: 13.5, fontWeight: 500, zIndex: 40,
                }}>
                    Alterações não salvas
                    <button className="btn" onClick={save} style={{ background: '#fff', color: 'var(--primary)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600 }} disabled={saving}>
                        {saving ? 'Salvando…' : 'Salvar agora'}
                    </button>
                </div>
            )}
        </div>
    );
}

function ItemEditor({ item, onChange, onRemove, onMoveUp, onMoveDown }: {
    item: TemplateItem;
    onChange: (patch: Partial<TemplateItem>) => void;
    onRemove: () => void;
    onMoveUp: (() => void) | null;
    onMoveDown: (() => void) | null;
}) {
    return (
        <div style={{ padding: 12, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', paddingTop: 4 }}>
                <button className="btn btn-icon" onClick={onMoveUp || undefined} disabled={!onMoveUp} style={{ opacity: onMoveUp ? 1 : 0.2, padding: 2, width: 20, height: 16 }}>▲</button>
                <GripVertical size={12} color="var(--text-muted)" style={{ opacity: 0.4 }} />
                <button className="btn btn-icon" onClick={onMoveDown || undefined} disabled={!onMoveDown} style={{ opacity: onMoveDown ? 1 : 0.2, padding: 2, width: 20, height: 16 }}>▼</button>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                    className="form-input"
                    placeholder="Título do item (obrigatório)"
                    value={item.title}
                    onChange={e => onChange({ title: e.target.value })}
                    style={{ fontSize: 13.5, padding: '6px 10px' }}
                />
                <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Descrição / detalhes (opcional)"
                    value={item.description}
                    onChange={e => onChange({ description: e.target.value })}
                    style={{ fontSize: 12.5, padding: '6px 10px' }}
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                        className="form-input"
                        value={item.phase}
                        onChange={e => onChange({ phase: e.target.value as Phase })}
                        style={{ fontSize: 11.5, padding: '4px 8px', maxWidth: 160 }}
                    >
                        {(Object.keys(PHASE_META) as Phase[]).map(p => (
                            <option key={p} value={p}>{PHASE_META[p].label}</option>
                        ))}
                    </select>
                    <select
                        className="form-input"
                        value={item.owner}
                        onChange={e => onChange({ owner: e.target.value as Owner })}
                        style={{ fontSize: 11.5, padding: '4px 8px', maxWidth: 140 }}
                    >
                        <option value="agency">Agência executa</option>
                        <option value="client">Cliente executa</option>
                    </select>
                </div>
            </div>

            <button onClick={onRemove} className="btn btn-icon" title="Remover" style={{ opacity: 0.5, color: 'var(--danger, #e05a4a)' }}>
                <Trash2 size={13} />
            </button>
        </div>
    );
}
