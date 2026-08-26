'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Search, Play, Pause, RefreshCw, Key, Plus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function GoogleAdsPage() {
    const [creds, setCreds] = useState<any>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAcc, setSelectedAcc] = useState<any>(null);
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [credsModal, setCredsModal] = useState(false);
    const [discoverModal, setDiscoverModal] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const c = await api.gaGetCredentials();
            setCreds(c);
            if (c?.has_refresh) {
                const list = await api.gaListAccounts();
                setAccounts(list);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []);

    async function selectAccount(acc: any) {
        setSelectedAcc(acc);
        try {
            const c = await api.gaGetCampaigns(acc.id);
            setCampaigns(c);
        } catch (e: any) { alert('Erro: ' + e.message); }
    }

    async function syncAcc(acc: any) {
        try {
            const r = await api.gaSyncAccount(acc.id, 30);
            alert(`✓ ${r.campaigns} campanhas / ${r.insights} insights sincronizados`);
            if (selectedAcc?.id === acc.id) selectAccount(acc);
        } catch (e: any) { alert('Erro: ' + e.message); }
    }

    async function toggleCampaign(camp: any) {
        const next = camp.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
        try {
            await api.gaSetCampaignStatus(camp.google_campaign_id, selectedAcc.id, next);
            selectAccount(selectedAcc);
        } catch (e: any) { alert('Erro: ' + e.message); }
    }

    const credsOk = creds?.has_dev_token && creds?.has_refresh && creds?.has_client_id && creds?.has_client_secret && creds?.login_customer_id;

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Search size={28} style={{ color: '#4285F4' }} /> Google Ads
                    </h1>
                    <p>Sincronize campanhas + pause/reative direto do painel</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => setCredsModal(true)}>
                        <Key size={16} /> Credenciais
                    </button>
                    {credsOk && (
                        <button className="btn btn-primary" onClick={() => setDiscoverModal(true)}>
                            <Plus size={16} /> Adicionar conta
                        </button>
                    )}
                </div>
            </div>

            {loading ? <div className="card empty-state">Carregando…</div>
            : !credsOk ? (
                <div className="card empty-state">
                    <Key size={48} style={{ margin: '0 auto 16px', color: '#4285F4', opacity: .4 }} />
                    <h3>Configure suas credenciais Google Ads</h3>
                    <p>Você precisa de: Developer Token (Basic Access), Login Customer ID (MCC), Refresh Token, Client ID e Secret.</p>
                    <button className="btn btn-primary" onClick={() => setCredsModal(true)} style={{ marginTop: 16 }}>Configurar agora</button>
                </div>
            ) : accounts.length === 0 ? (
                <div className="card empty-state">
                    <h3>Nenhuma conta importada</h3>
                    <p>Clique em "Adicionar conta" pra descobrir as contas do seu MCC via API.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {accounts.map(a => (
                            <div key={a.id} className="card" style={{
                                padding: 14, cursor: 'pointer',
                                borderLeft: selectedAcc?.id === a.id ? '3px solid #4285F4' : '3px solid transparent',
                                background: selectedAcc?.id === a.id ? 'var(--bg-hover)' : 'var(--bg-surface)',
                            }} onClick={() => selectAccount(a)}>
                                <div style={{ fontWeight: 700, fontSize: 14 }}>{a.account_name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{a.customer_id} · {a.currency}</div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <button className="btn" onClick={e => { e.stopPropagation(); syncAcc(a); }} style={{ padding: 4, fontSize: 11 }}>
                                        <RefreshCw size={12} /> Sync
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        {!selectedAcc ? (
                            <div className="card empty-state">Selecione uma conta</div>
                        ) : campaigns.length === 0 ? (
                            <div className="card empty-state">
                                <p>Sem campanhas sincronizadas. Clique em Sync na conta.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 8 }}>
                                {campaigns.map(c => {
                                    const cost = Number(c.cost_micros) / 1_000_000;
                                    const conv = Number(c.conversions);
                                    const cpa = conv > 0 ? cost / conv : 0;
                                    return (
                                        <div key={c.id} className="card" style={{
                                            padding: 16, display: 'flex', gap: 12, alignItems: 'center',
                                            borderLeft: `3px solid ${c.status === 'ENABLED' ? 'var(--accent-green)' : 'var(--text-muted)'}`,
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.advertising_channel_type} · {c.status}</div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 20, fontSize: 12 }}>
                                                <Metric label="Custo" val={`R$ ${cost.toFixed(2)}`} />
                                                <Metric label="Impressões" val={Number(c.impressions).toLocaleString('pt-BR')} />
                                                <Metric label="Conversões" val={conv.toFixed(0)} />
                                                <Metric label="CPA" val={cpa > 0 ? `R$ ${cpa.toFixed(2)}` : '—'} />
                                            </div>
                                            <button className="btn" onClick={() => toggleCampaign(c)} title={c.status === 'ENABLED' ? 'Pausar' : 'Ativar'} style={{ padding: 8 }}>
                                                {c.status === 'ENABLED' ? <Pause size={14} /> : <Play size={14} />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {credsModal && <CredentialsModal creds={creds} onClose={() => setCredsModal(false)} onSaved={() => { setCredsModal(false); load(); }} />}
            {discoverModal && <DiscoverAccountsModal onClose={() => setDiscoverModal(false)} onImported={() => { setDiscoverModal(false); load(); }} />}
        </div>
    );
}

function Metric({ label, val }: any) {
    return (
        <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{val}</div>
        </div>
    );
}

function CredentialsModal({ creds, onClose, onSaved }: any) {
    const [form, setForm] = useState({
        developer_token: '',
        login_customer_id: creds?.login_customer_id || '',
        refresh_token: '',
        client_id: '',
        client_secret: '',
    });
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await api.gaSetCredentials(form);
            onSaved();
        } catch (e: any) { alert('Erro: ' + e.message); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <h2 style={{ marginTop: 0 }}>Credenciais Google Ads</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                    Todos os campos são armazenados no banco (não em .env).
                </p>

                <Field label="Developer Token (Basic Access)" placeholder="Cole do Google Ads API Center"
                    val={form.developer_token} onChange={v => setForm({ ...form, developer_token: v })}
                    help="Pega em ads.google.com/aw/apicenter → Detalhes do desenvolvedor" />
                <Field label="Login Customer ID (MCC — 10 dígitos)" placeholder="1234567890"
                    val={form.login_customer_id} onChange={v => setForm({ ...form, login_customer_id: v })}
                    help="ID do seu Manager account (sem hífens)" />
                <Field label="Refresh Token" placeholder="1//..."
                    val={form.refresh_token} onChange={v => setForm({ ...form, refresh_token: v })}
                    help="Rode `python mcp/get_refresh_token.py` na pasta 'google ads' pra gerar" />
                <Field label="Client ID (OAuth)" val={form.client_id} onChange={v => setForm({ ...form, client_id: v })} />
                <Field label="Client Secret" val={form.client_secret} onChange={v => setForm({ ...form, client_secret: v })} />

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
                    <button className="btn" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                        {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, placeholder, val, onChange, help }: { label: string; placeholder?: string; val: string; onChange: (v: string) => void; help?: string }) {
    return (
        <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ fontSize: 13 }}>{label}</label>
            <input className="form-input" placeholder={placeholder || ''} value={val} onChange={e => onChange(e.target.value)} type={label.toLowerCase().includes('secret') || label.toLowerCase().includes('token') ? 'password' : 'text'} />
            {help && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{help}</div>}
        </div>
    );
}

function DiscoverAccountsModal({ onClose, onImported }: any) {
    const [loading, setLoading] = useState(true);
    const [customers, setCustomers] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState<string | null>(null);

    useEffect(() => {
        api.gaListAccessibleCustomers()
            .then(setCustomers)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, []);

    async function importAcc(c: any) {
        setImporting(c.id);
        try {
            await api.gaImportAccount({
                customer_id: c.id,
                account_name: c.name,
                currency: c.currency,
                time_zone: c.timeZone,
            });
        } catch (e: any) { alert('Erro: ' + e.message); }
        finally { setImporting(null); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }} onClick={onClose}>
            <div className="card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <h2 style={{ marginTop: 0 }}>Contas acessíveis pelo MCC</h2>
                {loading && <div style={{ padding: 24, textAlign: 'center' }}><Loader2 size={24} className="spin" /></div>}
                {error && <div style={{ padding: 16, background: 'rgba(239,68,68,.1)', borderRadius: 8, color: 'var(--accent-red)' }}>{error}</div>}
                {!loading && !error && customers.length === 0 && <p>Nenhuma conta encontrada</p>}
                {!loading && !error && customers.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                        {customers.map(c => (
                            <div key={c.id} className="card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name} {c.manager && <span style={{ fontSize: 10, background: 'var(--accent-orange)', color: '#000', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>MCC</span>}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.id} · {c.currency}</div>
                                </div>
                                {!c.manager && (
                                    <button className="btn btn-primary" onClick={() => importAcc(c)} disabled={importing === c.id} style={{ fontSize: 12 }}>
                                        {importing === c.id ? '…' : 'Importar'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ marginTop: 20, textAlign: 'right' }}>
                    <button className="btn" onClick={onImported}>Fechar</button>
                </div>
            </div>
        </div>
    );
}
