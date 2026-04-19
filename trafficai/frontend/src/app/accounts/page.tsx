'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  Users, CheckCircle, XCircle, Edit2, Save, X, Filter, RefreshCw,
  AlertCircle, Link2, PowerOff, Plus, DollarSign, Wallet, CreditCard,
  MessageCircle, Mail, Phone,
} from 'lucide-react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const authToken = () => typeof window !== 'undefined' ? localStorage.getItem('trafficai_token') || '' : '';

interface AdAccount {
  id: string;
  meta_account_id: string;
  account_name: string;
  currency: string;
  is_client_active: boolean;
  client_notes?: string;
  created_at: string;
  // billing fields
  payment_type?: 'pix' | 'card' | null;
  balance_alert_threshold?: number | null;
  cached_balance?: number | null;
  cached_account_status?: number | null;
  cached_amount_spent?: number | null;
  cached_spend_cap?: number | null;
  balance_updated_at?: string | null;
  last_insights_sync_at?: string | null;
}

interface BillingDraft {
  payment_type: 'pix' | 'card';
  balance_alert_threshold: string; // string for controlled input
}

/** account_status codes with payment problems */
const PAYMENT_PROBLEM_STATUSES = new Set([3, 7, 9]);

function formatBRL(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatUpdatedAt(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return '';
  }
}

function getBalanceColor(
  balance: number | null | undefined,
  threshold: number | null | undefined
): string {
  if (balance == null) return 'var(--text-muted)';
  if (threshold == null || threshold <= 0) return 'var(--accent-green)';
  if (balance <= threshold) return 'var(--accent-red)';
  if (balance <= threshold * 1.2) return 'var(--accent-yellow)';
  return 'var(--accent-green)';
}

function syncStatus(iso: string | null | undefined): { label: string; color: string } {
  if (!iso) return { label: 'Nunca sincronizado', color: 'var(--accent-red)' };
  const diff = Date.now() - new Date(iso).getTime();
  const hours = diff / 3_600_000;
  if (hours < 1) return { label: `há ${Math.max(1, Math.round(diff / 60_000))}min`, color: 'var(--accent-green)' };
  if (hours < 24) return { label: `há ${Math.round(hours)}h`, color: 'var(--accent-green)' };
  if (hours < 48) return { label: `há 1 dia`, color: 'var(--accent-yellow)' };
  if (hours < 168) return { label: `há ${Math.round(hours / 24)} dias`, color: 'var(--accent-yellow)' };
  return { label: `há ${Math.round(hours / 24)} dias`, color: 'var(--accent-red)' };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingBalances, setSyncingBalances] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ meta_account_id: '', account_name: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Billing editing state: accountId → draft
  const [billingEditingId, setBillingEditingId] = useState<string | null>(null);
  const [billingDraft, setBillingDraft] = useState<BillingDraft>({ payment_type: 'pix', balance_alert_threshold: '' });
  const [billingSaving, setBillingSaving] = useState(false);
  const [billingError, setBillingError] = useState<string>('');

  // Contact (report settings) state
  interface ContactDraft { client_name: string; client_email: string; client_phone: string; }
  const [contactMap, setContactMap] = useState<Record<string, ContactDraft>>({});
  const [contactEditingId, setContactEditingId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>({ client_name: '', client_email: '', client_phone: '' });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    filterAccounts();
  }, [accounts, filter]);

  // Carrega contatos de todas as contas quando a lista é carregada
  useEffect(() => {
    if (accounts.length === 0) return;
    accounts.forEach(acc => loadContactSettings(acc.id));
  }, [accounts]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterAccounts = () => {
    if (filter === 'all') {
      setFilteredAccounts(accounts);
    } else if (filter === 'active') {
      setFilteredAccounts(accounts.filter(acc => acc.is_client_active));
    } else {
      setFilteredAccounts(accounts.filter(acc => !acc.is_client_active));
    }
  };

  const toggleClientStatus = async (accountId: string, currentStatus: boolean, notes?: string) => {
    try {
      await api.updateAccountClientStatus(accountId, !currentStatus, notes);
      await loadAccounts();
    } catch (error: any) {
      alert('Erro ao atualizar status: ' + error.message);
    }
  };

  const saveNotes = async (accountId: string, isActive: boolean) => {
    try {
      await api.updateAccountClientStatus(accountId, isActive, editNotes);
      setEditingId(null);
      setEditNotes('');
      await loadAccounts();
    } catch (error: any) {
      alert('Erro ao salvar observações: ' + error.message);
    }
  };

  const startEditing = (account: AdAccount) => {
    setEditingId(account.id);
    setEditNotes(account.client_notes || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditNotes('');
  };

  const syncAccounts = async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      await api.triggerSync();
      alert('Sincronização iniciada! Suas contas serão atualizadas em breve.');
      setTimeout(() => {
        loadAccounts();
      }, 3000);
    } catch (error: any) {
      const errorMsg = error.message || 'Erro desconhecido';
      setSyncError(errorMsg);
      if (errorMsg.includes('Meta account not connected')) {
        setSyncError('Meta account not connected');
      }
    } finally {
      setSyncing(false);
    }
  };

  const syncBalances = async () => {
    try {
      setSyncingBalances(true);
      const result = await api.syncBalances();
      alert(`Saldos atualizados! ${result.message}`);
      await loadAccounts();
    } catch (error: any) {
      alert('Erro ao sincronizar saldos: ' + error.message);
    } finally {
      setSyncingBalances(false);
    }
  };

  const deactivateAll = async () => {
    if (!confirm(`Desativar todas as ${accounts.length} contas? Você poderá reativar uma a uma depois.`)) return;
    try {
      await api.deactivateAllAccounts();
      await loadAccounts();
    } catch (error: any) {
      alert('Erro: ' + error.message);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    try {
      await api.addManualAccount(addForm.meta_account_id, addForm.account_name);
      setShowAddModal(false);
      setAddForm({ meta_account_id: '', account_name: '' });
      await loadAccounts();
    } catch (err: any) {
      setAddError(err.message || 'Erro ao adicionar conta');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Billing helpers ──────────────────────────────────────────────────────────

  const startBillingEdit = (account: AdAccount) => {
    setBillingEditingId(account.id);
    setBillingError('');
    setBillingDraft({
      payment_type: account.payment_type || 'pix',
      balance_alert_threshold:
        account.balance_alert_threshold != null
          ? String(account.balance_alert_threshold)
          : '',
    });
  };

  const cancelBillingEdit = () => {
    setBillingEditingId(null);
    setBillingError('');
  };

  const saveBilling = async (accountId: string) => {
    setBillingSaving(true);
    setBillingError('');
    try {
      const threshold = billingDraft.balance_alert_threshold !== ''
        ? parseFloat(billingDraft.balance_alert_threshold.replace(',', '.'))
        : 0;
      if (isNaN(threshold) || threshold < 0) {
        setBillingError('Limite de alerta inválido');
        return;
      }
      await api.updateAccountBilling(accountId, billingDraft.payment_type, threshold);
      setBillingEditingId(null);
      await loadAccounts();
    } catch (err: any) {
      setBillingError(err.message || 'Erro ao salvar');
    } finally {
      setBillingSaving(false);
    }
  };

  // ── Contact helpers ──────────────────────────────────────────────────────────

  const loadContactSettings = async (accountId: string) => {
    try {
      const res = await fetch(`${API}/reports/settings/${accountId}`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      });
      const result = await res.json();
      if (result.success && result.data) {
        setContactMap(m => ({ ...m, [accountId]: {
          client_name: result.data.client_name || '',
          client_email: result.data.client_email || '',
          client_phone: result.data.client_phone || '',
        }}));
      }
    } catch { /* silently ignore */ }
  };

  const startContactEdit = (account: AdAccount) => {
    const existing = contactMap[account.id];
    setContactDraft({ client_name: existing?.client_name || '', client_email: existing?.client_email || '', client_phone: existing?.client_phone || '' });
    setContactError('');
    setContactEditingId(account.id);
  };

  const cancelContactEdit = () => { setContactEditingId(null); setContactError(''); };

  const saveContact = async (accountId: string) => {
    setContactSaving(true);
    setContactError('');
    try {
      const res = await fetch(`${API}/reports/settings/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({
          client_name: contactDraft.client_name || null,
          client_email: contactDraft.client_email || null,
          client_phone: contactDraft.client_phone || null,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error?.message || 'Erro ao salvar');
      setContactMap(m => ({ ...m, [accountId]: { ...contactDraft } }));
      setContactEditingId(null);
    } catch (err: any) {
      setContactError(err.message || 'Erro ao salvar');
    } finally {
      setContactSaving(false);
    }
  };

  const activeCount = accounts.filter(acc => acc.is_client_active).length;
  const inactiveCount = accounts.length - activeCount;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px' }}>
            Gerenciar Contas de Clientes
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Ative ou desative contas de anúncios dos seus clientes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {activeCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={deactivateAll}
              style={{ padding: '10px 18px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,.3)' }}
            >
              <PowerOff size={15} />
              Desativar todas
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowAddModal(true)}
            style={{ padding: '10px 18px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={15} />
            Adicionar conta
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={syncBalances}
            disabled={syncingBalances}
            style={{ padding: '10px 18px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Wallet size={15} style={{ animation: syncingBalances ? 'spin 1s linear infinite' : 'none' }} />
            {syncingBalances ? 'Atualizando...' : 'Atualizar Saldos'}
          </button>
          <button
            className="btn btn-primary"
            onClick={syncAccounts}
            disabled={syncing}
            style={{ padding: '12px 24px', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={18} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Sincronizando...' : 'Sincronizar Contas'}
          </button>
        </div>
      </div>

      {/* Meta Not Connected Warning */}
      {syncError === 'Meta account not connected' && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <AlertCircle size={20} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '4px' }}>
              Conta Meta não conectada
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Você precisa conectar sua conta do Meta para sincronizar suas contas de anúncios. Isso permite que o TrafficAI acesse suas campanhas e métricas.
            </p>
            <Link href="/settings">
              <button className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Link2 size={16} />
                Ir para Configurações
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card-glass" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Users size={20} color="var(--primary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 800 }}>{accounts.length}</p>
        </div>

        <div className="card-glass" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <CheckCircle size={20} color="var(--accent-green)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>ATIVOS</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent-green)' }}>{activeCount}</p>
        </div>

        <div className="card-glass" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <XCircle size={20} color="var(--text-muted)" />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>INATIVOS</span>
          </div>
          <p style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-muted)' }}>{inactiveCount}</p>
        </div>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Filter size={18} color="var(--text-muted)" />
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('all')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          Todas ({accounts.length})
        </button>
        <button
          className={`btn ${filter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('active')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          Ativas ({activeCount})
        </button>
        <button
          className={`btn ${filter === 'inactive' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFilter('inactive')}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          Inativas ({inactiveCount})
        </button>
      </div>

      {/* Accounts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredAccounts.map(account => {
          const hasPaymentProblem =
            account.cached_account_status != null &&
            PAYMENT_PROBLEM_STATUSES.has(account.cached_account_status);
          const balanceColor = getBalanceColor(
            account.cached_balance,
            account.balance_alert_threshold
          );
          const isEditingBilling = billingEditingId === account.id;

          return (
            <div key={account.id} className="card-glass" style={{ padding: '24px' }}>
              {/* Card Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                {/* Left: name + badges */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{account.account_name}</h3>
                    {account.is_client_active ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 12px',
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                        color: 'var(--accent-green)'
                      }}>
                        <CheckCircle size={14} />
                        Cliente Ativo
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 12px',
                        background: 'rgba(156, 163, 175, 0.1)',
                        border: '1px solid rgba(156, 163, 175, 0.3)',
                        borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                        color: 'var(--text-muted)'
                      }}>
                        <XCircle size={14} />
                        Cliente Inativo
                      </span>
                    )}
                    {hasPaymentProblem && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                        color: 'var(--accent-red)'
                      }}>
                        <AlertCircle size={13} />
                        Pagamento Pendente
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    ID: {account.meta_account_id} • Moeda: {account.currency}
                  </p>
                </div>

                {/* Right: balance display + action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                  {/* Balance chip */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
                    padding: '8px 14px',
                    background: 'var(--bg-input)',
                    border: `1px solid ${account.cached_balance != null ? balanceColor + '44' : 'var(--border)'}`,
                    borderRadius: '10px',
                    minWidth: '130px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <DollarSign size={14} color={balanceColor} />
                      <span style={{
                        fontSize: '17px', fontWeight: 700,
                        color: balanceColor,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {formatBRL(account.cached_balance)}
                      </span>
                    </div>
                    {account.balance_updated_at && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Atualizado {formatUpdatedAt(account.balance_updated_at)}
                      </span>
                    )}
                    {account.cached_balance == null && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Saldo não sincronizado
                      </span>
                    )}
                  </div>

                  {/* Insights sync status */}
                  {account.is_client_active && (() => {
                    const s = syncStatus(account.last_insights_sync_at);
                    return (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 999,
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
                        Dados {s.label}
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {editingId === account.id ? (
                      <>
                        <button
                          className="btn btn-secondary"
                          onClick={cancelEditing}
                          style={{ padding: '8px 12px', fontSize: '14px' }}
                        >
                          <X size={16} />
                          Cancelar
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => saveNotes(account.id, account.is_client_active)}
                          style={{ padding: '8px 12px', fontSize: '14px' }}
                        >
                          <Save size={16} />
                          Salvar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-secondary"
                          onClick={() => startEditing(account)}
                          style={{ padding: '8px 12px', fontSize: '14px' }}
                        >
                          <Edit2 size={16} />
                          Editar
                        </button>
                        <button
                          className={`btn ${account.is_client_active ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => toggleClientStatus(account.id, account.is_client_active, account.client_notes)}
                          style={{ padding: '8px 12px', fontSize: '14px' }}
                        >
                          {account.is_client_active ? (
                            <>
                              <XCircle size={16} />
                              Desativar
                            </>
                          ) : (
                            <>
                              <CheckCircle size={16} />
                              Ativar
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-muted)' }}>
                  Observações sobre o cliente:
                </label>
                {editingId === account.id ? (
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Ex: Cliente pausou campanha por motivos sazonais. Retorno previsto para março."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                ) : (
                  <p style={{ fontSize: '14px', color: account.client_notes ? 'var(--text)' : 'var(--text-muted)', fontStyle: account.client_notes ? 'normal' : 'italic' }}>
                    {account.client_notes || 'Nenhuma observação registrada'}
                  </p>
                )}
              </div>

              {/* Contact / Report Settings Section */}
              {(() => {
                const contact = contactMap[account.id];
                const isEditingContact = contactEditingId === account.id;
                const hasContact = contact?.client_email || contact?.client_phone || contact?.client_name;
                return (
                  <div style={{ marginTop: '12px', padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', border: isEditingContact ? '1px solid rgba(37,211,102,.2)' : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditingContact ? '16px' : '0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <MessageCircle size={15} color="#25d366" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                          Contato para Relatórios
                        </span>
                        {!isEditingContact && hasContact && (
                          <>
                            {contact?.client_name && (
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                {contact.client_name}
                              </span>
                            )}
                            {contact?.client_email && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--primary)' }}>
                                <Mail size={11} /> {contact.client_email}
                              </span>
                            )}
                            {contact?.client_phone && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#25d366' }}>
                                <MessageCircle size={11} /> {contact.client_phone}
                              </span>
                            )}
                          </>
                        )}
                        {!isEditingContact && !hasContact && (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Não configurado
                          </span>
                        )}
                      </div>
                      {!isEditingContact ? (
                        <button type="button" className="btn btn-secondary"
                          onClick={() => startContactEdit(account)}
                          style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Edit2 size={13} /> {hasContact ? 'Editar' : 'Configurar'}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button type="button" className="btn btn-secondary" onClick={cancelContactEdit}
                            style={{ padding: '6px 12px', fontSize: '13px' }}>
                            <X size={13} /> Cancelar
                          </button>
                          <button type="button" className="btn btn-primary" onClick={() => saveContact(account.id)}
                            disabled={contactSaving}
                            style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', background: '#25d366', borderColor: '#25d366' }}>
                            <Save size={13} /> {contactSaving ? 'Salvando…' : 'Salvar'}
                          </button>
                        </div>
                      )}
                    </div>

                    {isEditingContact && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                            Nome do cliente
                          </label>
                          <input type="text" placeholder="Ex: João Silva" value={contactDraft.client_name}
                            onChange={e => setContactDraft(d => ({ ...d, client_name: e.target.value }))}
                            style={contactInputStyle} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                              <Mail size={10} style={{ display: 'inline', marginRight: '4px' }} /> Email
                            </label>
                            <input type="email" placeholder="cliente@email.com" value={contactDraft.client_email}
                              onChange={e => setContactDraft(d => ({ ...d, client_email: e.target.value }))}
                              style={contactInputStyle} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                              <MessageCircle size={10} style={{ display: 'inline', marginRight: '4px', color: '#25d366' }} /> WhatsApp
                            </label>
                            <input type="text" placeholder="11999998888 ou link do grupo" value={contactDraft.client_phone}
                              onChange={e => setContactDraft(d => ({ ...d, client_phone: e.target.value }))}
                              style={contactInputStyle} />
                          </div>
                        </div>
                        {contactError && (
                          <p style={{ fontSize: '13px', color: 'var(--accent-red)' }}>{contactError}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Billing Settings Section */}
              <div style={{ marginTop: '12px', padding: '16px', background: 'var(--bg-input)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditingBilling ? '16px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={15} color="var(--text-muted)" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Cobrança & Alertas de Saldo
                    </span>
                    {!isEditingBilling && account.payment_type && (
                      <span style={{
                        padding: '2px 8px',
                        background: account.payment_type === 'pix' ? 'rgba(34,197,94,.12)' : 'rgba(99,102,241,.12)',
                        border: `1px solid ${account.payment_type === 'pix' ? 'rgba(34,197,94,.3)' : 'rgba(99,102,241,.3)'}`,
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: account.payment_type === 'pix' ? 'var(--accent-green)' : 'var(--primary)',
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.4px',
                      }}>
                        {account.payment_type === 'pix' ? 'PIX' : 'Cartão'}
                      </span>
                    )}
                    {!isEditingBilling && account.payment_type === 'pix' && account.balance_alert_threshold != null && account.balance_alert_threshold > 0 && (
                      <span style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                      }}>
                        Alerta: {formatBRL(account.balance_alert_threshold)}
                      </span>
                    )}
                    {!isEditingBilling && account.payment_type === 'card' && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Alerta automático para falhas
                      </span>
                    )}
                    {!isEditingBilling && !account.payment_type && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Não configurado
                      </span>
                    )}
                  </div>
                  {!isEditingBilling ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => startBillingEdit(account)}
                      style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Edit2 size={13} />
                      Configurar
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={cancelBillingEdit}
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                      >
                        <X size={13} />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => saveBilling(account.id)}
                        disabled={billingSaving}
                        style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Save size={13} />
                        {billingSaving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline billing form */}
                {isEditingBilling && (
                  <div>
                    {/* Payment type toggle */}
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                        Tipo de pagamento
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setBillingDraft(d => ({ ...d, payment_type: 'pix' }))}
                          style={{
                            padding: '8px 20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            border: billingDraft.payment_type === 'pix'
                              ? '2px solid var(--accent-green)'
                              : '1px solid var(--border)',
                            borderRadius: '8px',
                            background: billingDraft.payment_type === 'pix'
                              ? 'rgba(34,197,94,.12)'
                              : 'var(--bg)',
                            color: billingDraft.payment_type === 'pix'
                              ? 'var(--accent-green)'
                              : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                        >
                          PIX
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillingDraft(d => ({ ...d, payment_type: 'card' }))}
                          style={{
                            padding: '8px 20px',
                            fontSize: '14px',
                            fontWeight: 600,
                            border: billingDraft.payment_type === 'card'
                              ? '2px solid var(--primary)'
                              : '1px solid var(--border)',
                            borderRadius: '8px',
                            background: billingDraft.payment_type === 'card'
                              ? 'rgba(99,102,241,.12)'
                              : 'var(--bg)',
                            color: billingDraft.payment_type === 'card'
                              ? 'var(--primary)'
                              : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                        >
                          Cartão
                        </button>
                      </div>
                    </div>

                    {/* PIX: threshold input */}
                    {billingDraft.payment_type === 'pix' && (
                      <div style={{ marginBottom: '4px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                          Alertar quando saldo ficar abaixo de (R$)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 600 }}>R$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0,00"
                            value={billingDraft.balance_alert_threshold}
                            onChange={e => setBillingDraft(d => ({ ...d, balance_alert_threshold: e.target.value }))}
                            style={{
                              width: '160px',
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              color: 'var(--text)',
                              fontSize: '14px',
                              fontFamily: 'inherit',
                              outline: 'none',
                            }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                            Um alerta crítico será criado quando o saldo atingir esse valor.
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Card: info note */}
                    {billingDraft.payment_type === 'card' && (
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Alertas automáticos para falhas de pagamento serão gerados quando a conta entrar em status de pagamento pendente, período de carência ou encerramento.
                      </p>
                    )}

                    {billingError && (
                      <p style={{ fontSize: '13px', color: 'var(--accent-red)', marginTop: '10px' }}>
                        {billingError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredAccounts.length === 0 && (
          <div className="card-glass" style={{ padding: '48px', textAlign: 'center' }}>
            <Users size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
              {filter === 'active' && 'Nenhuma conta ativa encontrada'}
              {filter === 'inactive' && 'Nenhuma conta inativa encontrada'}
              {filter === 'all' && 'Nenhuma conta encontrada'}
            </p>
          </div>
        )}
      </div>

      {/* Modal — Adicionar conta manualmente */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Adicionar conta manualmente</h2>
              <button type="button" onClick={() => { setShowAddModal(false); setAddError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
              Use para contas vinculadas via Business Manager que não aparecem na sincronização automática.
            </p>
            <form onSubmit={handleAddManual}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                  ID da conta de anúncios
                </label>
                <input
                  type="text"
                  placeholder="ex: 634079826286655"
                  value={addForm.meta_account_id}
                  onChange={e => setAddForm(f => ({ ...f, meta_account_id: e.target.value }))}
                  required
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>
                  Nome da conta
                </label>
                <input
                  type="text"
                  placeholder="ex: CA - Instituto Neuropain"
                  value={addForm.account_name}
                  onChange={e => setAddForm(f => ({ ...f, account_name: e.target.value }))}
                  required
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
              {addError && (
                <p style={{ fontSize: '13px', color: 'var(--accent-red)', marginBottom: '14px' }}>{addError}</p>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAddModal(false); setAddError(''); }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={addLoading}>
                  {addLoading ? 'Adicionando…' : 'Adicionar conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const contactInputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px',
  color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'inherit', outline: 'none',
};
