'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Plus, Search, Edit2, Trash2, X, Building2, Mail, Phone,
    TrendingUp, Users, DollarSign, UserMinus, ChevronDown,
    FileText, Percent, CheckCircle, PauseCircle, XCircle,
    AlertCircle, CheckCircle2, ExternalLink, Link, Calendar, Video,
} from 'lucide-react';
import { api } from '@/lib/api';

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
    plan: '', notes: '', avatar_color: '#ff6b35',
};

const emptyContractForm: ContractForm = {
    description: '', type: 'fixed', fixed_amount: '', percentage: '',
    percentage_base: 'Investimento em anúncios', billing_day: '1',
    start_date: '', end_date: '', status: 'active',
    payment_method: '', notes: '', contract_file_url: '',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    '#ff6b35', '#8b5cf6', '#ec4899', '#f97316', '#10b981',
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

    // Meetings (compartilhado com drawer único)
    const [meetingStatsMap, setMeetingStatsMap] = useState<Record<string, { this_month: number; last_month: number; risk: 'low' | 'medium' | 'high'; total_completed: number }>>({});
    const [meetingsClient, setMeetingsClient] = useState<Client | null>(null); // legacy alias
    const [clientMeetings, setClientMeetings] = useState<any[]>([]);
    const [loadingMeetings, setLoadingMeetings] = useState(false);

    // Drawer único + ordenação
    type SortKey = 'mrr_desc' | 'mrr_asc' | 'name_asc' | 'name_desc' | 'risk' | 'last_meeting';
    const [sortBy, setSortBy] = useState<SortKey>('mrr_desc');
    const [openClient, setOpenClient] = useState<Client | null>(null);
    const [drawerTab, setDrawerTab] = useState<'overview' | 'contracts' | 'meetings' | 'onboarding'>('overview');
    // Onboarding do cliente aberto
    const [onboardingsByClient, setOnboardingsByClient] = useState<Array<{ ad_account: any; onboarding: any }>>([]);
    const [loadingOnboardings, setLoadingOnboardings] = useState(false);
    // Prompt pra iniciar onboarding após cadastrar cliente novo
    const [promptOnboardingForClient, setPromptOnboardingForClient] = useState<{ id: string; name: string } | null>(null);
    // Summary de onboardings pra badge por cliente na tabela
    const [onboardingSummary, setOnboardingSummary] = useState<Record<string, { pct: number; status: string }>>({});

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
            // Onboarding summary por cliente (badge na tabela)
            try {
                const sum: any = await api.getOnboardingSummary();
                const map: Record<string, { pct: number; status: string }> = {};
                for (const [cid, data] of Object.entries(sum.by_client || {})) {
                    map[cid] = { pct: (data as any).pct, status: (data as any).status };
                }
                setOnboardingSummary(map);
            } catch { /* ignore */ }
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

    // ── Helpers de ordenação e risco ──
    function getMrr(c: Client): number {
        return (c.active_contracts || [])
            .filter(ct => ct.type === 'fixed' || ct.type === 'mixed')
            .reduce((s, ct) => s + Number(ct.fixed_amount), 0);
    }
    function getRiskScore(c: Client): number {
        // Maior score = mais arriscado
        let s = 0;
        if (c.status === 'churned') s += 100;
        const billing = billingSummaryMap[c.id];
        if (billing && Number(billing.total_owed) > 0) s += 40;
        const ms = meetingStatsMap[c.id];
        if (c.status === 'ativo' && ms) {
            if (ms.risk === 'high') s += 30;
            else if (ms.risk === 'medium') s += 10;
        }
        return s;
    }
    function getRiskLevel(c: Client): 'high' | 'medium' | 'low' | 'none' {
        if (c.status !== 'ativo') return 'none';
        const score = getRiskScore(c);
        if (score >= 40) return 'high';
        if (score >= 10) return 'medium';
        return 'low';
    }
    function getLastMeetingMs(c: Client): number {
        const ms = meetingStatsMap[c.id];
        return ms?.this_month || 0;
    }

    // Lista ordenada conforme sortBy
    const sortedClients = [...clients].sort((a, b) => {
        switch (sortBy) {
            case 'mrr_desc': return getMrr(b) - getMrr(a);
            case 'mrr_asc': return getMrr(a) - getMrr(b);
            case 'name_asc': return a.name.localeCompare(b.name, 'pt-BR');
            case 'name_desc': return b.name.localeCompare(a.name, 'pt-BR');
            case 'risk': return getRiskScore(b) - getRiskScore(a);
            case 'last_meeting': return getLastMeetingMs(b) - getLastMeetingMs(a);
            default: return 0;
        }
    });

    // Clientes em risco (pra seção destacada no topo)
    const atRiskClients = clients.filter(c => {
        if (c.status !== 'ativo') return false;
        const billing = billingSummaryMap[c.id];
        const ms = meetingStatsMap[c.id];
        return (billing && Number(billing.total_owed) > 0) || (ms?.risk === 'high');
    }).sort((a, b) => getRiskScore(b) - getRiskScore(a));

    // ── Drawer único ──
    function openDrawer(client: Client, tab: 'overview' | 'contracts' | 'meetings' | 'onboarding' = 'overview') {
        setOpenClient(client);
        setDrawerTab(tab);
        // Pre-carrega os datasets (não é caro)
        setContractsClient(client); fetchContracts(client.id);
        setMeetingsClient(client); fetchClientMeetings(client.id);
        fetchClientOnboardings(client.id);
    }

    async function fetchClientOnboardings(clientId: string) {
        setLoadingOnboardings(true);
        try {
            const list = await api.getOnboardingsByClient(clientId);
            setOnboardingsByClient(list as any);
        } catch { setOnboardingsByClient([]); }
        finally { setLoadingOnboardings(false); }
    }

    async function startOnboardingForAccount(accountId: string, clientId: string) {
        try {
            await api.startOnboarding(accountId);
            fetchClientOnboardings(clientId);
        } catch (err: any) {
            alert(err.message || 'Erro ao iniciar onboarding');
        }
    }
    function closeDrawer() {
        setOpenClient(null);
        setContractsClient(null); setContracts([]);
        setMeetingsClient(null); setClientMeetings([]);
        setShowContractModal(false); setEditingContract(null);
    }

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
            const wasNewClient = !editingClient;
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
            // Após CRIAR cliente novo (não edição), oferece iniciar onboarding
            if (wasNewClient && json.data?.id) {
                setPromptOnboardingForClient({ id: json.data.id, name: clientForm.name });
            }
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
        <div style={{ padding: '32px', maxWidth: 1400, margin: '0 auto' }}>
            {/* ─── Header ─── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Clientes</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                        {stats.total} cliente{stats.total !== 1 ? 's' : ''} · {stats.ativos} ativo{stats.ativos !== 1 ? 's' : ''} · MRR {formatBRL(stats.mrr)}
                    </p>
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
                    { label: 'Total Clientes', value: stats.total, icon: Users, color: '#ff6b35', bg: 'rgba(255, 107, 53,.12)' },
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

            {/* ─── Filters + Sort ─── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                    <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                        type="text" placeholder="Buscar por nome, e-mail ou empresa..." value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {STATUS_TABS.map(tab => (
                        <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: statusFilter === tab.value ? 'var(--bg-card-hover)' : 'transparent', borderColor: statusFilter === tab.value ? 'var(--border-strong)' : 'var(--border)', color: statusFilter === tab.value ? 'var(--text)' : 'var(--text-muted)' }}>
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div style={{ position: 'relative' }}>
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
                        style={{ padding: '8px 32px 8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', outline: 'none', appearance: 'none', fontWeight: 500 }}>
                        <option value="mrr_desc">MRR ↓ (maior primeiro)</option>
                        <option value="mrr_asc">MRR ↑ (menor primeiro)</option>
                        <option value="name_asc">Nome A–Z</option>
                        <option value="name_desc">Nome Z–A</option>
                        <option value="risk">Risco (maior primeiro)</option>
                        <option value="last_meeting">Reuniões este mês ↓</option>
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                </div>
            </div>

            {/* ─── At-Risk section (só quando não há filtros) ─── */}
            {!loading && atRiskClients.length > 0 && !statusFilter && !search && (
                <div style={{ marginBottom: 20, background: 'rgba(239,68,68,.05)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 14, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <AlertCircle size={16} color="#ef4444" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                            {atRiskClients.length} cliente{atRiskClients.length !== 1 ? 's' : ''} em risco
                        </span>
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                            · Inadimplência ou poucas reuniões este mês
                        </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                        {atRiskClients.slice(0, 6).map(c => {
                            const billing = billingSummaryMap[c.id];
                            const ms = meetingStatsMap[c.id];
                            const overdue = billing && Number(billing.total_owed) > 0;
                            return (
                                <button key={c.id} onClick={() => openDrawer(c)} style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px',
                                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                                    borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                                }}>
                                    <div style={{ width: 30, height: 30, borderRadius: 8, background: c.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {getInitials(c.name)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                                        <div style={{ fontSize: 11.5, color: '#ef4444', marginTop: 1 }}>
                                            {overdue && <>Deve {formatBRL(Number(billing.total_owed))}</>}
                                            {overdue && ms?.risk === 'high' && ' · '}
                                            {ms?.risk === 'high' && <>{ms.this_month} reuniões</>}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── Tabela densa ─── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Carregando...</div>
            ) : sortedClients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, color: 'var(--text-muted)' }}>
                    <Building2 size={40} style={{ opacity: .3, marginBottom: 12 }} />
                    <p style={{ margin: 0, fontSize: 15 }}>Nenhum cliente encontrado</p>
                    <p style={{ margin: '8px 0 0', fontSize: 13 }}>Clique em "Novo Cliente" para adicionar</p>
                </div>
            ) : (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(220px, 2fr) 110px 140px 130px 110px 60px',
                        gap: 16,
                        padding: '12px 20px',
                        background: 'var(--bg-surface-2)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: 'var(--text-muted)',
                    }}>
                        <div>Cliente</div>
                        <div>Status</div>
                        <div style={{ textAlign: 'right' }}>MRR/mês</div>
                        <div>Pagamento</div>
                        <div>Reuniões</div>
                        <div></div>
                    </div>

                    {/* Rows */}
                    {sortedClients.map((client, idx) => {
                        const cfg = STATUS_CONFIG[client.status] || STATUS_CONFIG.inativo;
                        const billing = billingSummaryMap[client.id];
                        const isOverdue = billing && Number(billing.total_owed) > 0;
                        const ms = meetingStatsMap[client.id];
                        const mrr = getMrr(client);
                        const risk = getRiskLevel(client);

                        return (
                            <div key={client.id}
                                onClick={() => openDrawer(client)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(220px, 2fr) 110px 140px 130px 110px 60px',
                                    gap: 16,
                                    padding: '14px 20px',
                                    alignItems: 'center',
                                    borderBottom: idx < sortedClients.length - 1 ? '1px solid var(--border)' : 'none',
                                    cursor: 'pointer',
                                    transition: 'background .12s',
                                }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                                {/* Coluna 1: Cliente */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 9, background: client.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                        {getInitials(client.name)}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto', minWidth: 0 }}>
                                                {client.name}
                                            </div>
                                            {onboardingSummary[client.id] && (() => {
                                                const ob = onboardingSummary[client.id];
                                                const color = ob.pct === 100 ? 'var(--success, #7bc46c)' : ob.status === 'paused' ? 'var(--text-muted)' : 'var(--primary)';
                                                const bg = ob.pct === 100 ? 'rgba(123,196,108,0.10)' : ob.status === 'paused' ? 'rgba(160,152,137,0.10)' : 'rgba(255,107,53,0.10)';
                                                const label = ob.pct === 100 ? 'ok' : ob.status === 'paused' ? 'pausado' : `${ob.pct}%`;
                                                return (
                                                    <span title={`Onboarding: ${ob.pct}% completo`} style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, color, background: bg, border: `1px solid ${color}30`, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: 0.3 }}>
                                                        ⌇ {label}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {client.company || client.email || '—'}
                                        </div>
                                    </div>
                                </div>

                                {/* Coluna 2: Status */}
                                <div>
                                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>
                                        {cfg.label}
                                    </span>
                                </div>

                                {/* Coluna 3: MRR */}
                                <div className="num" style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: mrr > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                                    {mrr > 0 ? formatBRL(mrr) : '—'}
                                </div>

                                {/* Coluna 4: Pagamento */}
                                <div>
                                    {!billing ? (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                    ) : isOverdue ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#ef4444' }}>
                                            <AlertCircle size={12} />
                                            {formatBRL(Number(billing.total_owed))}
                                        </span>
                                    ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#10b981' }}>
                                            <CheckCircle2 size={12} /> Em dia
                                        </span>
                                    )}
                                </div>

                                {/* Coluna 5: Reuniões */}
                                <div>
                                    {!ms || client.status !== 'ativo' ? (
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                                    ) : (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: risk === 'high' ? '#ef4444' : risk === 'medium' ? '#f59e0b' : '#10b981' }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
                                            {ms.this_month} este mês
                                        </span>
                                    )}
                                </div>

                                {/* Coluna 6: Actions */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => openEditClient(client)}
                                        title="Editar"
                                        style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Drawer único (Visão geral / Contratos / Reuniões) ─── */}
            {openClient && (
                <>
                    <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 200 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: openClient.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                {getInitials(openClient.name)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{openClient.name}</div>
                                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                                    {openClient.company || '—'}
                                    {' · '}
                                    <span style={{ color: STATUS_CONFIG[openClient.status]?.color }}>{STATUS_CONFIG[openClient.status]?.label}</span>
                                </div>
                            </div>
                            <button onClick={() => openEditClient(openClient)} title="Editar" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <Edit2 size={14} />
                            </button>
                            <button onClick={() => setDeleteClientId(openClient.id)} title="Remover" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'transparent', border: '1px solid var(--border)', color: '#f87171', cursor: 'pointer' }}>
                                <Trash2 size={14} />
                            </button>
                            <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid var(--border)' }}>
                            {[
                                { k: 'overview' as const, label: 'Visão geral' },
                                { k: 'contracts' as const, label: `Contratos${contracts.length ? ` · ${contracts.length}` : ''}` },
                                { k: 'meetings' as const, label: `Reuniões${clientMeetings.length ? ` · ${clientMeetings.length}` : ''}` },
                                { k: 'onboarding' as const, label: `Onboarding${onboardingsByClient.length ? ` · ${onboardingsByClient.length}` : ''}${(() => {
                                    // Se cliente tem ad_accounts mas nenhuma com onboarding, mostra •
                                    const anyMissing = onboardingsByClient.some(x => !x.onboarding);
                                    return anyMissing ? ' •' : '';
                                })()}` },
                            ].map(t => (
                                <button key={t.k} onClick={() => setDrawerTab(t.k)}
                                    style={{
                                        padding: '11px 16px',
                                        fontSize: 13.5,
                                        fontWeight: drawerTab === t.k ? 600 : 500,
                                        color: drawerTab === t.k ? 'var(--text)' : 'var(--text-muted)',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginBottom: -1,
                                        borderBottom: `2px solid ${drawerTab === t.k ? 'var(--primary)' : 'transparent'}`,
                                    }}>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab: Visão geral */}
                        {drawerTab === 'overview' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                                {/* Contato */}
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Contato</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {openClient.email && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)' }}>
                                                <Mail size={13} color="var(--text-muted)" /> {openClient.email}
                                            </div>
                                        )}
                                        {openClient.phone && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)' }}>
                                                <Phone size={13} color="var(--text-muted)" /> {openClient.phone}
                                            </div>
                                        )}
                                        {!openClient.email && !openClient.phone && (
                                            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sem contatos cadastrados</span>
                                        )}
                                    </div>
                                </div>

                                {/* MRR + Status pagamento */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div style={{ padding: '14px 16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>MRR</div>
                                        <div className="num" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{formatBRL(getMrr(openClient))}</div>
                                    </div>
                                    <div style={{ padding: '14px 16px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Pagamento</div>
                                        {(() => {
                                            const b = billingSummaryMap[openClient.id];
                                            const od = b && Number(b.total_owed) > 0;
                                            if (!b) return <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Sem cobranças</div>;
                                            return od ? (
                                                <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444', marginTop: 4 }}>{formatBRL(Number(b.total_owed))}</div>
                                            ) : (
                                                <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <CheckCircle2 size={14} /> Em dia
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>

                                {/* Plano */}
                                {openClient.plan && (
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Plano</div>
                                        <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}>{openClient.plan}</span>
                                    </div>
                                )}

                                {/* Observações */}
                                {openClient.notes && (
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, marginBottom: 8 }}>Observações</div>
                                        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{openClient.notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab: Contratos */}
                        {drawerTab === 'contracts' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <button onClick={openCreateContract}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px', borderRadius: 10, background: 'var(--primary)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                                    <Plus size={16} /> Novo Contrato
                                </button>
                                {loadingContracts ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Carregando...</div>
                                ) : contracts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                        <FileText size={32} style={{ opacity: .25, marginBottom: 8 }} />
                                        <p style={{ margin: 0, fontSize: 13.5 }}>Nenhum contrato cadastrado</p>
                                    </div>
                                ) : contracts.map(c => {
                                    const sc = CONTRACT_STATUS_CONFIG[c.status] || CONTRACT_STATUS_CONFIG.ended;
                                    return (
                                        <div key={c.id} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{c.description}</div>
                                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{CONTRACT_TYPE_LABELS[c.type]} · vence dia {c.billing_day}</div>
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <sc.Icon size={12} /> {sc.label}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                                {(c.type === 'fixed' || c.type === 'mixed') && c.fixed_amount > 0 && (
                                                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: '#10b981' }}>
                                                        {formatBRL(Number(c.fixed_amount))}/mês
                                                    </span>
                                                )}
                                                {(c.type === 'percentage' || c.type === 'mixed') && c.percentage > 0 && (
                                                    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                        <Percent size={11} /> {c.percentage}% de {c.percentage_base}
                                                    </span>
                                                )}
                                            </div>
                                            {c.notes && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{c.notes}</div>}
                                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                <button onClick={() => openEditContract(c)} style={{ flex: 1, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                                    Editar
                                                </button>
                                                <button onClick={() => setDeleteContractId(c.id)} style={{ padding: '6px 10px', fontSize: 12.5, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: '#f87171', cursor: 'pointer' }}>
                                                    Remover
                                                </button>
                                                {c.contract_file_url && (
                                                    <a href={c.contract_file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', fontSize: 12.5, borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none' }}>
                                                        <ExternalLink size={11} /> PDF
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Tab: Reuniões */}
                        {drawerTab === 'meetings' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                {/* Stats compactas */}
                                {(() => {
                                    const ms = meetingStatsMap[openClient.id];
                                    if (!ms) return null;
                                    const riskColor = ms.risk === 'high' ? '#ef4444' : ms.risk === 'medium' ? '#f59e0b' : '#10b981';
                                    return (
                                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                            {[
                                                { label: 'Este mês', value: ms.this_month, color: riskColor },
                                                { label: 'Mês passado', value: ms.last_month },
                                                { label: 'Total', value: ms.total_completed },
                                            ].map(s => (
                                                <div key={s.label} style={{ padding: '10px 12px', background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                                                    <div className="num" style={{ fontSize: 20, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
                                                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>{s.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                                {/* Lista */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {loadingMeetings ? (
                                        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13.5 }}>Carregando...</div>
                                    ) : clientMeetings.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                            <Calendar size={28} style={{ opacity: .3, marginBottom: 8 }} />
                                            <div style={{ fontSize: 13.5 }}>Nenhuma reunião registrada</div>
                                        </div>
                                    ) : clientMeetings.map((m: any) => (
                                        <div key={m.id} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m.summary ? 6 : 0 }}>
                                                <Video size={13} color="var(--text-muted)" />
                                                <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', flex: 1 }}>{m.title}</span>
                                                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                    {new Date(m.event_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                                </span>
                                            </div>
                                            {m.summary && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingLeft: 21, lineHeight: 1.5 }}>{m.summary}</div>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tab: Onboarding */}
                        {drawerTab === 'onboarding' && (
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                                {/* Banner de alerta se tem ad_account sem onboarding iniciado */}
                                {!loadingOnboardings && onboardingsByClient.some(x => !x.onboarding) && (
                                    <div style={{ marginBottom: 16, padding: '14px 16px', background: 'rgba(245,164,90,0.10)', border: '1px solid rgba(245,164,90,0.35)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <AlertCircle size={18} color="#f5a45a" style={{ flexShrink: 0 }} />
                                        <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.45 }}>
                                            <strong>Onboarding pendente.</strong> Esse cliente tem conta(s) de anúncio vinculada(s) que ainda não iniciaram o processo. Sem o checklist, coisas podem escapar.
                                        </div>
                                    </div>
                                )}
                                {loadingOnboardings ? (
                                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13.5 }}>Carregando…</div>
                                ) : onboardingsByClient.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                        <div style={{ fontSize: 14, marginBottom: 8, color: 'var(--text)' }}>
                                            Cliente ainda não tem contas de anúncios vinculadas.
                                        </div>
                                        <div style={{ fontSize: 12.5 }}>
                                            Vincule uma ad account ao cliente na página Contas → Editar → escolha o cliente. Depois inicie o onboarding aqui.
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {onboardingsByClient.map(({ ad_account, onboarding }) => {
                                            const ob = onboarding;
                                            const statusColor = ob?.status === 'completed' ? 'var(--success, #7bc46c)' : ob?.status === 'paused' ? 'var(--text-muted)' : 'var(--primary)';
                                            return (
                                                <div key={ad_account.id} style={{ padding: 16, background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {ad_account.account_name}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                                {ad_account.meta_account_id}
                                                            </div>
                                                        </div>
                                                        {ob && (
                                                            <div style={{ fontSize: 22, fontWeight: 700, color: ob.pct === 100 ? 'var(--success, #7bc46c)' : 'var(--primary)' }}>
                                                                {ob.pct}%
                                                            </div>
                                                        )}
                                                    </div>
                                                    {ob ? (
                                                        <>
                                                            <div style={{ height: 6, background: 'var(--bg-elev)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
                                                                <div style={{ width: `${ob.pct}%`, height: '100%', background: ob.pct === 100 ? 'var(--success, #7bc46c)' : 'var(--primary)', transition: 'width 250ms ease' }} />
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                                    {ob.done} de {ob.total} feitos ·
                                                                    <span style={{ color: statusColor, marginLeft: 4, fontWeight: 600 }}>
                                                                        {ob.status === 'completed' ? 'Concluído' : ob.status === 'paused' ? 'Pausado' : 'Em andamento'}
                                                                    </span>
                                                                </div>
                                                                <a href="/onboarding" className="btn" style={{ fontSize: 12, padding: '5px 10px' }}>
                                                                    Ver checklist →
                                                                </a>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Onboarding ainda não iniciado</div>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ fontSize: 12, padding: '6px 12px' }}
                                                                onClick={() => startOnboardingForAccount(ad_account.id, openClient.id)}
                                                            >
                                                                Iniciar onboarding
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
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

            {/* (Contracts Drawer antigo removido — agora é uma aba dentro do drawer único acima) */}

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
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 12, color: '#ff6b35' }}>
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

            {/* ─── Onboarding Prompt (após cadastrar cliente novo) ─── */}
            {promptOnboardingForClient && (
                <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 102, padding: 20 }}>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, padding: 32, maxWidth: 480, width: '100%' }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,107,53,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <CheckCircle2 size={26} color="var(--primary)" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', color: 'var(--text)', fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
                            Cliente cadastrado ✓
                        </h3>
                        <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', lineHeight: 1.55 }}>
                            <strong style={{ color: 'var(--text)' }}>{promptOnboardingForClient.name}</strong> foi adicionado. Deseja iniciar o onboarding padrão de 54 tarefas agora?
                        </p>
                        <div style={{ padding: 14, background: 'var(--bg-elev)', borderRadius: 10, marginBottom: 20, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                            <strong style={{ color: 'var(--text)' }}>Como funciona:</strong> o onboarding é vinculado a uma conta de anúncios. Se o cliente ainda não tem uma conta vinculada, é só cadastrar/vincular em "Contas" e voltar aqui pra iniciar.
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setPromptOnboardingForClient(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                                Iniciar depois
                            </button>
                            <a
                                href="/onboarding"
                                style={{ flex: 2, padding: '11px', borderRadius: 10, fontSize: 14, fontWeight: 600, background: 'var(--primary)', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'center', textDecoration: 'none' }}
                                onClick={() => setPromptOnboardingForClient(null)}
                            >
                                Ir pra Onboarding →
                            </a>
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
