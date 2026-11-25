'use client';

import { useCallback, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const brl = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const day = (value: string) => value.slice(0, 10);
const dateLabel = (value: string) => new Date(`${day(value)}T12:00:00`).toLocaleDateString('pt-BR');
const monthLabel = (value: string) => new Date(`${day(value)}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
interface Billing {
    id: string; reference_month: string; due_date: string | null; total_amount: number;
    status: string; paid_at: string | null; payment_method: string | null; contract_description: string;
}
const button = { border: '1px solid var(--border)', background: 'var(--bg-surface-2)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };
const input = { width: '100%', boxSizing: 'border-box' as const, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 5 };

export default function ClientBillingLedger({ clientId, onChanged }: { clientId: string; onChanged?: () => void }) {
    const [records, setRecords] = useState<Billing[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [selected, setSelected] = useState<Billing | null>(null);
    const [receivedDate, setReceivedDate] = useState(today);
    const [method, setMethod] = useState('PIX');
    const [saving, setSaving] = useState(false);
    const [history, setHistory] = useState(false);
    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const response = await fetch(`${API}/financial/billing?client_id=${encodeURIComponent(clientId)}&all=true`, { headers: { Authorization: `Bearer ${localStorage.getItem('trafficai_token') || ''}` } });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error?.message || 'Não foi possível carregar as mensalidades.');
            setRecords(data.data);
        } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar mensalidades.'); }
        finally { setLoading(false); }
    }, [clientId]);
    useEffect(() => { setSelected(null); setMessage(''); setHistory(false); load(); }, [load]);
    const unpaid = records.filter(r => r.status !== 'paid');
    const overdue = unpaid.filter(r => day(r.due_date || r.reference_month) < today());
    const upcoming = unpaid.filter(r => day(r.due_date || r.reference_month) >= today());
    const sum = (rows: Billing[]) => rows.reduce((total, row) => total + Number(row.total_amount), 0);
    async function receive() {
        if (!selected || saving) return;
        setSaving(true); setError('');
        try {
            const response = await fetch(`${API}/financial/billing/${selected.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('trafficai_token') || ''}` },
                body: JSON.stringify({ status: 'paid', paid_at: receivedDate, payment_method: method }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error?.message || 'O recebimento não foi salvo.');
            setSelected(null); setMessage('Recebimento registrado. A mensalidade foi baixada e o financeiro atualizado.');
            await load(); onChanged?.();
        } catch (e) { setError(e instanceof Error ? e.message : 'O recebimento não foi salvo.'); }
        finally { setSaving(false); }
    }
    return <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, color: 'var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Mensalidades e recebimentos</h3>
            <button type="button" style={button} onClick={load} disabled={loading || saving}>Atualizar</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Baixe a mensalidade correspondente, começando pela mais antiga. A receita entra no caixa na data do recebimento.</p>
        {error && <div role="alert" style={{ color: '#f87171', padding: '10px 0' }}>{error}</div>}
        {message && <div role="status" style={{ color: '#10b981', padding: '10px 0' }}>{message}</div>}
        {loading ? <p>Carregando mensalidades…</p> : <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                <div><small>Em atraso ({overdue.length})</small><div style={{ color: overdue.length ? '#f87171' : '#10b981', fontWeight: 700 }}>{brl(sum(overdue))}</div></div>
                <div><small>A vencer ({upcoming.length})</small><div>{brl(sum(upcoming))}</div></div>
                <div><small>Total em aberto</small><div>{brl(sum(unpaid))}</div></div>
            </div>
            {selected && <form onSubmit={e => { e.preventDefault(); receive(); }} style={{ border: '1px solid var(--primary)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
                <strong>Receber {brl(selected.total_amount)} · {monthLabel(selected.reference_month)}</strong>
                <p style={{ fontSize: 12 }}>Confirme somente se o pagamento foi recebido. Esta baixa quita apenas a mensalidade selecionada.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                    <label>Data do recebimento<input required type="date" max={today()} value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={input} /></label>
                    <label>Forma de pagamento<select value={method} onChange={e => setMethod(e.target.value)} style={input}>{['PIX','Transferência','Boleto','Cartão','Dinheiro','Outro'].map(m => <option key={m}>{m}</option>)}</select></label>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button type="submit" disabled={saving} style={{ ...button, background: '#059669', color: '#fff', opacity: saving ? .6 : 1 }}>{saving ? 'Salvando…' : 'Confirmar recebimento'}</button>
                    <button type="button" disabled={saving} style={button} onClick={() => setSelected(null)}>Cancelar</button>
                </div>
            </form>}
            {unpaid.length === 0 && <p style={{ color: '#10b981' }}>{records.length ? 'Nenhuma mensalidade em aberto.' : 'Nenhuma cobrança cadastrada para este cliente.'}</p>}
            {unpaid.map((r, index) => {
                const late = day(r.due_date || r.reference_month) < today();
                return <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', padding: '12px 0' }}>
                    <div><strong>{monthLabel(r.reference_month)}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{r.contract_description} · vence {dateLabel(r.due_date || r.reference_month)}</div><small style={{ color: late ? '#f87171' : 'var(--text-muted)' }}>{late ? 'Em atraso' : 'A vencer'}{index === 0 ? ' · mais antiga em aberto' : ''}</small></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><strong>{brl(r.total_amount)}</strong><button type="button" style={button} disabled={saving} onClick={() => { setSelected(r); setReceivedDate(today()); setMethod('PIX'); setMessage(''); }}>Registrar pagamento</button></div>
                </div>;
            })}
            {records.some(r => r.status === 'paid') && <>
                <button type="button" style={{ ...button, marginTop: 10 }} onClick={() => setHistory(!history)}>{history ? 'Ocultar' : 'Ver'} pagamentos anteriores</button>
                {history && records.filter(r => r.status === 'paid').map(r => <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}><strong>{monthLabel(r.reference_month)} · {brl(r.total_amount)}</strong><div style={{ color: 'var(--text-muted)' }}>{r.paid_at ? `Recebido em ${new Date(r.paid_at).toLocaleDateString('pt-BR', { timeZone: 'America/Fortaleza' })}` : 'Data de recebimento não informada'}{r.payment_method ? ` · ${r.payment_method}` : ''}</div></div>)}
            </>}
        </>}
    </section>;
}
