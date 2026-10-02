'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useVendas, Card, SectionTitle, ErrorBox, brl, brtToday, selectStyle, thStyle } from '@/components/vendas/shared';

const parseMoney = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.'));

export default function CustosPage() {
    const { sourceId, since, until, reloadToken } = useVendas();
    const [settings, setSettings] = useState<any>(null);
    const [products, setProducts] = useState<{ product_name: string; orders: string }[]>([]);
    const [taxInput, setTaxInput] = useState('');
    const [costInputs, setCostInputs] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    const [expenses, setExpenses] = useState<any[]>([]);
    const [form, setForm] = useState({ expense_date: brtToday(), description: '', category: '', amount: '' });
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        if (!sourceId) return;
        setError('');
        api.getSalesSettings(sourceId).then((r) => {
            setSettings(r.settings);
            setProducts(r.products || []);
            setTaxInput(r.settings.tax_rate ? String(r.settings.tax_rate).replace('.', ',') : '');
            const c: Record<string, string> = {};
            for (const [k, v] of Object.entries(r.settings.product_costs || {})) c[k] = String(v).replace('.', ',');
            setCostInputs(c);
        }).catch((e) => setError(e.message || 'Erro ao carregar configurações'));
    }, [sourceId]);

    useEffect(() => {
        if (!sourceId) return;
        api.getSalesExpenses(sourceId, { since, until }).then((r) => setExpenses(r || [])).catch(() => setExpenses([]));
    }, [sourceId, since, until, reloadToken]);

    async function saveCosts() {
        setSaving(true); setError(''); setSaved(false);
        try {
            const product_costs: Record<string, number> = {};
            for (const [k, v] of Object.entries(costInputs)) {
                if (v.trim() === '') continue;
                const n = parseMoney(v);
                if (!Number.isFinite(n) || n < 0) throw new Error(`Custo inválido em "${k}"`);
                product_costs[k] = n;
            }
            const tax = taxInput.trim() === '' ? 0 : parseMoney(taxInput);
            if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error('Imposto deve ser entre 0 e 100%');
            const r = await api.updateSalesSettings(sourceId, { tax_rate: tax, product_costs });
            setSettings(r);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e: any) {
            setError(e.message || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    }

    async function addExpense(e: React.FormEvent) {
        e.preventDefault();
        const amount = parseMoney(form.amount);
        if (!form.description.trim() || !Number.isFinite(amount) || amount < 0) { setError('Preencha descrição e valor da despesa'); return; }
        setAdding(true); setError('');
        try {
            const row = await api.createSalesExpense(sourceId, { ...form, amount, category: form.category || undefined });
            if (row.expense_date >= since && row.expense_date <= until) setExpenses((l) => [row, ...l]);
            setForm({ expense_date: form.expense_date, description: '', category: form.category, amount: '' });
        } catch (err: any) {
            setError(err.message || 'Erro ao adicionar despesa');
        } finally {
            setAdding(false);
        }
    }

    async function removeExpense(id: string) {
        if (!window.confirm('Excluir essa despesa?')) return;
        try {
            await api.deleteSalesExpense(sourceId, id);
            setExpenses((l) => l.filter((x) => x.id !== id));
        } catch (err: any) {
            setError(err.message || 'Erro ao excluir');
        }
    }

    const productNames = Array.from(new Set([...products.map(p => p.product_name), ...Object.keys(costInputs)]));
    const expTotal = expenses.reduce((n, x) => n + Number(x.amount || 0), 0);
    const field: React.CSSProperties = { ...selectStyle, width: '100%' };

    return (
        <>
            {error && <ErrorBox>{error}</ErrorBox>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12, alignItems: 'start' }}>
                <Card flat style={{ padding: '16px 18px' }}>
                    <SectionTitle>Imposto e custo de produto</SectionTitle>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 14 }}>
                        Imposto sobre o faturamento (%)
                        <input className="input" value={taxInput} onChange={(e) => setTaxInput(e.target.value)} placeholder="Ex: 6 (Simples Nacional)" inputMode="decimal"
                            style={{ ...field, marginTop: 5, maxWidth: 200, display: 'block' }} />
                        <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--text-muted)' }}>Aplicado sobre o faturamento líquido de cada venda aprovada.</span>
                    </label>

                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Custo unitário por produto (R$)</div>
                    {productNames.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Os produtos aparecem aqui assim que o primeiro pedido chegar pelo webhook.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                            {productNames.map((name) => (
                                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                                        {name}
                                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {products.find(p => p.product_name === name)?.orders || 0} pedidos</span>
                                    </span>
                                    <input className="input" value={costInputs[name] || ''} onChange={(e) => setCostInputs((c) => ({ ...c, [name]: e.target.value }))}
                                        placeholder="0,00" inputMode="decimal" aria-label={`Custo de ${name}`} style={{ ...selectStyle, width: 110, textAlign: 'right' }} />
                                </div>
                            ))}
                        </div>
                    )}
                    <button type="button" className="btn btn-primary btn-sm" onClick={saveCosts} disabled={saving || !settings} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Save size={13} /> {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar custos'}
                    </button>
                </Card>

                <Card flat style={{ padding: '16px 18px' }}>
                    <SectionTitle right={<span className="num" style={{ fontSize: 12, fontWeight: 700 }}>{brl(expTotal)} no período</span>}>Despesas adicionais</SectionTitle>
                    <form onSubmit={addExpense} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 110px auto', gap: 6, marginBottom: 12 }}>
                        <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} style={selectStyle} aria-label="Data" />
                        <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição (ex: ferramenta, editor)" style={selectStyle} />
                        <input className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Valor" inputMode="decimal" style={{ ...selectStyle, textAlign: 'right' }} />
                        <button type="submit" className="btn btn-secondary btn-sm" disabled={adding} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Plus size={13} /> Lançar
                        </button>
                    </form>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-input)' }}>
                                    <th style={thStyle('left', false)}>Data</th>
                                    <th style={thStyle('left', false)}>Descrição</th>
                                    <th style={thStyle('right', false)}>Valor</th>
                                    <th style={thStyle('right', false)} />
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma despesa lançada no período.</td></tr>
                                )}
                                {expenses.map((x) => (
                                    <tr key={x.id} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>{new Date(`${x.expense_date}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                        <td style={{ padding: '7px 12px' }}>{x.description}</td>
                                        <td className="num" style={{ padding: '7px 12px', textAlign: 'right' }}>{brl(Number(x.amount))}</td>
                                        <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                                            <button type="button" onClick={() => removeExpense(x.id)} className="btn btn-ghost btn-sm" aria-label="Excluir despesa" style={{ padding: 4 }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Lucro = faturamento líquido − gastos com anúncios − imposto − custo de produto − despesas adicionais. Taxas da plataforma já saem no líquido.
            </p>
        </>
    );
}
