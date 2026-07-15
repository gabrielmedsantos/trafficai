'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, X, ArrowUpCircle, ArrowDownCircle,
    Wallet, TrendingUp, TrendingDown, RefreshCw, Trash2, Edit2,
    ChevronDown, RotateCcw, FileText, Percent,
    CheckCircle2, Clock, AlertCircle, Zap, DollarSign,
    Users, UserMinus, UserPlus, BarChart3, Repeat, Target,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

// ─── Types ─────────────────────────────────────────────────────────────────

interface DashboardData {
    regime?: 'cash' | 'accrual';
    income: number;
    expense: number;
    balance: number;
    income_breakdown?: { transactions: number; contracts_paid: number; pending_tx?: number; pending_contracts?: number };
    expense_breakdown?: { transactions: number; pending_tx?: number };
    receivable?: number;
    receivable_breakdown?: { pending: number; overdue: number; pending_tx?: number };
    byCategory: { type: string; category: string; total: number }[];
    incomeByCategory?: { type: string; category: string; total: number }[];
    expenseByCategory?: { type: string; category: string; total: number }[];
    recent: Transaction[];
    accounts: FinancialAccount[];
    dailyFlow: { date: string; type: string; total: number }[];
    period: { month: number; year: number; startDate: string; endDate: string };
}

interface MetricsData {
    mrr: number;
    arr: number;
    mrc: number;
    avg_ticket: number;
    active_clients: number;
    clients_with_contract: number;
    revenue_this_month: number;
    revenue_last_month: number;
    revenue_growth_pct: number | null;
    expense_realized: number;
    profit_realized: number;
    profit_estimate_monthly: number;
    churned_3mo: number;
    churned_this_month: number;
    churn_rate_3mo_pct: number;
    new_clients_this_month: number;
}

interface RevenueByClient {
    client_id: string;
    client_name: string;
    avatar_color: string;
    client_status: string;
    tx_income: number;
    contract_paid: number;
    contract_pending: number;
    total_paid: number;
}

interface Transaction {
    id: string;
    type: 'income' | 'expense';
    category: string | null;
    description: string;
    amount: number;
    date: string;
    status: string;
    payment_method: string | null;
    client_name: string | null;
    account_name: string | null;
    notes: string | null;
}

interface FinancialAccount {
    id: string;
    name: string;
    type: string;
    balance: number;
    currency: string;
}

interface Client {
    id: string;
    name: string;
}

interface BillingRecord {
    id: string;
    contract_id: string;
    client_id: string;
    client_name: string;
    avatar_color: string;
    contract_description: string;
    contract_type: string;
    percentage: number;
    percentage_base: string;
    billing_day: number;
    due_date: string | null;
    reference_month: string;
    fixed_amount: number;
    percentage_amount: number;
    total_amount: number;
    status: 'pending' | 'paid' | 'overdue';
    paid_at: string | null;
    payment_method: string | null;
    notes: string | null;
}

interface BillingSummary {
    client_id: string;
    client_name: string;
    avatar_color: string;
    pending_count: number;
    total_owed: number;
    total_paid: number;
    oldest_pending: string | null;
}

interface TxForm {
    type: 'income' | 'expense';
    description: string;
    amount: string;
    date: string;
    category: string;
    payment_method: string;
    notes: string;
    client_id: string;
    account_id: string;
    status: string;
}

const emptyTxForm: TxForm = {
    type: 'income', description: '', amount: '', date: new Date().toISOString().split('T')[0],
    category: '', payment_method: '', notes: '', client_id: '', account_id: '', status: 'confirmed',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const INCOME_CATEGORIES = ['Honorários', 'Consultoria', 'Gestão de Tráfego', 'Criação de Conteúdo', 'Estratégia Digital', 'Outros'];
const EXPENSE_CATEGORIES = ['Ferramentas', 'Salários', 'Plataformas de Anúncios', 'Hospedagem', 'Software', 'Marketing', 'Operacional', 'Impostos', 'Outros'];
const PAYMENT_METHODS = ['PIX', 'Transferência Bancária', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Outros'];

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function formatBRL(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Normaliza uma string de data que pode vir como "YYYY-MM-DD"
// ou ISO completo "YYYY-MM-DDTHH:mm:ss.sssZ" e retorna um Date ao meio-dia UTC
// para evitar problemas de timezone deslocando o dia.
function safeDate(dateStr: string | Date): Date | null {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    const base = String(dateStr).slice(0, 10);
    const d = new Date(base + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
}

function formatDate(dateStr: string) {
    const d = safeDate(dateStr);
    return d ? d.toLocaleDateString('pt-BR') : '';
}

function fmtMonthYear(dateStr: string): string {
    const d = safeDate(dateStr);
    return d ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '';
}

// Computa status de pagamento baseado em due_date + status
// Retorna label, cor e dias até/desde o vencimento.
function dueStatus(due_date: string | null | undefined, status: string): {
    label: string; color: string; sub: string;
} {
    if (status === 'paid') return { label: 'Pago', color: '#10b981', sub: '' };
    const d = safeDate(due_date || '');
    if (!d) return { label: status === 'overdue' ? 'Atrasado' : 'Pendente', color: status === 'overdue' ? '#ef4444' : '#f59e0b', sub: '' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    const dueStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    if (diffDays > 1)   return { label: 'Em dia',    color: '#10b981', sub: `vence em ${diffDays} dias (${dueStr})` };
    if (diffDays === 1) return { label: 'Em dia',    color: '#10b981', sub: `vence amanhã (${dueStr})` };
    if (diffDays === 0) return { label: 'Vence hoje', color: '#f59e0b', sub: `até hoje (${dueStr})` };
    if (diffDays === -1) return { label: 'Atrasado', color: '#ef4444', sub: `1 dia de atraso (venceu ${dueStr})` };
    return { label: 'Atrasado', color: '#ef4444', sub: `${-diffDays} dias de atraso (venceu ${dueStr})` };
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    confirmed: { label: 'Confirmado', color: '#10b981' },
    pending:   { label: 'Pendente',   color: '#f59e0b' },
    cancelled: { label: 'Cancelado',  color: '#ef4444' },
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function FinanceiroPage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [dashboard, setDashboard] = useState<DashboardData | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'management' | 'income' | 'expense' | 'recurring' | 'contracts'>('overview');
    const [regime, setRegime] = useState<'cash' | 'accrual'>('accrual');

    // Management
    const [metrics, setMetrics] = useState<MetricsData | null>(null);
    const [revenueByClient, setRevenueByClient] = useState<RevenueByClient[]>([]);
    const [loadingManagement, setLoadingManagement] = useState(false);
    const [showTxModal, setShowTxModal] = useState(false);
    const [txForm, setTxForm] = useState<TxForm>(emptyTxForm);
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);
    const [saving, setSaving] = useState(false);
    const [txError, setTxError] = useState('');
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Recurring
    const [recurringList, setRecurringList] = useState<any[]>([]);

    // Contracts
    const [contractsList, setContractsList] = useState<any[]>([]);
    const [loadingContracts, setLoadingContracts] = useState(false);

    // Billing
    const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
    const [billingSummary, setBillingSummary] = useState<BillingSummary[]>([]);
    const [loadingBilling, setLoadingBilling] = useState(false);
    const [billingMonths, setBillingMonths] = useState(3);
    const [generatingBilling, setGeneratingBilling] = useState(false);
    const [billingModal, setBillingModal] = useState<BillingRecord | null>(null);
    const [billingForm, setBillingForm] = useState({ status: 'paid', percentage_amount: '', payment_method: '', notes: '', due_date: '' });

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [dashRes, txRes, clientsRes, accountsRes] = await Promise.all([
                fetch(`${API}/financial/dashboard?month=${month}&year=${year}&regime=${regime}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/financial/transactions?month=${month}&year=${year}&limit=100`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/clients`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/financial/accounts`, { headers: { Authorization: `Bearer ${token()}` } }),
            ]);
            const [dash, tx, cl, acc] = await Promise.all([dashRes.json(), txRes.json(), clientsRes.json(), accountsRes.json()]);
            if (dash.success) setDashboard(dash.data);
            if (tx.success) setTransactions(tx.data);
            if (cl.success) setClients(cl.data);
            if (acc.success) setAccounts(acc.data);
        } catch {
            // ignore
        } finally {
            setLoading(false);
        }
    }, [month, year, regime]);

    const fetchManagement = useCallback(async () => {
        setLoadingManagement(true);
        try {
            const [mRes, rRes] = await Promise.all([
                fetch(`${API}/financial/metrics?month=${month}&year=${year}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/financial/revenue-by-client?month=${month}&year=${year}`, { headers: { Authorization: `Bearer ${token()}` } }),
            ]);
            const [m, r] = await Promise.all([mRes.json(), rRes.json()]);
            if (m.success) setMetrics(m.data);
            if (r.success) setRevenueByClient(r.data);
        } catch { /* ignore */ } finally { setLoadingManagement(false); }
    }, [month, year]);

    const fetchRecurring = useCallback(async () => {
        try {
            const res = await fetch(`${API}/financial/recurring`, { headers: { Authorization: `Bearer ${token()}` } });
            const json = await res.json();
            if (json.success) setRecurringList(json.data);
        } catch { /* ignore */ }
    }, []);

    const fetchContracts = useCallback(async () => {
        setLoadingContracts(true);
        try {
            const res = await fetch(`${API}/clients/contracts/all`, { headers: { Authorization: `Bearer ${token()}` } });
            const json = await res.json();
            if (json.success) setContractsList(json.data);
        } catch { /* ignore */ } finally { setLoadingContracts(false); }
    }, []);

    const fetchBilling = useCallback(async () => {
        setLoadingBilling(true);
        try {
            const [billRes, sumRes] = await Promise.all([
                fetch(`${API}/financial/billing?months=${billingMonths}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/financial/billing/summary`, { headers: { Authorization: `Bearer ${token()}` } }),
            ]);
            const [bill, sum] = await Promise.all([billRes.json(), sumRes.json()]);
            if (bill.success) setBillingRecords(bill.data);
            if (sum.success) setBillingSummary(sum.data);
        } catch { /* ignore */ } finally { setLoadingBilling(false); }
    }, [billingMonths]);

    useEffect(() => { fetchAll(); }, [fetchAll]);
    useEffect(() => { if (activeTab === 'recurring') { fetchRecurring(); fetchBilling(); } }, [activeTab, fetchRecurring, fetchBilling]);
    useEffect(() => { if (activeTab === 'contracts') fetchContracts(); }, [activeTab, fetchContracts]);
    useEffect(() => { if (activeTab === 'recurring') fetchBilling(); }, [billingMonths, fetchBilling]);
    useEffect(() => { if (activeTab === 'management') fetchManagement(); }, [activeTab, fetchManagement]);

    function prevMonth() {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }
    function nextMonth() {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }

    // Filtered transactions
    const filteredTx = transactions.filter(t => {
        if (activeTab === 'income') return t.type === 'income';
        if (activeTab === 'expense') return t.type === 'expense';
        return true;
    });

    // Accounts total
    const accountsTotal = accounts.reduce((s, a) => s + Number(a.balance), 0);

    function openCreateTx(defaultType?: 'income' | 'expense') {
        setEditingTx(null);
        setTxForm({ ...emptyTxForm, type: defaultType || 'income', date: new Date().toISOString().split('T')[0] });
        setTxError('');
        setShowTxModal(true);
    }

    function openEditTx(tx: Transaction) {
        setEditingTx(tx);
        setTxForm({
            type: tx.type, description: tx.description, amount: String(tx.amount),
            date: tx.date ? tx.date.split('T')[0] : '',
            category: tx.category || '', payment_method: tx.payment_method || '',
            notes: tx.notes || '', client_id: '', account_id: '', status: tx.status,
        });
        setTxError('');
        setShowTxModal(true);
    }

    async function handleSaveTx() {
        if (!txForm.description.trim() || !txForm.amount || !txForm.date) {
            setTxError('Descrição, valor e data são obrigatórios'); return;
        }
        setSaving(true); setTxError('');
        try {
            const body = {
                ...txForm,
                amount: parseFloat(txForm.amount),
                client_id: txForm.client_id || null,
                account_id: txForm.account_id || null,
                category: txForm.category || null,
                payment_method: txForm.payment_method || null,
                notes: txForm.notes || null,
            };
            const url = editingTx ? `${API}/financial/transactions/${editingTx.id}` : `${API}/financial/transactions`;
            const method = editingTx ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) { setTxError(json.error?.message || 'Erro ao salvar'); return; }
            setShowTxModal(false);
            fetchAll();
        } catch {
            setTxError('Erro de conexão');
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteTx() {
        if (!deleteId) return;
        setDeleting(true);
        try {
            await fetch(`${API}/financial/transactions/${deleteId}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
            });
            setDeleteId(null);
            fetchAll();
        } catch { /* ignore */ } finally { setDeleting(false); }
    }

    async function toggleRecurringActive(id: string, active: boolean) {
        await fetch(`${API}/financial/recurring/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ active: !active }),
        });
        fetchRecurring();
    }

    async function deleteRecurring(id: string) {
        await fetch(`${API}/financial/recurring/${id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
        });
        fetchRecurring();
    }

    const TABS = [
        { key: 'overview',   label: 'Visão Geral' },
        { key: 'management', label: 'Gestão' },
        { key: 'income',     label: 'Entradas' },
        { key: 'expense',    label: 'Saídas' },
        { key: 'recurring',  label: 'Recorrências' },
        { key: 'contracts',  label: 'Contratos' },
    ] as const;

    return (
        <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* ─── Header ─── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Financeiro</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Controle de receitas, despesas e fluxo de caixa</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {/* Regime toggle (cash/accrual) */}
                    <div title="Caixa: só o que foi efetivamente pago / recebido. Competência: inclui pendências do mês."
                         style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
                        {[
                            { key: 'accrual', label: 'Competência' },
                            { key: 'cash', label: 'Caixa' },
                        ].map(r => (
                            <button
                                key={r.key}
                                onClick={() => setRegime(r.key as 'cash' | 'accrual')}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    background: regime === r.key ? 'var(--primary)' : 'transparent',
                                    color: regime === r.key ? '#fff' : 'var(--text-muted)',
                                    border: 'none',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                }}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    {/* Month nav */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '6px 14px' }}>
                        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', minWidth: 130, textAlign: 'center' }}>
                            {MONTHS[month - 1]} {year}
                        </span>
                        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <button
                        onClick={() => openCreateTx()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--primary)', color: '#fff', border: 'none',
                            borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        <Plus size={16} /> Nova Transação
                    </button>
                </div>
            </div>

            {/* ─── KPI Cards ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                <KpiCard
                    label="Receitas"
                    value={formatBRL(dashboard?.income || 0)}
                    icon={TrendingUp}
                    color="#10b981"
                    bg="rgba(16,185,129,.12)"
                    border="rgba(16,185,129,.2)"
                    footer={
                        dashboard?.income_breakdown && dashboard.income_breakdown.contracts_paid > 0
                            ? `${formatBRL(dashboard.income_breakdown.contracts_paid)} de contratos`
                            : undefined
                    }
                />
                <KpiCard
                    label="Despesas"
                    value={formatBRL(dashboard?.expense || 0)}
                    icon={TrendingDown}
                    color="#ef4444"
                    bg="rgba(239,68,68,.12)"
                    border="rgba(239,68,68,.2)"
                />
                <KpiCard
                    label="A Receber"
                    value={formatBRL(dashboard?.receivable || 0)}
                    icon={AlertCircle}
                    color={(dashboard?.receivable_breakdown?.overdue || 0) > 0 ? '#ef4444' : '#f59e0b'}
                    bg={(dashboard?.receivable_breakdown?.overdue || 0) > 0 ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)'}
                    border={(dashboard?.receivable_breakdown?.overdue || 0) > 0 ? 'rgba(239,68,68,.2)' : 'rgba(245,158,11,.2)'}
                    footer={
                        dashboard?.receivable_breakdown && (dashboard.receivable_breakdown.overdue > 0 || dashboard.receivable_breakdown.pending > 0)
                            ? `${formatBRL(dashboard.receivable_breakdown.overdue)} em atraso · ${formatBRL(dashboard.receivable_breakdown.pending)} no prazo`
                            : undefined
                    }
                />
                <KpiCard
                    label="Saldo do Mês"
                    value={formatBRL(dashboard?.balance || 0)}
                    icon={Wallet}
                    color={(dashboard?.balance || 0) >= 0 ? '#ff6b35' : '#ef4444'}
                    bg={(dashboard?.balance || 0) >= 0 ? 'rgba(255, 107, 53,.12)' : 'rgba(239,68,68,.12)'}
                    border={(dashboard?.balance || 0) >= 0 ? 'rgba(255, 107, 53,.2)' : 'rgba(239,68,68,.2)'}
                />
                <KpiCard
                    label="Saldo nas Contas"
                    value={formatBRL(accountsTotal)}
                    icon={Wallet}
                    color="#3b82f6"
                    bg="rgba(59,130,246,.12)"
                    border="rgba(59,130,246,.2)"
                />
            </div>

            {/* ─── Tabs ─── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            padding: '10px 18px', fontSize: 14, fontWeight: 500,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                            borderBottom: `2px solid ${activeTab === tab.key ? 'var(--primary)' : 'transparent'}`,
                            marginBottom: -1, transition: 'color .15s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ─── Overview: accounts + income/expense categories ─── */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 28 }}>
                    {/* Accounts */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
                        <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Contas Financeiras</h3>
                        {accounts.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma conta cadastrada</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {accounts.map(acc => (
                                    <div key={acc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{acc.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, textTransform: 'capitalize' }}>{acc.type}</div>
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: Number(acc.balance) >= 0 ? '#10b981' : '#ef4444' }}>
                                            {formatBRL(Number(acc.balance))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Income Categories */}
                    <CategoryPanel
                        title="Receitas por Categoria"
                        items={(dashboard?.incomeByCategory || dashboard?.byCategory?.filter(c => c.type === 'income') || []) as { type: string; category: string; total: number }[]}
                        color="#10b981"
                    />

                    {/* Expense Categories */}
                    <CategoryPanel
                        title="Despesas por Categoria"
                        items={(dashboard?.expenseByCategory || dashboard?.byCategory?.filter(c => c.type === 'expense') || []) as { type: string; category: string; total: number }[]}
                        color="#ef4444"
                    />
                </div>
            )}

            {/* ─── Management tab ─── */}
            {activeTab === 'management' && (
                <ManagementTab
                    metrics={metrics}
                    revenueByClient={revenueByClient}
                    loading={loadingManagement}
                    period={`${MONTHS[month - 1]} ${year}`}
                />
            )}

            {/* ─── Transactions list (overview / income / expense) ─── */}
            {activeTab !== 'recurring' && activeTab !== 'contracts' && activeTab !== 'management' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                            {activeTab === 'income' ? 'Entradas' : activeTab === 'expense' ? 'Saídas' : 'Transações Recentes'}
                        </h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {activeTab === 'income' && (
                                <button onClick={() => openCreateTx('income')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.25)', color: '#10b981', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                                    <Plus size={14} /> Entrada
                                </button>
                            )}
                            {activeTab === 'expense' && (
                                <button onClick={() => openCreateTx('expense')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                                    <Plus size={14} /> Saída
                                </button>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
                    ) : filteredTx.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <Wallet size={32} style={{ opacity: .3, marginBottom: 10 }} />
                            <p style={{ margin: 0 }}>Nenhuma transação encontrada para este período</p>
                        </div>
                    ) : (
                        <div>
                            {filteredTx.map((tx, i) => (
                                <div key={tx.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px',
                                    borderBottom: i < filteredTx.length - 1 ? '1px solid var(--border)' : 'none',
                                    transition: 'background .12s',
                                }}
                                    onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                                    onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {/* Icon */}
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                                        background: tx.type === 'income' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {tx.type === 'income'
                                            ? <ArrowUpCircle size={20} color="#10b981" />
                                            : <ArrowDownCircle size={20} color="#ef4444" />}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {tx.description}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                                            {tx.category && <span>{tx.category}</span>}
                                            {tx.client_name && <span>• {tx.client_name}</span>}
                                            <span>• {formatDate(tx.date)}</span>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <span style={{
                                        fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20,
                                        color: STATUS_CONFIG[tx.status]?.color || '#94a3b8',
                                        background: 'rgba(0,0,0,.2)',
                                    }}>
                                        {STATUS_CONFIG[tx.status]?.label || tx.status}
                                    </span>

                                    {/* Amount */}
                                    <div style={{ fontSize: 15, fontWeight: 700, color: tx.type === 'income' ? '#10b981' : '#ef4444', minWidth: 110, textAlign: 'right' }}>
                                        {tx.type === 'income' ? '+' : '-'}{formatBRL(Number(tx.amount))}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => openEditTx(tx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button onClick={() => setDeleteId(tx.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4, borderRadius: 6 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Recurring tab ─── */}
            {activeTab === 'recurring' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* ── Reminders / Alerts ── */}
                    {(() => {
                        const overdue = billingSummary.filter(s => Number(s.total_owed) > 0);
                        if (overdue.length === 0) return null;
                        const totalDebt = overdue.reduce((sum, s) => sum + Number(s.total_owed), 0);
                        return (
                            <div style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 14, padding: '16px 20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                    <AlertCircle size={18} color="#ef4444" />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                                            {overdue.length} cliente{overdue.length !== 1 ? 's' : ''} inadimplente{overdue.length !== 1 ? 's'  : ''}
                                        </span>
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 10 }}>
                                            Total em aberto: <strong style={{ color: '#ef4444' }}>{formatBRL(totalDebt)}</strong>
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {overdue.map(s => (
                                        <div key={s.client_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(0,0,0,.2)', borderRadius: 10 }}>
                                            <div style={{ width: 30, height: 30, borderRadius: 8, background: s.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                {s.client_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.client_name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                                    {Number(s.pending_count)} {Number(s.pending_count) === 1 ? 'mês em atraso' : 'meses em atraso'}
                                                    {s.oldest_pending && ` • desde ${fmtMonthYear(s.oldest_pending)}`}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>
                                                {formatBRL(Number(s.total_owed))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Summary cards ── */}
                    {billingSummary.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                            {billingSummary.map(s => (
                                <div key={s.client_id} style={{ background: 'var(--bg-card)', border: `1px solid ${Number(s.total_owed) > 0 ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 14, padding: '16px 18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                        <div style={{ width: 34, height: 34, borderRadius: 10, background: s.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                            {s.client_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.client_name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.pending_count} {Number(s.pending_count) === 1 ? 'parcela' : 'parcelas'} pendente{Number(s.pending_count) !== 1 ? 's' : ''}</div>
                                        </div>
                                    </div>
                                    {Number(s.total_owed) > 0 ? (
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444' }}>{formatBRL(Number(s.total_owed))}</div>
                                    ) : (
                                        <div style={{ fontSize: 13, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> Em dia</div>
                                    )}
                                    {s.oldest_pending && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            Desde {(safeDate(s.oldest_pending)?.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })) || '—'}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Billing records panel ── */}
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Recebimentos de Contratos</h3>
                                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Zap size={12} color="#10b981" />
                                    <span>Gerados automaticamente todo mês — só marque os recebidos</span>
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* Period selector */}
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {[1, 2, 3, 6].map(m => (
                                        <button key={m} onClick={() => setBillingMonths(m)}
                                            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: billingMonths === m ? 'var(--primary)' : 'transparent', borderColor: billingMonths === m ? 'var(--primary)' : 'var(--border)', color: billingMonths === m ? '#fff' : 'var(--text-muted)' }}>
                                            {m}m
                                        </button>
                                    ))}
                                </div>
                                {/* Manual refresh fallback */}
                                <button
                                    title="Força a geração do mês corrente agora (caso algum contrato novo não tenha aparecido ainda)"
                                    onClick={async () => {
                                        setGeneratingBilling(true);
                                        const now = new Date();
                                        await fetch(`${API}/financial/billing/generate`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                            body: JSON.stringify({ month: now.getMonth() + 1, year: now.getFullYear() }),
                                        });
                                        await fetch(`${API}/financial/billing/mark-overdue`, {
                                            method: 'POST', headers: { Authorization: `Bearer ${token()}` },
                                        });
                                        await fetchBilling();
                                        setGeneratingBilling(false);
                                    }}
                                    disabled={generatingBilling}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: generatingBilling ? 'not-allowed' : 'pointer', opacity: generatingBilling ? .6 : 1 }}
                                >
                                    <RefreshCw size={13} style={generatingBilling ? { animation: 'spin 1s linear infinite' } : undefined} /> {generatingBilling ? 'Atualizando...' : 'Atualizar'}
                                </button>
                            </div>
                        </div>

                        {/* Records */}
                        {loadingBilling ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
                        ) : billingRecords.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
                                <RotateCcw size={32} style={{ opacity: .25, marginBottom: 12 }} />
                                <p style={{ margin: 0, fontSize: 14 }}>Nenhum recebimento pendente</p>
                                <p style={{ margin: '6px 0 0', fontSize: 13 }}>Cadastre contratos fixos em Clientes — os recebimentos do mês serão gerados automaticamente</p>
                            </div>
                        ) : (() => {
                            // Group by client
                            const byClient = billingRecords.reduce((acc: Record<string, BillingRecord[]>, r) => {
                                if (!acc[r.client_id]) acc[r.client_id] = [];
                                acc[r.client_id].push(r);
                                return acc;
                            }, {});

                            return Object.entries(byClient).map(([clientId, records], ci) => {
                                const first = records[0];
                                const totalOwed = records.filter(r => r.status !== 'paid').reduce((s, r) => s + Number(r.total_amount), 0);

                                return (
                                    <div key={clientId} style={{ borderBottom: ci < Object.keys(byClient).length - 1 ? '1px solid var(--border)' : 'none' }}>
                                        {/* Client header */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px 10px', background: 'rgba(0,0,0,.15)' }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 9, background: first.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                                {first.client_name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{first.client_name}</span>
                                            </div>
                                            {totalOwed > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
                                                    <AlertCircle size={14} />
                                                    Deve {formatBRL(totalOwed)}
                                                </div>
                                            )}
                                            {totalOwed === 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#10b981' }}>
                                                    <CheckCircle2 size={13} /> Em dia
                                                </div>
                                            )}
                                        </div>

                                        {/* Records per contract/month */}
                                        {records.map((r, ri) => {
                                            const refDate = safeDate(r.reference_month);
                                            const monthLabel = refDate ? refDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
                                            const isPaid = r.status === 'paid';
                                            const isOverdue = r.status === 'overdue';
                                            const hasPercentage = r.contract_type === 'percentage' || r.contract_type === 'mixed';

                                            return (
                                                <div key={r.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 22px 12px 32px',
                                                    borderTop: '1px solid var(--border)',
                                                    background: isPaid ? 'rgba(16,185,129,.03)' : isOverdue ? 'rgba(239,68,68,.04)' : 'transparent',
                                                }}>
                                                    {/* Status icon / check */}
                                                    <button
                                                        onClick={() => {
                                                            if (isPaid) return;
                                                            setBillingModal(r);
                                                            setBillingForm({ status: 'paid', percentage_amount: hasPercentage ? String(r.percentage_amount || '') : '', payment_method: r.payment_method || '', notes: r.notes || '', due_date: (r.due_date || '').toString().slice(0, 10) });
                                                        }}
                                                        title={isPaid ? 'Recebido' : 'Marcar como recebido'}
                                                        style={{
                                                            width: 28, height: 28, borderRadius: '50%', flexShrink: 0, cursor: isPaid ? 'default' : 'pointer',
                                                            border: `2px solid ${isPaid ? '#10b981' : isOverdue ? '#ef4444' : 'rgba(148,163,184,.4)'}`,
                                                            background: isPaid ? '#10b981' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all .15s',
                                                        }}
                                                    >
                                                        {isPaid && <CheckCircle2 size={16} color="#fff" strokeWidth={2.5} />}
                                                        {isOverdue && !isPaid && <AlertCircle size={14} color="#ef4444" />}
                                                        {!isPaid && !isOverdue && <Clock size={12} color="rgba(148,163,184,.6)" />}
                                                    </button>

                                                    {/* Info */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                            <div style={{ fontSize: 13, fontWeight: 600, color: isPaid ? 'var(--text-muted)' : 'var(--text)', textTransform: 'capitalize' }}>
                                                                {monthLabel}
                                                            </div>
                                                            {(() => {
                                                                const s = dueStatus(r.due_date, r.status);
                                                                return (
                                                                    <span style={{
                                                                        fontSize: 10.5,
                                                                        fontWeight: 600,
                                                                        padding: '2px 7px',
                                                                        borderRadius: 999,
                                                                        background: `${s.color}18`,
                                                                        color: s.color,
                                                                        border: `1px solid ${s.color}44`,
                                                                        textTransform: 'uppercase',
                                                                        letterSpacing: '.3px',
                                                                    }}>
                                                                        {s.label}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                            {!isPaid && (() => {
                                                                const s = dueStatus(r.due_date, r.status);
                                                                return s.sub && <span style={{ color: s.color }}>{s.sub}</span>;
                                                            })()}
                                                            <span>{r.contract_description}</span>
                                                            {hasPercentage && r.percentage > 0 && (
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                                    <Percent size={10} /> {r.percentage}% de {r.percentage_base}
                                                                    {r.percentage_amount > 0 && ` = ${formatBRL(Number(r.percentage_amount))}`}
                                                                </span>
                                                            )}
                                                            {r.payment_method && isPaid && <span>• {r.payment_method}</span>}
                                                        </div>
                                                    </div>

                                                    {/* Amount */}
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontSize: 15, fontWeight: 700, color: isPaid ? '#10b981' : isOverdue ? '#ef4444' : 'var(--text)' }}>
                                                            {formatBRL(Number(r.total_amount))}
                                                        </div>
                                                        {isPaid && r.paid_at && (
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                                Recebido em {new Date(r.paid_at).toLocaleDateString('pt-BR')}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Edit button */}
                                                    {!isPaid && (
                                                        <button
                                                            onClick={() => {
                                                                setBillingModal(r);
                                                                setBillingForm({ status: r.status, percentage_amount: String(r.percentage_amount || ''), payment_method: r.payment_method || '', notes: r.notes || '', due_date: (r.due_date || '').toString().slice(0, 10) });
                                                            }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                    )}
                                                    {isPaid && (
                                                        <button
                                                            onClick={() => {
                                                                setBillingModal(r);
                                                                setBillingForm({ status: r.status, percentage_amount: String(r.percentage_amount || ''), payment_method: r.payment_method || '', notes: r.notes || '', due_date: (r.due_date || '').toString().slice(0, 10) });
                                                            }}
                                                            title="Editar cobrança"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(148,163,184,.4)', padding: 4, flexShrink: 0 }}
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                    )}
                                                    {/* Delete button */}
                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm(`Apagar cobrança de ${monthLabel} para ${r.client_name}?`)) return;
                                                            await fetch(`${API}/financial/billing/${r.id}`, {
                                                                method: 'DELETE',
                                                                headers: { Authorization: `Bearer ${token()}` },
                                                            });
                                                            await fetchBilling();
                                                        }}
                                                        title="Apagar cobrança"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239,68,68,.4)', padding: 4, flexShrink: 0 }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}

            {/* ─── Contracts tab ─── */}
            {activeTab === 'contracts' && (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                    <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Contratos dos Clientes</h3>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Contratos ativos, pausados e encerrados. Gerencie em Clientes.</p>
                    </div>
                    {loadingContracts ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
                    ) : contractsList.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <FileText size={32} style={{ opacity: .3, marginBottom: 10 }} />
                            <p style={{ margin: 0 }}>Nenhum contrato cadastrado</p>
                            <p style={{ margin: '6px 0 0', fontSize: 13 }}>Acesse Clientes para adicionar contratos</p>
                        </div>
                    ) : (
                        <div>
                            {contractsList.map((c: any, i: number) => {
                                const statusColors: Record<string, string> = { active: '#10b981', paused: '#f59e0b', ended: '#94a3b8' };
                                const statusLabels: Record<string, string> = { active: 'Ativo', paused: 'Pausado', ended: 'Encerrado' };
                                const typeLabel: Record<string, string> = { fixed: 'Fixo', percentage: 'Porcentagem', mixed: 'Fixo + %' };
                                return (
                                    <div key={c.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px',
                                        borderBottom: i < contractsList.length - 1 ? '1px solid var(--border)' : 'none',
                                        opacity: c.status === 'ended' ? .55 : 1,
                                    }}>
                                        {/* Avatar */}
                                        <div style={{ width: 38, height: 38, borderRadius: 10, background: c.avatar_color || '#ff6b35', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                            {(c.client_name || '?').split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()}
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.description}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                                                {c.client_name} • {typeLabel[c.type] || c.type} • Vence dia {c.billing_day}
                                                {c.payment_method && ` • ${c.payment_method}`}
                                            </div>
                                        </div>

                                        {/* Values */}
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                                            {(c.type === 'fixed' || c.type === 'mixed') && Number(c.fixed_amount) > 0 && (
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(c.fixed_amount))}/mês
                                                </span>
                                            )}
                                            {(c.type === 'percentage' || c.type === 'mixed') && Number(c.percentage) > 0 && (
                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#ffa46e', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Percent size={12} />{c.percentage}% de {c.percentage_base}
                                                </span>
                                            )}
                                        </div>

                                        {/* Status */}
                                        <span style={{ fontSize: 11, fontWeight: 600, color: statusColors[c.status] || '#94a3b8', padding: '3px 10px', borderRadius: 20, background: `${statusColors[c.status]}18`, border: `1px solid ${statusColors[c.status]}40`, whiteSpace: 'nowrap' }}>
                                            {statusLabels[c.status] || c.status}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Billing Modal ─── */}
            {billingModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 460, padding: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                                    {billingModal.status !== 'paid' && billingForm.status === 'paid' ? 'Confirmar Recebimento' : 'Editar Cobrança'}
                                </h2>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                                    {billingModal.client_name} • {fmtMonthYear(billingModal.reference_month)}
                                </p>
                            </div>
                            <button onClick={() => setBillingModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Status toggle */}
                            <div>
                                <label style={labelSt}>Status</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {[
                                        { value: 'paid',    label: 'Recebido',  color: '#10b981' },
                                        { value: 'pending', label: 'Pendente',  color: '#f59e0b' },
                                        { value: 'overdue', label: 'Atrasado',  color: '#ef4444' },
                                    ].map(s => (
                                        <button key={s.value} onClick={() => setBillingForm(f => ({ ...f, status: s.value }))}
                                            style={{ flex: 1, padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `2px solid`, borderColor: billingForm.status === s.value ? s.color : 'var(--border)', background: billingForm.status === s.value ? `${s.color}18` : 'transparent', color: billingForm.status === s.value ? s.color : 'var(--text-muted)' }}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Percentage amount (if contract has %) */}
                            {(billingModal.contract_type === 'percentage' || billingModal.contract_type === 'mixed') && (
                                <div>
                                    <label style={labelSt}>
                                        Valor da porcentagem ({billingModal.percentage}% de {billingModal.percentage_base})
                                    </label>
                                    <input
                                        type="number" placeholder="Ex: 1500,00"
                                        value={billingForm.percentage_amount}
                                        onChange={e => setBillingForm(f => ({ ...f, percentage_amount: e.target.value }))}
                                        style={inputSt}
                                    />
                                    {billingForm.percentage_amount && (
                                        <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                                            Total: {formatBRL(Number(billingModal.fixed_amount) + Number(billingForm.percentage_amount))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Data combinada de pagamento */}
                            <div>
                                <label style={labelSt}>Data combinada de pagamento</label>
                                <input
                                    type="date"
                                    value={billingForm.due_date}
                                    onChange={e => setBillingForm(f => ({ ...f, due_date: e.target.value }))}
                                    style={inputSt}
                                />
                                {billingForm.due_date && (() => {
                                    const s = dueStatus(billingForm.due_date, billingForm.status);
                                    return (
                                        <div style={{ fontSize: 12, color: s.color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                                            {s.label}{s.sub ? ` · ${s.sub}` : ''}
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Payment method */}
                            <div>
                                <label style={labelSt}>Forma de Pagamento</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={billingForm.payment_method} onChange={e => setBillingForm(f => ({ ...f, payment_method: e.target.value }))}
                                        style={{ ...inputSt, appearance: 'none', paddingRight: 32, cursor: 'pointer' }}>
                                        <option value="">Não informado</option>
                                        {['PIX', 'Transferência Bancária', 'Boleto', 'Cartão de Crédito', 'Dinheiro'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label style={labelSt}>Observações</label>
                                <textarea value={billingForm.notes} onChange={e => setBillingForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Observações..."
                                    style={{ ...inputSt, resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                        </div>

                        {/* Total */}
                        <div style={{ margin: '18px 0', padding: '14px', background: 'var(--bg)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Total</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                                {formatBRL(Number(billingModal.fixed_amount) + (billingForm.percentage_amount ? Number(billingForm.percentage_amount) : Number(billingModal.percentage_amount)))}
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setBillingModal(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
                            <button
                                onClick={async () => {
                                    const body: any = {
                                        status: billingForm.status,
                                        payment_method: billingForm.payment_method || null,
                                        notes: billingForm.notes || null,
                                        due_date: billingForm.due_date || null,
                                    };
                                    if (billingForm.percentage_amount) body.percentage_amount = parseFloat(billingForm.percentage_amount);
                                    await fetch(`${API}/financial/billing/${billingModal!.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                        body: JSON.stringify(body),
                                    });
                                    setBillingModal(null);
                                    fetchBilling();
                                }}
                                style={{ flex: 2, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: billingForm.status === 'paid' ? '#10b981' : 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer' }}
                            >
                                {billingModal.status !== 'paid' && billingForm.status === 'paid' ? 'Confirmar Recebimento' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Transaction Modal ─── */}
            {showTxModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'var(--bg-overlay)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20,
                }}>
                    <div style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 20, width: '100%', maxWidth: 520,
                        maxHeight: '90vh', overflow: 'auto', padding: 32,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                                {editingTx ? 'Editar Transação' : 'Nova Transação'}
                            </h2>
                            <button onClick={() => setShowTxModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {txError && (
                            <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 }}>
                                {txError}
                            </div>
                        )}

                        {/* Type toggle */}
                        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
                            <button
                                onClick={() => setTxForm(f => ({ ...f, type: 'income', category: '' }))}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '2px solid',
                                    background: txForm.type === 'income' ? 'rgba(16,185,129,.15)' : 'transparent',
                                    borderColor: txForm.type === 'income' ? '#10b981' : 'var(--border)',
                                    color: txForm.type === 'income' ? '#10b981' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <ArrowUpCircle size={16} /> Receita
                            </button>
                            <button
                                onClick={() => setTxForm(f => ({ ...f, type: 'expense', category: '' }))}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', border: '2px solid',
                                    background: txForm.type === 'expense' ? 'rgba(239,68,68,.15)' : 'transparent',
                                    borderColor: txForm.type === 'expense' ? '#ef4444' : 'var(--border)',
                                    color: txForm.type === 'expense' ? '#ef4444' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <ArrowDownCircle size={16} /> Despesa
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ gridColumn: '1/-1' }}>
                                <TxField label="Descrição *" value={txForm.description} onChange={v => setTxForm(f => ({ ...f, description: v }))} placeholder="Ex: Honorários de gestão..." />
                            </div>
                            <TxField label="Valor (R$) *" value={txForm.amount} onChange={v => setTxForm(f => ({ ...f, amount: v }))} placeholder="0,00" type="number" />
                            <TxField label="Data *" value={txForm.date} onChange={v => setTxForm(f => ({ ...f, date: v }))} type="date" />

                            {/* Category */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Categoria</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 32px 10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none', cursor: 'pointer' }}>
                                        <option value="">Sem categoria</option>
                                        {(txForm.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Payment method */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Forma de Pagamento</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={txForm.payment_method} onChange={e => setTxForm(f => ({ ...f, payment_method: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 32px 10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none', cursor: 'pointer' }}>
                                        <option value="">Selecionar...</option>
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Status</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={txForm.status} onChange={e => setTxForm(f => ({ ...f, status: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 32px 10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none', cursor: 'pointer' }}>
                                        <option value="confirmed">Confirmado</option>
                                        <option value="pending">Pendente</option>
                                        <option value="cancelled">Cancelado</option>
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Client */}
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Cliente (opcional)</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={txForm.client_id} onChange={e => setTxForm(f => ({ ...f, client_id: e.target.value }))}
                                        style={{ width: '100%', padding: '10px 32px 10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', appearance: 'none', cursor: 'pointer' }}>
                                        <option value="">Sem cliente</option>
                                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Notes */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Observações</label>
                                <textarea
                                    value={txForm.notes}
                                    onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))}
                                    placeholder="Observações adicionais..."
                                    rows={2}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                            <button
                                onClick={() => setShowTxModal(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 500, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveTx}
                                disabled={saving}
                                style={{ flex: 2, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: txForm.type === 'income' ? '#10b981' : '#ef4444', border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}
                            >
                                {saving ? 'Salvando...' : editingTx ? 'Salvar' : txForm.type === 'income' ? 'Registrar Receita' : 'Registrar Despesa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Delete Confirm ─── */}
            {deleteId && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 101, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center' }}>
                        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                            <Trash2 size={22} color="#ef4444" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 17, fontWeight: 700 }}>Remover Transação?</h3>
                        <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 13 }}>Esta ação não pode ser desfeita.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>Cancelar</button>
                            <button onClick={handleDeleteTx} disabled={deleting} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#ef4444', border: 'none', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: deleting ? .7 : 1 }}>
                                {deleting ? 'Removendo...' : 'Remover'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, bg, border, footer }: {
    label: string; value: string; icon: any; color: string; bg: string; border: string;
    footer?: React.ReactNode;
}) {
    return (
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${border}`, borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color={color} />
                </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
            {footer && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>{footer}</div>}
        </div>
    );
}

// ─── Billing modal shared styles ───────────────────────────────────────────

const labelSt: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };
const inputSt: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };

// ─── TxField helper ────────────────────────────────────────────────────────

function TxField({ label, value, onChange, placeholder = '', type = 'text' }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
    return (
        <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
        </div>
    );
}

// ─── Category Panel (reusable for income / expense) ────────────────────────

function CategoryPanel({ title, items, color }: {
    title: string;
    items: { type: string; category: string; total: number }[];
    color: string;
}) {
    const sorted = [...items].sort((a, b) => Number(b.total) - Number(a.total));
    const maxVal = sorted.length ? Math.max(...sorted.map(c => Number(c.total))) : 0;
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{title}</h3>
            {!sorted.length ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados para o período</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sorted.slice(0, 6).map((c, i) => {
                        const pct = maxVal > 0 ? (Number(c.total) / maxVal) * 100 : 0;
                        return (
                            <div key={i}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{c.category || 'Outros'}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color }}>{formatBRL(Number(c.total))}</span>
                                </div>
                                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Management Tab (MRR/ARR/Churn/Profit + revenue-by-client) ─────────────

function ManagementTab({ metrics, revenueByClient, loading, period }: {
    metrics: MetricsData | null;
    revenueByClient: RevenueByClient[];
    loading: boolean;
    period: string;
}) {
    if (loading && !metrics) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                Carregando métricas...
            </div>
        );
    }
    if (!metrics) return null;

    const growth = metrics.revenue_growth_pct;
    const growthLabel = growth === null
        ? 'sem comparação'
        : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
    const growthColor = growth === null ? '#94a3b8' : growth >= 0 ? '#10b981' : '#ef4444';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* ── KPI grid: receita recorrente ── */}
            <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Receita Recorrente
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <MgmtCard
                        icon={Repeat} color="#8b5cf6"
                        label="MRR"
                        hint="Receita mensal recorrente (contratos fixos ativos)"
                        value={formatBRL(metrics.mrr)}
                        footer={`${metrics.clients_with_contract} contrato${metrics.clients_with_contract !== 1 ? 's' : ''} ativo${metrics.clients_with_contract !== 1 ? 's' : ''}`}
                    />
                    <MgmtCard
                        icon={Target} color="#ff6b35"
                        label="ARR"
                        hint="MRR × 12 — receita anual projetada"
                        value={formatBRL(metrics.arr)}
                    />
                    <MgmtCard
                        icon={DollarSign} color="#06b6d4"
                        label="Ticket Médio"
                        hint="MRR ÷ clientes com contrato"
                        value={formatBRL(metrics.avg_ticket)}
                    />
                    <MgmtCard
                        icon={Users} color="#3b82f6"
                        label="Clientes Ativos"
                        value={String(metrics.active_clients)}
                        footer={`${metrics.clients_with_contract} com contrato`}
                    />
                </div>
            </div>

            {/* ── KPI grid: resultado ── */}
            <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Resultado · {period}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <MgmtCard
                        icon={TrendingUp} color="#10b981"
                        label="Receita do Mês"
                        value={formatBRL(metrics.revenue_this_month)}
                        footer={
                            <span style={{ color: growthColor, fontWeight: 600 }}>
                                {growthLabel} vs mês anterior
                            </span>
                        }
                    />
                    <MgmtCard
                        icon={TrendingDown} color="#ef4444"
                        label="Despesa do Mês"
                        value={formatBRL(metrics.expense_realized)}
                    />
                    <MgmtCard
                        icon={Wallet} color={metrics.profit_realized >= 0 ? '#10b981' : '#ef4444'}
                        label="Lucro Realizado"
                        hint="Receita recebida − despesa paga"
                        value={formatBRL(metrics.profit_realized)}
                    />
                    <MgmtCard
                        icon={BarChart3} color={metrics.profit_estimate_monthly >= 0 ? '#8b5cf6' : '#ef4444'}
                        label="Lucro Estimado/mês"
                        hint="MRR − custos recorrentes mensais"
                        value={formatBRL(metrics.profit_estimate_monthly)}
                        footer={metrics.mrc > 0 ? `Custos fixos: ${formatBRL(metrics.mrc)}` : 'Sem despesas recorrentes cadastradas'}
                    />
                </div>
            </div>

            {/* ── KPI grid: movimento de clientes ── */}
            <div>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    Movimento de Clientes
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                    <MgmtCard
                        icon={UserPlus} color="#10b981"
                        label="Novos no mês"
                        value={String(metrics.new_clients_this_month)}
                    />
                    <MgmtCard
                        icon={UserMinus} color="#ef4444"
                        label="Churn no mês"
                        value={String(metrics.churned_this_month)}
                    />
                    <MgmtCard
                        icon={UserMinus} color="#f59e0b"
                        label="Churn rate 90d"
                        hint="% de clientes que saíram nos últimos 90 dias"
                        value={`${metrics.churn_rate_3mo_pct.toFixed(1)}%`}
                        footer={`${metrics.churned_3mo} cliente${metrics.churned_3mo !== 1 ? 's' : ''} nos últimos 90d`}
                    />
                </div>
            </div>

            {/* ── Ranking de receita por cliente ── */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Receita por Cliente · {period}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>Total recebido + pendências em aberto do mês</p>
                </div>
                {revenueByClient.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                        Nenhum cliente ativo encontrado
                    </div>
                ) : (
                    <div>
                        {revenueByClient.map((r, i) => {
                            const maxTotal = Math.max(...revenueByClient.map(x => x.total_paid + x.contract_pending));
                            const total = r.total_paid + r.contract_pending;
                            const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
                            const inactive = r.client_status === 'churned' || r.client_status === 'inativo';
                            return (
                                <div key={r.client_id} style={{
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    padding: '14px 24px',
                                    borderBottom: i < revenueByClient.length - 1 ? '1px solid var(--border)' : 'none',
                                    opacity: inactive ? .55 : 1,
                                }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 10, background: r.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {r.client_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.client_name}</span>
                                            {inactive && (
                                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgba(148,163,184,.15)', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                                                    {r.client_status}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginTop: 8, position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'linear-gradient(90deg, #10b981, #ff6b35)', borderRadius: 2 }} />
                                        </div>
                                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            {r.contract_paid > 0 && <span>Contrato: <strong style={{ color: '#10b981' }}>{formatBRL(r.contract_paid)}</strong></span>}
                                            {r.tx_income > 0 && <span>Avulso: <strong style={{ color: '#10b981' }}>{formatBRL(r.tx_income)}</strong></span>}
                                            {r.contract_pending > 0 && <span>A receber: <strong style={{ color: '#f59e0b' }}>{formatBRL(r.contract_pending)}</strong></span>}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', minWidth: 120, flexShrink: 0 }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{formatBRL(r.total_paid)}</div>
                                        {r.contract_pending > 0 && (
                                            <div style={{ fontSize: 11, color: '#f59e0b' }}>+{formatBRL(r.contract_pending)} pend.</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Management KPI Card ───────────────────────────────────────────────────

function MgmtCard({ icon: Icon, color, label, value, hint, footer }: {
    icon: any; color: string; label: string; value: string; hint?: string;
    footer?: React.ReactNode;
}) {
    return (
        <div title={hint} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 14, padding: '18px 20px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={15} color={color} />
                </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
            {footer && <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>{footer}</div>}
        </div>
    );
}
