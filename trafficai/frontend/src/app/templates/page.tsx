'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FileText, Calendar, Bell, Plus, Edit3, Trash2, Copy, Facebook, Search } from 'lucide-react';

const CATEGORIES = [
    { v: 'daily_report', l: 'Relatórios diários', icon: <FileText size={18} />, desc: 'Gasto, impressões, cliques e resultados do dia.' },
    { v: 'weekly_report', l: 'Relatórios semanais', icon: <Calendar size={18} />, desc: 'Resumo de desempenho e evolução dos últimos sete dias.' },
    { v: 'monthly_report', l: 'Relatórios mensais', icon: <Calendar size={18} />, desc: 'Balanço mensal consolidado de resultados e performance.' },
    { v: 'billing_alert', l: 'Alertas de cobrança', icon: <Bell size={18} />, desc: 'Mensagem enviada quando o saldo fica abaixo do indicador.' },
];

const CHANNELS = [
    { v: 'meta', l: 'Facebook Ads', icon: <Facebook size={18} color="#1877F2" />, desc: 'Mensagens para relatórios e alertas do Facebook Ads' },
    { v: 'google', l: 'Google Ads', icon: <Search size={18} color="#4285F4" />, desc: 'Mensagens para relatórios e alertas do Google Ads', badge: 'Beta' },
];

export default function TemplatesPage() {
    const [summary, setSummary] = useState<Array<{ channel: string; category: string; count: number }>>([]);
    const [selected, setSelected] = useState<{ channel: string; category: string } | null>(null);

    async function loadSummary() {
        try { setSummary(await api.templatesSummary()); } catch (e) { console.error(e); }
    }
    useEffect(() => { loadSummary(); }, []);

    function countFor(ch: string, cat: string): number {
        const row = summary.find(s => s.channel === ch && s.category === cat);
        return row?.count || 0;
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        📚 Templates
                    </h1>
                    <p>Biblioteca de mensagens reutilizáveis pra relatórios e alertas</p>
                </div>
            </div>

            {CHANNELS.map(ch => (
                <div key={ch.v} className="card" style={{ marginBottom: 20, padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        {ch.icon}
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{ch.l}</h3>
                        {ch.badge && <span style={{ fontSize: 10, padding: '2px 8px', background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 4, fontWeight: 700, letterSpacing: '.06em' }}>{ch.badge}</span>}
                        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                            {summary.filter(s => s.channel === ch.v).reduce((a, b) => a + b.count, 0)} templates
                        </div>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>{ch.desc}</p>

                    <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 700 }}>
                            <div>Tipo de mensagem</div>
                            <div style={{ textAlign: 'center' }}>Biblioteca</div>
                            <div style={{ textAlign: 'right' }}>Ação</div>
                        </div>
                        {CATEGORIES.map(cat => (
                            <div key={cat.v} className="card" style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 120px 120px',
                                padding: '14px 16px',
                                alignItems: 'center',
                                background: 'var(--bg-secondary)',
                                border: 'none',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-input)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}>{cat.icon}</div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{cat.l}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cat.desc}</div>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, color: countFor(ch.v, cat.v) > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                                    {countFor(ch.v, cat.v)} templates
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <button className="btn" onClick={() => setSelected({ channel: ch.v, category: cat.v })} style={{ padding: '6px 12px', fontSize: 12 }}>
                                        Gerenciar →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {selected && (
                <TemplatesModal
                    channel={selected.channel}
                    category={selected.category}
                    onClose={() => setSelected(null)}
                    onChanged={loadSummary}
                />
            )}
        </div>
    );
}

function TemplatesModal({ channel, category, onClose, onChanged }: any) {
    const [list, setList] = useState<any[]>([]);
    const [editing, setEditing] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try { setList(await api.listTemplates({ channel, category })); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, [channel, category]);

    const catLabel = CATEGORIES.find(c => c.v === category)?.l || category;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0 }}>{catLabel}</h2>
                    <button className="btn btn-primary" onClick={() => setEditing({})}>
                        <Plus size={14} /> Novo template
                    </button>
                </div>

                {loading ? <div className="empty-state">Carregando…</div>
                : list.length === 0 ? (
                    <div className="empty-state" style={{ padding: 40 }}>
                        <p>Sem templates ainda. Crie o primeiro.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {list.map(t => (
                            <div key={t.id} className="card" style={{ padding: 14, background: 'var(--bg-secondary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                            <strong>{t.name}</strong>
                                            {t.is_default && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--primary-soft)', color: 'var(--primary)', borderRadius: 4, fontWeight: 700 }}>PADRÃO</span>}
                                            {!t.is_active && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--bg-input)', color: 'var(--text-muted)', borderRadius: 4 }}>INATIVO</span>}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t.description || '(sem descrição)'}</div>
                                        <pre style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.4 }}>{t.body.slice(0, 200)}{t.body.length > 200 ? '…' : ''}</pre>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button className="btn" onClick={() => setEditing(t)} title="Editar" style={{ padding: 6 }}><Edit3 size={13} /></button>
                                        <button className="btn" onClick={async () => {
                                            if (!confirm(`Excluir "${t.name}"?`)) return;
                                            await api.deleteTemplate(t.id); load(); onChanged();
                                        }} title="Excluir" style={{ padding: 6, color: 'var(--accent-red)' }}><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'right' }}>
                    <button className="btn" onClick={onClose}>Fechar</button>
                </div>
            </div>

            {editing && (
                <TemplateEditor
                    template={editing}
                    channel={channel}
                    category={category}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); onChanged(); }}
                />
            )}
        </div>
    );
}

function TemplateEditor({ template, channel, category, onClose, onSaved }: any) {
    const isNew = !template.id;
    const [form, setForm] = useState({
        name: template.name || '',
        description: template.description || '',
        body: template.body || '',
        is_default: template.is_default || false,
        is_active: template.is_active !== false,
    });
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            if (isNew) await api.createTemplate({ ...form, channel, category });
            else await api.updateTemplate(template.id, form);
            onSaved();
        } catch (e: any) { alert('Erro: ' + e.message); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 20 }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <h2 style={{ marginTop: 0 }}>{isNew ? 'Novo' : 'Editar'} template</h2>

                <div className="form-group">
                    <label className="form-label">Nome</label>
                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Relatório WhatsApp cliente premium" />
                </div>
                <div className="form-group">
                    <label className="form-label">Descrição (opcional)</label>
                    <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                    <label className="form-label">Corpo da mensagem</label>
                    <textarea className="form-input" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={12}
                        placeholder="Use variáveis: {greeting}, {client_name}, {today_spend}, {today_leads}, {today_cpl}, {last7d_spend}, {month_spend}, {activeAds} etc." />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Variáveis: {'{greeting}, {client_name}, {today_label}, {today_spend}, {today_leads}, {today_cpl}, {last7d_*}, {month_*}, {activeAds}'}
                    </div>
                </div>

                <label style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                    Usar como padrão pra novas contas
                </label>
                <label style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                    Template ativo
                </label>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving || !form.name || !form.body}>
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
