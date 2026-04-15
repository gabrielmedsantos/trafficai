'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, Edit2, Trash2, X, Building2, Mail, Phone,
    TrendingUp, Users, DollarSign, UserMinus, ChevronDown,
    FileText, Percent, CheckCircle, PauseCircle, XCircle,
    AlertCircle, CheckCircle2, ExternalLink, Link, Calendar, Video,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const token = () => localStorage.getItem('trafficai_token') || '';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ActiveContract {
    type: 'fixed' | 'percentage' | 'mixed';
    fixed_amount: number;
    percentage: number;
    percentage_base: string;
    status: string;
}

interface Client {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    status: 'ativo' | 'inativo' | 'prospecto' | 'churned';
    plan: string | null;
    notes: string | null;
    avatar_color: string;
    created_at: string;
    active_contracts: ActiveContract[];
}

interface Contract {
    id: string;
    client_id: string;
    description: string;
    type: 'fixed' | 'percentage' | 'mixed';
    fixed_amount: number;
    percentage: number;
    percentage_base: string;
    billing_day: number;
    start_date: string | null;
    end_date: string | null;
    status: 'active' | 'paused' | 'ended';
    payment_method: string | null;
    notes: string | null;
    contract_file_url: string | null;
}

interface BillingSummary {
    client_id: string;
    pending_count: number;
    total_owed: number;
    oldest_pending: string | null;
}

interface ClientForm {
    name: string; email: string; phone: string; company: string;
    status: string; plan: string; notes: string; avatar_color: string;
}

interface ContractForm {
    description: string; type: string; fixed_amount: string;
    percentage: string; percentage_base: string; billing_day: string;
    start_date: string; end_date: string; status: string;
    payment_method: string; notes: string; contract_file_url: string;
}

const emptyClientForm: ClientForm = {
    name: '', email: '', phone: '', company: '', status: 'ativo',
    plan: '', notes: '', avatar_color: '#6366f1',
};

const emptyContractForm: ContractForm = {
    description: '', type: 'fixed', fixed_amount: '', percentage: '',
    percentage_base: 'Investimento em anúncios', billing_day: '1',
    start_date: '', end_date: '', status: 'active',
    payment_method: '', notes: '', contract_file_url: '',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#10b981',
    '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16',
];

const STATUS_CONFIG = {
    ativo:     { label: 'Ativo',     color: '#10b981', bg: 'rgba(16,185,129,.12)',  border: 'rgba(16,185,129,.25)' },
    inativo:   { label: 'Inativo',   color: '#94a3b8', bg: 'rgba(100,116,139,.12)', border: 'rgba(100,116,139,.25)' },
    prospecto: { label: 'Prospecto', color: '#3b82f6', bg: 'rgba(59,130,246,.12)',  border: 'rgba(59,130,246,.25)' },
    churned:   { label: 'Churned',   color: '#ef4444', bg: 'rgba(239,68,68,.12)',   border: 'rgba(239,68,68,.25)' },
} as const;

const CONTRACT_STATUS_CONFIG = {
    active: { label: 'Ativo',    color: '#10b981', Icon: CheckCircle },
    paused: { label: 'Pausado',  color: '#f59e0b', Icon: PauseCircle },
    ended:  { label: 'Encerrado', color: '#94a3b8', Icon: XCircle },
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
    fixed:      'Valor Fixo',
    percentage: 'Porcentagem',
    mixed:      'Fixo + Porcentagem',
};

const PAYMENT_METHODS = ['PIX', 'Transferência Bancária', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Outros'];

function getInitials(name: string) {
    return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function formatBRL(value: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function ClientesPage() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [billingSummaryMap, setBillingSummaryMap] = useState<Record<string, BillingSummary>>({});

    // Client modal
    const [showClientModal, setShowClientModal] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
    const [saving, setSaving] = useState(false);
    const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
    const [clientError, setClientError] = useState('');

    // Contracts drawer
    const [contractsClient, setContractsClient] = useState<Client | null>(null);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loadingContracts, setLoadingContracts] = useState(false);
    const [showContractModal, setShowContractModal] = useState(false);
    const [editingContract, setEditingContract] = useState<Contract | null>(null);
    const [contractForm, setContractForm] = useState<ContractForm>(emptyContractForm);
    const [savingContract, setSavingContract] = useState(false);
    const [deleteContractId, setDeleteContractId] = useState<string | null>(null);
    const [contractError, setContractError] = useState('');

    // Meetings drawer
    const [meetingStatsMap, setMeetingStatsMap] = useState<Record<string, { this_month: number; last_month: number; risk: 'low' | 'medium' | 'high'; total_completed: number }>>({});
    const [meetingsClient, setMeetingsClient] = useState<Client | null>(null);
    const [clientMeetings, setClientMeetings] = useState<any[]>([]);
    const [loadingMeetings, setLoadingMeetings] = useState(false);

    const fetchClients = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (search) params.set('search', search);
            const [clientsRes, summaryRes, meetingStatsRes] = await Promise.all([
                fetch(`${API}/clients?${params}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/financial/billing/summary`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/routine/meeting-logs/stats`, { headers: { Authorization: `Bearer ${token()}` } }),
            ]);
            const [clientsJson, summaryJson, meetingStatsJson] = await Promise.all([clientsRes.json(), summaryRes.json(), meetingStatsRes.json()]);
            if (clientsJson.success) setClients(clientsJson.data);
            if (summaryJson.success) {
                const map: Record<string, BillingSummary> = {};
                for (const s of summaryJson.data) map[s.client_id] = s;
                setBillingSummaryMap(map);
            }
            if (meetingStatsJson.success) {
                const mmap: Record<string, any> = {};
                for (const s of meetingStatsJson.data) mmap[s.client_id] = s;
                setMeetingStatsMap(mmap);
            }
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [search, statusFilter]);

    const fetchClientMeetings = useCallback(async (clientId: string) => {
        setLoadingMeetings(true);
        try {
            const res = await fetch(`${API}/routine/meeting-logs?client_id=${clientId}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const json = await res.json();
            if (json.success) setClientMeetings(json.data);
        } catch { /* ignore */ } finally { setLoadingMeetings(false); }
    }, []);

    useEffect(() => { fetchClients(); }, [fetchClients]);

    const fetchContracts = useCallback(async (clientId: string) => {
        setLoadingContracts(true);
        try {
            const res = await fetch(`${API}/clients/${clientId}/contracts`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            const json = await res.json();
            if (json.success) setContracts(json.data);
        } catch { /* ignore */ } finally { setLoadingContracts(false); }
    }, []);

    // Stats
    const stats = {
        total: clients.length,
        ativos: clients.filter(c => c.status === 'ativo').length,
        mrr: clients.filter(c => c.status === 'ativo').reduce((s, c) => {
            const total = (c.active_contracts || [])
                .filter(ct => ct.type === 'fixed' || ct.type === 'mixed')
                .reduce((a, ct) => a + Number(ct.fixed_amount), 0);
            return s + total;
        }, 0),
        churn: clients.filter(c => c.status === 'churned').length,
    };

    // ── Client CRUD ──
    function openCreateClient() {
        setEditingClient(null);
        setClientForm(emptyClientForm);
        setClientError('');
        setShowClientModal(true);
    }

    function openEditClient(client: Client) {
        setEditingClient(client);
        setClientForm({
            name: client.name, email: client.email || '', phone: client.phone || '',
            company: client.company || '', status: client.status, plan: client.plan || '',
            notes: client.notes || '', avatar_color: client.avatar_color,
        });
        setClientError('');
        setShowClientModal(true);
    }

    async function handleSaveClient() {
        if (!clientForm.name.trim()) { setClientError('Nome é obrigatório'); return; }
        setSaving(true); setClientError('');
        try {
            const body = {
                name: clientForm.name,
                email: clientForm.email || null,
                phone: clientForm.phone || null,
                company: clientForm.company || null,
                status: clientForm.status,
                plan: clientForm.plan || null,
                notes: clientForm.notes || null,
                avatar_color: clientForm.avatar_color,
            };
            const url = editingClient ? `${API}/clients/${editingClient.id}` : `${API}/clients`;
            const method = editingClient ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) { setClientError(json.error?.message || 'Erro ao salvar'); return; }
            setShowClientModal(false);
            fetchClients();
        } catch { setClientError('Erro de conexão'); } finally { setSaving(false); }
    }

    async function handleDeleteClient() {
        if (!deleteClientId) return;
        try {
            await fetch(`${API}/clients/${deleteClientId}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
            });
            setDeleteClientId(null);
            fetchClients();
        } catch { /* ignore */ }
    }

    // ── Contracts ──
    function openContractsDrawer(client: Client) {
        setContractsClient(client);
        setContracts([]);
        fetchContracts(client.id);
    }

    function closeContractsDrawer() {
        setContractsClient(null);
        setContracts([]);
        setShowContractModal(false);
        setEditingContract(null);
    }

    function openMeetingsDrawer(client: Client) {
        setMeetingsClient(client);
        setClientMeetings([]);
        fetchClientMeetings(client.id);
    }

    function closeMeetingsDrawer() {
        setMeetingsClient(null);
        setClientMeetings([]);
    }

    function openCreateContract() {
        setEditingContract(null);
        setContractForm(emptyContractForm);
        setContractError('');
        setShowContractModal(true);
    }

    function openEditContract(c: Contract) {
        setEditingContract(c);
        setContractForm({
            description: c.description, type: c.type,
            fixed_amount: String(c.fixed_amount), percentage: String(c.percentage),
            percentage_base: c.percentage_base, billing_day: String(c.billing_day),
            start_date: c.start_date ? c.start_date.split('T')[0] : '',
            end_date: c.end_date ? c.end_date.split('T')[0] : '',
            status: c.status, payment_method: c.payment_method || '',
            notes: c.notes || '', contract_file_url: c.contract_file_url || '',
        });
        setContractError('');
        setShowContractModal(true);
    }

    async function handleSaveContract() {
        if (!contractForm.description.trim()) { setContractError('Descrição é obrigatória'); return; }
        if (!contractsClient) return;
        setSavingContract(true); setContractError('');
        try {
            const body = {
                ...contractForm,
                fixed_amount: parseFloat(contractForm.fixed_amount) || 0,
                percentage: parseFloat(contractForm.percentage) || 0,
                billing_day: parseInt(contractForm.billing_day) || 1,
                start_date: contractForm.start_date || null,
                end_date: contractForm.end_date || null,
                payment_method: contractForm.payment_method || null,
                notes: contractForm.notes || null,
                contract_file_url: contractForm.contract_file_url || null,
            };
            const url = editingContract
                ? `${API}/clients/${contractsClient.id}/contracts/${editingContract.id}`
                : `${API}/clients/${contractsClient.id}/contracts`;
            const method = editingContract ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) { setContractError(json.error?.message || 'Erro ao salvar'); return; }
            setShowContractModal(false);
            fetchContracts(contractsClient.id);
        } catch { setContractError('Erro de conexão'); } finally { setSavingContract(false); }
    }

    async function handleDeleteContract() {
        if (!deleteContractId || !contractsClient) return;
        try {
            await fetch(`${API}/clients/${contractsClient.id}/contracts/${deleteContractId}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
            });
            setDeleteContractId(null);
            fetchContracts(contractsClient.id);
        } catch { /* ignore */ }
    }

    const STATUS_TABS = [
        { value: '', label: 'Todos' }, { value: 'ativo', label: 'Ativo' },
        { value: 'inativo', label: 'Inativo' }, { value: 'prospecto', label: 'Prospecto' },
        { value: 'churned', label: 'Churned' },
    ];

    return (
        <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
            {/* ─── Header ─── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Clientes</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Gerencie seus clientes e contratos</p>
                </div>
                <button
                    onClick={openCreateClient}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                >
                    <Plus size={16} /> Novo Cliente
                </button>
            </div>

            {/* ─── Stats ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
                {[
                    { label: 'Total Clientes', value: stats.total, icon: Users, color: '#6366f1', bg: 'rgba(99,102,241,.12)' },
                    { label: 'Ativos', value: stats.ativos, icon: TrendingUp, color: '#10b981', bg: 'rgba(16,185,129,.12)' },
                    { label: 'MRR Total', value: formatBRL(stats.mrr), icon: DollarSign, color: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
                    { label: 'Churn', value: stats.churn, icon: UserMinus, color: '#ef4444', bg: 'rgba(239,68,68,.12)' },
                ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <s.icon size={20} color={s.color} />
                        </div>
                        <div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ─── Filters ─── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text" placeholder="Buscar por nome, e-mail ou empresa..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {STATUS_TABS.map(tab => (
                        <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: statusFilter === tab.value ? 'var(--primary)' : 'transparent', borderColor: statusFilter === tab.value ? 'var(--primary)' : 'var(--border)', color: statusFilter === tab.value ? '#fff' : 'var(--text-muted)' }}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Client Grid ─── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : clients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text-muted)' }}>
                    <Building2 size={40} style={{ opacity: .3, marginBottom: 12 }} />
                    <p style={{ margin: 0, fontSize: 15 }}>Nenhum cliente encontrado</p>
                    <p style={{ margin: '8px 0 0', fontSize: 13 }}>Clique em "Novo Cliente" para adicionar</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                    {clients.map(client => {
                        const cfg = STATUS_CONFIG[client.status] || STATUS_CONFIG.inativo;
                        const billing = billingSummaryMap[client.id];
                        const isOverdue = billing && Number(billing.total_owed) > 0;
                        const hasContracts = (client.active_contracts || []).length > 0;
                        return (
                            <div key={client.id}
                                style={{ background: 'var(--bg-card)', border: `1px solid ${isOverdue ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, transition: 'border-color .15s, box-shadow .15s' }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                            >
                                {/* Top */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                    <div style={{ width: 48, height: 48, borderRadius: 14, background: client.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {getInitials(client.name)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{client.name}</div>
                                        {client.company && (
                                            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <Building2 size={12} /> {client.company}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                        {cfg.label}
                                    </span>
                                </div>

                                {/* Billing status */}
                                {hasContracts && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: isOverdue ? 'rgba(239,68,68,.08)' : 'rgba(16,185,129,.08)', border: `1px solid ${isOverdue ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.2)'}` }}>
                                        {isOverdue ? (
                                            <>
                                                <AlertCircle size={14} color="#ef4444" />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#ef4444' }}>Inadimplente</span>
                                                <span style={{ fontSize: 13, color: '#ef4444', marginLeft: 'auto' }}>{formatBRL(Number(billing.total_owed))}</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={14} color="#10b981" />
                                                <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>Em dia</span>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Contact */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {client.email && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                            <Mail size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>
                                        </div>
                                    )}
                                    {client.phone && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                                            <Phone size={13} /> {client.phone}
                                        </div>
                                    )}
                                </div>

                                {/* Plan & value badges from contracts */}
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {client.plan && (
                                        <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc' }}>
                                            {client.plan}
                                        </div>
                                    )}
                                    {(() => {
                                        const cs = client.active_contracts || [];
                                        const totalFixed = cs
                                            .filter(c => c.type === 'fixed' || c.type === 'mixed')
                                            .reduce((s, c) => s + Number(c.fixed_amount), 0);
                                        return totalFixed > 0 ? (
                                            <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)', color: '#34d399' }}>
                                                {formatBRL(totalFixed)}/mês
                                            </div>
                                        ) : null;
                                    })()}
                                    {(client.active_contracts || [])
                                        .filter(c => (c.type === 'percentage' || c.type === 'mixed') && c.percentage > 0)
                                        .map((c, i) => (
                                            <div key={i} style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <Percent size={11} />
                                                {c.percentage}% de {c.percentage_base}
                                            </div>
                                        ))
                                    }
                                </div>

                                {/* Meeting frequency badge */}
                                {(() => {
                                    const ms = meetingStatsMap[client.id];
                                    if (!ms || client.status !== 'ativo') return null;
                                    const riskCfg = ms.risk === 'high'
                                        ? { color: '#ef4444', bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)', label: `${ms.this_month} reunião este mês — Risco de churn` }
                                        : ms.risk === 'medium'
                                        ? { color: '#f59e0b', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.2)', label: `${ms.this_month} reunião este mês` }
                                        : { color: '#22c55e', bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.2)', label: `${ms.this_month} reuniões este mês` };
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: riskCfg.bg, border: `1px solid ${riskCfg.border}`, fontSize: 12, fontWeight: 500, color: riskCfg.color }}>
                                            <Calendar size={12} />
                                            {riskCfg.label}
                                        </div>
                                    );
                                })()}

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button
                                        onClick={() => openMeetingsDrawer(client)}
                                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc', cursor: 'pointer' }}
                                    >
                                        <Calendar size={14} /> Reuniões
                                    </button>
                                    <button
                                        onClick={() => openContractsDrawer(client)}
                                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', color: '#34d399', cursor: 'pointer' }}
                                    >
                                        <FileText size={14} /> Contratos
                                    </button>
                                    <button
                                        onClick={() => openEditClient(client)}
                                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc', cursor: 'pointer' }}
                                    >
                                        <Edit2 size={14} /> Editar
                                    </button>
                                    <button
                                        onClick={() => setDeleteClientId(client.id)}
                                        style={{ width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171', cursor: 'pointer' }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Meetings Drawer ─── */}
            {meetingsClient && (
                <>
                    <div onClick={closeMeetingsDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: meetingsClient.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                {getInitials(meetingsClient.name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meetingsClient.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Histórico de Reuniões</div>
                            </div>
                            <button onClick={closeMeetingsDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Stats summary */}
                        {(() => {
                            const ms = meetingStatsMap[meetingsClient.id];
                            if (!ms) return null;
                            const riskLabel = ms.risk === 'high' ? 'Alto risco de churn' : ms.risk === 'medium' ? 'Atenção' : 'Frequência ok';
                            const riskColor = ms.risk === 'high' ? '#ef4444' : ms.risk === 'medium' ? '#f59e0b' : '#22c55e';
                            return (
                                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                                    <div style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: riskColor }}>{ms.this_month}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Este mês</div>
                                    </div>
                                    <div style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{ms.last_month}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Mês passado</div>
                                    </div>
                                    <div style={{ flex: 1, textAlign: 'center', padding: '12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{ms.total_completed}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Total</div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: 10, background: ms.risk === 'high' ? 'rgba(239,68,68,.08)' : ms.risk === 'medium' ? 'rgba(245,158,11,.08)' : 'rgba(34,197,94,.08)', border: `1px solid ${ms.risk === 'high' ? 'rgba(239,68,68,.2)' : ms.risk === 'medium' ? 'rgba(245,158,11,.2)' : 'rgba(34,197,94,.2)'}`, minWidth: 90, flexDirection: 'column', gap: 4 }}>
                                        <span style={{ fontSize: 18 }}>{ms.risk === 'high' ? '🔴' : ms.risk === 'medium' ? '🟡' : '🟢'}</span>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: riskColor, textAlign: 'center', lineHeight: 1.3 }}>{riskLabel}</span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Meeting list */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {loadingMeetings ? (
                                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 14 }}>Carregando...</div>
                            ) : clientMeetings.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                    <Calendar size={36} color="var(--text-muted)" style={{ opacity: 0.4, marginBottom: 12 }} />
                                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma reunião registrada</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, opacity: 0.7 }}>Marque reuniões como realizadas na Agenda</div>
                                </div>
                            ) : (
                                clientMeetings.map((m: any) => (
                                    <div key={m.id} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Video size={13} color="#6366f1" />
                                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', flex: 1 }}>{m.title}</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                {new Date(m.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        {m.summary && (
                                            <div style={{ fontSize: 13, color: 'var(--text-muted)', paddingLeft: 21, lineHeight: 1.5 }}>{m.summary}</div>
                                        )}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 21 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 500 }}>Realizada</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                            Meta: mínimo 2 reuniões por mês para reduzir risco de churn
                        </div>
                    </div>
                </>
            )}

            {/* ─── Client Modal ─── */}
            {showClientModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                                {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
                            </h2>
                            <button onClick={() => setShowClientModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <X size={20} />
                            </button>
                        </div>
                        {clientError && <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 }}>{clientError}</div>}

                        {/* Avatar Color */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={labelStyle}>Cor do Avatar</label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {AVATAR_COLORS.map(color => (
                                    <button key={color} onClick={() => setClientForm(f => ({ ...f, avatar_color: color }))}
                                        style={{ width: 32, height: 32, borderRadius: 8, background: color, border: '3px solid', borderColor: clientForm.avatar_color === color ? '#fff' : 'transparent', cursor: 'pointer', outline: clientForm.avatar_color === color ? `2px solid ${color}` : 'none' }}
                                    />
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div style={{ gridColumn: '1/-1' }}>
                                <FF label="Nome *" value={clientForm.name} onChange={v => setClientForm(f => ({ ...f, name: v }))} placeholder="Nome do cliente" />
                            </div>
                            <FF label="E-mail" value={clientForm.email} onChange={v => setClientForm(f => ({ ...f, email: v }))} placeholder="email@exemplo.com" type="email" />
                            <FF label="Telefone" value={clientForm.phone} onChange={v => setClientForm(f => ({ ...f, phone: v }))} placeholder="(11) 99999-9999" />
                            <div style={{ gridColumn: '1/-1' }}>
                                <FF label="Empresa" value={clientForm.company} onChange={v => setClientForm(f => ({ ...f, company: v }))} placeholder="Nome da empresa" />
                            </div>
                            <div>
                                <label style={labelStyle}>Status</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={clientForm.status} onChange={e => setClientForm(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
                                        <option value="ativo">Ativo</option>
                                        <option value="inativo">Inativo</option>
                                        <option value="prospecto">Prospecto</option>
                                        <option value="churned">Churned</option>
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>
                            <FF label="Plano / Pacote" value={clientForm.plan} onChange={v => setClientForm(f => ({ ...f, plan: v }))} placeholder="Ex: Pro, Basic, Premium..." />
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={labelStyle}>Observações</label>
                                <textarea value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas sobre o cliente..." rows={3}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                            <button onClick={() => setShowClientModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
                            <button onClick={handleSaveClient} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--primary)', border: 'none', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                                {saving ? 'Salvando...' : editingClient ? 'Salvar Alterações' : 'Criar Cliente'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Contracts Drawer ─── */}
            {contractsClient && (
                <>
                    {/* Overlay */}
                    <div onClick={closeContractsDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200 }} />
                    {/* Drawer */}
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: contractsClient.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                {getInitials(contractsClient.name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contractsClient.name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Contratos e Recorrências</div>
                            </div>
                            <button onClick={closeContractsDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Add button */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                            <button onClick={openCreateContract}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                                <Plus size={16} /> Novo Contrato
                            </button>
                        </div>

                        {/* List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {loadingContracts ? (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
                            ) : contracts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    <FileText size={36} style={{ opacity: .25, marginBottom: 10 }} />
                                    <p style={{ margin: 0, fontSize: 14 }}>Nenhum contrato cadastrado</p>
                                </div>
                            ) : contracts.map(c => {
                                const sc = CONTRACT_STATUS_CONFIG[c.status] || CONTRACT_STATUS_CONFIG.ended;
                                return (
                                    <div key={c.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
                                        {/* Title row */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{c.description}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{CONTRACT_TYPE_LABELS[c.type]}</div>
                                            </div>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <sc.Icon size={12} /> {sc.label}
                                            </span>
                                        </div>

                                        {/* Values */}
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                                            {(c.type === 'fixed' || c.type === 'mixed') && c.fixed_amount > 0 && (
                                                <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.2)', color: '#34d399' }}>
                                                    {formatBRL(Number(c.fixed_amount))}/mês
                                                </div>
                                            )}
                                            {(c.type === 'percentage' || c.type === 'mixed') && c.percentage > 0 && (
                                                <div style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Percent size={11} /> {c.percentage}% de {c.percentage_base}
                                                </div>
                                            )}
                                        </div>

                                        {/* Meta */}
                                        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                            <span>Vence dia <strong style={{ color: 'var(--text)' }}>{c.billing_day}</strong></span>
                                            {c.start_date && <span>Início: <strong style={{ color: 'var(--text)' }}>{formatDate(c.start_date)}</strong></span>}
                                            {c.end_date && <span>Fim: <strong style={{ color: 'var(--text)' }}>{formatDate(c.end_date)}</strong></span>}
                                            {c.payment_method && <span>{c.payment_method}</span>}
                                        </div>

                                        {/* Contract file */}
                                        {c.contract_file_url && (
                                            <a
                                                href={c.contract_file_url} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 12, color: '#6366f1', textDecoration: 'none' }}
                                            >
                                                <ExternalLink size={12} /> Ver arquivo do contrato
                                            </a>
                                        )}

                                        {c.notes && (
                                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 8 }}>{c.notes}</div>
                                        )}

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                            <button onClick={() => openEditContract(c)}
                                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 8, fontSize: 12, background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', color: '#a5b4fc', cursor: 'pointer' }}>
                                                <Edit2 size={12} /> Editar
                                            </button>
                                            <button onClick={() => setDeleteContractId(c.id)}
                                                style={{ width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', color: '#f87171', cursor: 'pointer' }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* ─── Contract Modal ─── */}
            {showContractModal && contractsClient && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', padding: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                                {editingContract ? 'Editar Contrato' : 'Novo Contrato'}
                            </h2>
                            <button onClick={() => setShowContractModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>
                        {contractError && <div style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 10, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 20 }}>{contractError}</div>}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* Description */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <FF label="Descrição *" value={contractForm.description} onChange={v => setContractForm(f => ({ ...f, description: v }))} placeholder="Ex: Gestão de Tráfego Mensal" />
                            </div>

                            {/* Type */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={labelStyle}>Tipo de Cobrança</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {(['fixed', 'percentage', 'mixed'] as const).map(t => (
                                        <button key={t} onClick={() => setContractForm(f => ({ ...f, type: t }))}
                                            style={{ flex: 1, padding: '9px 8px', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid', background: contractForm.type === t ? 'var(--primary)' : 'transparent', borderColor: contractForm.type === t ? 'var(--primary)' : 'var(--border)', color: contractForm.type === t ? '#fff' : 'var(--text-muted)' }}>
                                            {CONTRACT_TYPE_LABELS[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Fixed amount */}
                            {(contractForm.type === 'fixed' || contractForm.type === 'mixed') && (
                                <FF label="Valor Fixo Mensal (R$)" value={contractForm.fixed_amount} onChange={v => setContractForm(f => ({ ...f, fixed_amount: v }))} placeholder="0,00" type="number" />
                            )}

                            {/* Percentage */}
                            {(contractForm.type === 'percentage' || contractForm.type === 'mixed') && (
                                <FF label="Porcentagem (%)" value={contractForm.percentage} onChange={v => setContractForm(f => ({ ...f, percentage: v }))} placeholder="Ex: 10" type="number" />
                            )}

                            {/* Percentage base */}
                            {(contractForm.type === 'percentage' || contractForm.type === 'mixed') && (
                                <div style={{ gridColumn: contractForm.type === 'percentage' ? '2/3' : '1/-1' }}>
                                    <FF label="Base do cálculo" value={contractForm.percentage_base} onChange={v => setContractForm(f => ({ ...f, percentage_base: v }))} placeholder="Investimento em anúncios" />
                                </div>
                            )}

                            {/* Billing day */}
                            <div>
                                <FF label="Dia de vencimento" value={contractForm.billing_day} onChange={v => setContractForm(f => ({ ...f, billing_day: v }))} placeholder="1" type="number" />
                            </div>

                            {/* Status */}
                            <div>
                                <label style={labelStyle}>Status</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={contractForm.status} onChange={e => setContractForm(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
                                        <option value="active">Ativo</option>
                                        <option value="paused">Pausado</option>
                                        <option value="ended">Encerrado</option>
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Dates */}
                            <FF label="Início" value={contractForm.start_date} onChange={v => setContractForm(f => ({ ...f, start_date: v }))} type="date" />
                            <FF label="Fim" value={contractForm.end_date} onChange={v => setContractForm(f => ({ ...f, end_date: v }))} type="date" />

                            {/* Payment method */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={labelStyle}>Forma de Pagamento</label>
                                <div style={{ position: 'relative' }}>
                                    <select value={contractForm.payment_method} onChange={e => setContractForm(f => ({ ...f, payment_method: e.target.value }))} style={selectStyle}>
                                        <option value="">Não especificado</option>
                                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                </div>
                            </div>

                            {/* Contract file URL */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={labelStyle}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Link size={12} /> Arquivo do Contrato (link)</span>
                                </label>
                                <input
                                    type="url"
                                    value={contractForm.contract_file_url}
                                    onChange={e => setContractForm(f => ({ ...f, contract_file_url: e.target.value }))}
                                    placeholder="https://drive.google.com/... ou Dropbox, OneDrive..."
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                                />
                                {contractForm.contract_file_url && (
                                    <a href={contractForm.contract_file_url} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 12, color: '#6366f1' }}>
                                        <ExternalLink size={11} /> Visualizar arquivo
                                    </a>
                                )}
                            </div>

                            {/* Notes */}
                            <div style={{ gridColumn: '1/-1' }}>
                                <label style={labelStyle}>Observações</label>
                                <textarea value={contractForm.notes} onChange={e => setContractForm(f => ({ ...f, notes: e.target.value }))} placeholder="Detalhes adicionais..." rows={2}
                                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                            <button onClick={() => setShowContractModal(false)} style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
                            <button onClick={handleSaveContract} disabled={savingContract} style={{ flex: 2, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--primary)', border: 'none', color: '#fff', cursor: savingContract ? 'not-allowed' : 'pointer', opacity: savingContract ? .7 : 1 }}>
                                {savingContract ? 'Salvando...' : editingContract ? 'Salvar Alterações' : 'Criar Contrato'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Delete Client Confirm ─── */}
            {deleteClientId && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 101, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 32, maxWidth: 400, width: '100%', textAlign: 'center' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(239,68,68,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Trash2 size={24} color="#ef4444" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 18, fontWeight: 700 }}>Remover Cliente?</h3>
                        <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14 }}>Esta ação não pode ser desfeita.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setDeleteClientId(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>Cancelar</button>
                            <button onClick={handleDeleteClient} style={{ flex: 1, padding: '11px', borderRadius: 10, background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Remover</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Delete Contract Confirm ─── */}
            {deleteContractId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 302, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 28, maxWidth: 360, width: '100%', textAlign: 'center' }}>
                        <h3 style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 17, fontWeight: 700 }}>Remover Contrato?</h3>
                        <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13 }}>Esta ação não pode ser desfeita.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setDeleteContractId(null)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                            <button onClick={handleDeleteContract} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Remover</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Shared styles ──────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 };

const selectStyle: React.CSSProperties = {
    width: '100%', padding: '10px 32px 10px 12px',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none',
    appearance: 'none', cursor: 'pointer',
};

function FF({ label, value, onChange, placeholder = '', type = 'text' }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
            />
        </div>
    );
}
