'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAccount } from '@/app/AccountContext';
import { Zap, Plus, Play, Pause, Trash2, Edit3, PlayCircle, CheckCircle2, XCircle, Bot } from 'lucide-react';

const METRICS = [
    { v: 'cpa', l: 'CPA (Custo por Aquisição)' },
    { v: 'ctr', l: 'CTR (%)' },
    { v: 'cpc', l: 'CPC (R$)' },
    { v: 'cpm', l: 'CPM (R$)' },
    { v: 'spend', l: 'Gasto (R$)' },
    { v: 'roas', l: 'ROAS' },
];
const OPERATORS = [
    { v: '>', l: 'maior que (>)' },
    { v: '<', l: 'menor que (<)' },
    { v: '>=', l: 'maior ou igual (≥)' },
    { v: '<=', l: 'menor ou igual (≤)' },
];
const PERIODS = [
    { v: 'today', l: 'Hoje' },
    { v: 'yesterday', l: 'Ontem' },
    { v: 'last_3d', l: 'Últimos 3 dias' },
    { v: 'last_7d', l: 'Últimos 7 dias' },
];
const ACTIONS = [
    { v: 'pause_campaign', l: 'Pausar campanha' },
    { v: 'enable_campaign', l: 'Reativar campanha' },
    { v: 'notify_only', l: 'Só notificar (sem alterar)' },
];

export default function AutomationPage() {
    const { accounts } = useAccount();
    const [rules, setRules] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<any | null>(null);

    async function load() {
        setLoading(true);
        try { setRules(await api.getAutomationRules()); } finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []);

    async function toggleActive(r: any) {
        await api.updateAutomationRule(r.id, { is_active: !r.is_active });
        load();
    }
    async function del(r: any) {
        if (!confirm(`Excluir regra "${r.name}"?`)) return;
        await api.deleteAutomationRule(r.id);
        load();
    }
    async function run(r: any) {
        try {
            const res = await api.runAutomationRule(r.id);
            alert(`Avaliadas ${res.evaluated} campanhas, ${res.triggered} ação(ões) executada(s)`);
            load();
        } catch (e: any) { alert('Erro: ' + e.message); }
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Zap size={28} style={{ color: 'var(--accent-orange)' }} /> Automações
                    </h1>
                    <p>Regras SE/ENTÃO — pausa, ativa ou notifica quando métricas fogem do esperado</p>
                </div>
                <button className="btn btn-primary" onClick={() => setEditing({})}>
                    <Plus size={16} /> Nova regra
                </button>
            </div>

            {loading ? <div className="card empty-state">Carregando…</div>
            : rules.length === 0 ? (
                <div className="card empty-state">
                    <Bot size={48} style={{ margin: '0 auto 16px', color: 'var(--accent-orange)', opacity: .4 }} />
                    <h3>Sem regras ainda</h3>
                    <p>Ex: "Se CPA {'>'} R$ 30 ontem, pausar campanha"</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                    {rules.map(r => <RuleCard key={r.id} rule={r} onEdit={() => setEditing(r)} onToggle={() => toggleActive(r)} onDelete={() => del(r)} onRun={() => run(r)} />)}
                </div>
            )}

            {editing !== null && (
                <RuleModal
                    rule={editing}
                    accounts={accounts}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

function RuleCard({ rule, onEdit, onToggle, onDelete, onRun }: any) {
    const metricLabel = METRICS.find(m => m.v === rule.condition_metric)?.l || rule.condition_metric;
    const opLabel = OPERATORS.find(o => o.v === rule.condition_operator)?.l || rule.condition_operator;
    const periodLabel = PERIODS.find(p => p.v === rule.condition_period)?.l || rule.condition_period;
    const actionLabel = ACTIONS.find(a => a.v === rule.action)?.l || rule.action;

    return (
        <div className="card" style={{ borderLeft: `3px solid ${rule.is_active ? 'var(--accent-green)' : 'var(--text-muted)'}`, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{rule.name}</h3>
                        {rule.account_name && <span style={{ fontSize: 11, background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-muted)' }}>{rule.account_name}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        SE <strong>{metricLabel}</strong> {opLabel.replace(/\(.+\)/, '')} <strong>{rule.condition_value}</strong> em <strong>{periodLabel.toLowerCase()}</strong>
                        <br />
                        ENTÃO <strong style={{ color: rule.action === 'pause_campaign' ? 'var(--accent-red)' : rule.action === 'enable_campaign' ? 'var(--accent-green)' : 'var(--accent-blue)' }}>{actionLabel}</strong>
                    </div>
                    {rule.last_triggered_at && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                            Último disparo: {new Date(rule.last_triggered_at).toLocaleString('pt-BR')} · Total: {rule.trigger_count}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" title="Rodar agora" onClick={onRun} style={{ padding: 8 }}><PlayCircle size={16} /></button>
                    <button className="btn" title={rule.is_active ? 'Desativar' : 'Ativar'} onClick={onToggle} style={{ padding: 8 }}>
                        {rule.is_active ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button className="btn" title="Editar" onClick={onEdit} style={{ padding: 8 }}><Edit3 size={16} /></button>
                    <button className="btn" title="Excluir" onClick={onDelete} style={{ padding: 8, color: 'var(--accent-red)' }}><Trash2 size={16} /></button>
                </div>
            </div>
        </div>
    );
}

function RuleModal({ rule, accounts, onClose, onSaved }: any) {
    const isNew = !rule.id;
    const [form, setForm] = useState<any>({
        name: rule.name || '',
        account_id: rule.account_id || '',
        scope: rule.scope || 'campaign',
        condition_metric: rule.condition_metric || 'cpa',
        condition_operator: rule.condition_operator || '>',
        condition_value: rule.condition_value || 30,
        condition_period: rule.condition_period || 'yesterday',
        action: rule.action || 'pause_campaign',
        is_active: rule.is_active !== false,
        cooldown_hours: rule.cooldown_hours || 24,
    });
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            const payload = { ...form, condition_value: Number(form.condition_value), account_id: form.account_id || null };
            if (isNew) await api.createAutomationRule(payload);
            else await api.updateAutomationRule(rule.id, payload);
            onSaved();
        } catch (e: any) { alert('Erro: ' + e.message); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <h2 style={{ marginTop: 0 }}>{isNew ? 'Nova regra' : 'Editar regra'}</h2>

                <div className="form-group">
                    <label className="form-label">Nome</label>
                    <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Pausar campanha ruim de CPA" />
                </div>
                <div className="form-group">
                    <label className="form-label">Conta (deixe vazio = todas)</label>
                    <select className="form-input" value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                        <option value="">Todas as contas</option>
                        {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
                    </select>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--accent-orange)', fontWeight: 700, marginBottom: 10 }}>SE</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        <select className="form-input" value={form.condition_metric} onChange={e => setForm({ ...form, condition_metric: e.target.value })}>
                            {METRICS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                        </select>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <select className="form-input" value={form.condition_operator} onChange={e => setForm({ ...form, condition_operator: e.target.value })}>
                                {OPERATORS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                            </select>
                            <input className="form-input" type="number" step="0.01" value={form.condition_value} onChange={e => setForm({ ...form, condition_value: e.target.value })} />
                        </div>
                        <select className="form-input" value={form.condition_period} onChange={e => setForm({ ...form, condition_period: e.target.value })}>
                            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
                        </select>
                    </div>
                </div>

                <div style={{ background: 'var(--bg-input)', padding: 14, borderRadius: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 700, marginBottom: 10 }}>ENTÃO</div>
                    <select className="form-input" value={form.action} onChange={e => setForm({ ...form, action: e.target.value })}>
                        {ACTIONS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Cooldown entre disparos (horas)</label>
                    <input className="form-input" type="number" value={form.cooldown_hours} onChange={e => setForm({ ...form, cooldown_hours: e.target.value })} />
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                    Regra ativa
                </label>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving || !form.name}>
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
